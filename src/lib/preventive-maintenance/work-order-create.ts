/**
 * Internal Preventive Work Order construction.
 * No session. System created-by is null. Reuses canonical Location snapshot helpers.
 *
 * Mapping:
 * - title ← Plan Version name
 * - description ← Plan Version instructions, else "Preventive Maintenance / Scheduled {date}"
 * - priority ← Plan Version priority
 * - procedureVersionId ← frozen Plan Version pin (PUBLISHED or SUPERSEDED)
 * - maintenanceCategoryId ← frozen Plan Version category (must still exist, unarchived)
 * - record requirements ← Plan Version requirements (pinned ids/keys/versions/names/sort)
 * - assignedEmployeeId ← default assignee if still eligible, else Unassigned
 * - requesting/responsible department ← Plan department
 * - dueAt/targetDate ← occurrence scheduledDate as UTC midnight (projection only)
 * Canonical scheduled obligation remains PreventiveMaintenanceOccurrence.scheduledDate.
 */

import { Prisma, type PrismaClient, type Repair } from "@prisma/client";

import { isKnowledgeProcedureCategory } from "@/lib/knowledge/version-semantics";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/asset-operations/types";
import {
  nextRepairCode,
  snapshotWorkOrderLocation,
} from "@/lib/asset-operations/work-order-service";
import { newWorkOrderCuid, type DbClient } from "@/lib/asset-operations/work-order-access";
import { isAssetLifecycleRetired } from "@/lib/asset-operations/ownership";
import { prisma } from "@/lib/prisma";

import { isPmActiveWorkOrderStatus } from "./active-work-order";
import { type CivilDate, civilDateParts, civilDateToUtcMidnight, parseCivilDate } from "./civil-date";
import { isPmPlanGenerationEligible } from "./eligibility";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export class PmWorkOrderConfigurationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PmWorkOrderConfigurationError";
    this.code = code;
  }
}

export function formatPmScheduledCopy(date: CivilDate | Date): string {
  const { year, month, day } = civilDateParts(parseCivilDate(date));
  return `${MONTH_LABELS[month - 1]} ${day}, ${year}`;
}

export function preventiveWorkOrderCopy(input: {
  planName: string;
  instructions?: string | null;
  scheduledDate: CivilDate | Date;
}): { title: string; description: string } {
  const title = input.planName.trim() || "Preventive Maintenance";
  const instructions = input.instructions?.trim() || "";
  const description =
    instructions ||
    `Preventive Maintenance\nScheduled ${formatPmScheduledCopy(input.scheduledDate)}`;
  return { title, description };
}

function isUniqueConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function findActiveWorkOrder(client: DbClient, pmOccurrenceId: string) {
  return client.repair.findFirst({
    where: {
      pmOccurrenceId,
      status: { in: [...OPEN_WORK_ORDER_STATUSES] },
    },
  });
}

async function assertHistoricallyPublishedProcedurePin(
  client: DbClient,
  input: { facilityId: string; procedureVersionId: string },
) {
  const version = await client.knowledgeArticleVersion.findFirst({
    where: { id: input.procedureVersionId },
    include: { article: { select: { facilityId: true, category: true } } },
  });
  if (!version) {
    throw new PmWorkOrderConfigurationError(
      "PROCEDURE_INVALID",
      "Pinned Procedure version was not found.",
    );
  }
  if (version.article.facilityId !== input.facilityId) {
    throw new PmWorkOrderConfigurationError(
      "PROCEDURE_INVALID",
      "Pinned Procedure version belongs to another facility.",
    );
  }
  if (!isKnowledgeProcedureCategory(version.article.category)) {
    throw new PmWorkOrderConfigurationError(
      "PROCEDURE_INVALID",
      "Pinned Knowledge version is not a Procedure.",
    );
  }
  if (version.status !== "PUBLISHED" && version.status !== "SUPERSEDED") {
    throw new PmWorkOrderConfigurationError(
      "PROCEDURE_INVALID",
      "Pinned Procedure version is not historically published.",
    );
  }
}

async function resolveDefaultAssignee(
  client: DbClient,
  input: { facilityId: string; employeeId: string | null | undefined; plantDepartmentId: string },
): Promise<string | null> {
  if (!input.employeeId) return null;
  const employee = await client.employee.findFirst({
    where: { id: input.employeeId, facilityId: input.facilityId },
    select: {
      id: true,
      status: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!employee) return null;
  if (employee.status !== "ACTIVE") return null;
  const inPlant =
    employee.primaryDepartmentId === input.plantDepartmentId ||
    employee.employeeDepartments.some((row) => row.departmentId === input.plantDepartmentId);
  if (!inPlant) return null;
  return employee.id;
}

export async function createPreventiveWorkOrderForOccurrence(input: {
  occurrenceId: string;
  client?: DbClient;
  now?: Date;
}): Promise<{ repair: Repair; created: boolean }> {
  const outer = input.client ?? prisma;
  const now = input.now ?? new Date();

  const run = async (tx: DbClient) => {
    const occurrence = await tx.preventiveMaintenanceOccurrence.findFirst({
      where: { id: input.occurrenceId },
      include: {
        plan: {
          include: {
            asset: {
              select: {
                id: true,
                status: true,
                unitId: true,
                spaceId: true,
                unit: { select: { facilityId: true } },
              },
            },
          },
        },
        planVersion: {
          include: {
            recordRequirements: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    if (!occurrence) {
      throw new PmWorkOrderConfigurationError("OCCURRENCE_MISSING", "PM occurrence not found.");
    }
    if (occurrence.status !== "OPEN") {
      throw new PmWorkOrderConfigurationError(
        "OCCURRENCE_NOT_OPEN",
        "Only OPEN occurrences generate Work Orders.",
      );
    }

    const existing = await findActiveWorkOrder(tx, occurrence.id);
    if (existing) return { repair: existing, created: false };

    const plan = occurrence.plan;
    const version = occurrence.planVersion;
    const asset = plan.asset;
    if (!isPmPlanGenerationEligible({ planStatus: plan.status, assetStatus: asset.status })) {
      throw new PmWorkOrderConfigurationError(
        "GENERATION_INELIGIBLE",
        "Plan or Asset is not eligible for Work Order generation.",
      );
    }
    if (asset.unit.facilityId !== plan.facilityId) {
      throw new PmWorkOrderConfigurationError(
        "ASSET_FACILITY_MISMATCH",
        "Asset does not belong to the Plan facility.",
      );
    }
    if (isAssetLifecycleRetired(asset.status)) {
      throw new PmWorkOrderConfigurationError("ASSET_RETIRED", "Asset is retired.");
    }

    if (!version.maintenanceCategoryId) {
      throw new PmWorkOrderConfigurationError(
        "CATEGORY_MISSING",
        "Plan Version has no maintenance category.",
      );
    }
    const category = await tx.maintenanceCategory.findFirst({
      where: { id: version.maintenanceCategoryId, facilityId: plan.facilityId },
    });
    if (!category) {
      throw new PmWorkOrderConfigurationError(
        "CATEGORY_MISSING",
        "Maintenance category was not found for this facility.",
      );
    }
    if (category.archivedAt) {
      throw new PmWorkOrderConfigurationError(
        "ARCHIVED_CATEGORY",
        "Maintenance category is archived.",
      );
    }

    if (!version.procedureVersionId) {
      throw new PmWorkOrderConfigurationError(
        "PROCEDURE_INVALID",
        "Plan Version has no pinned Procedure.",
      );
    }
    await assertHistoricallyPublishedProcedurePin(tx, {
      facilityId: plan.facilityId,
      procedureVersionId: version.procedureVersionId,
    });

    for (const requirement of version.recordRequirements) {
      const template = await tx.operationalTemplate.findFirst({
        where: { id: requirement.templateId },
        select: { id: true },
      });
      if (!template) {
        throw new PmWorkOrderConfigurationError(
          "TEMPLATE_MISSING",
          `Required Record template ${requirement.templateName} is missing.`,
        );
      }
    }

    const location = await snapshotWorkOrderLocation(tx, {
      facilityId: plan.facilityId,
      assetId: asset.id,
    });

    const assignedEmployeeId = await resolveDefaultAssignee(tx, {
      facilityId: plan.facilityId,
      employeeId: version.defaultAssignedEmployeeId,
      plantDepartmentId: plan.departmentId,
    });

    const scheduledDate = parseCivilDate(occurrence.scheduledDate);
    const copy = preventiveWorkOrderCopy({
      planName: version.name,
      instructions: version.instructions,
      scheduledDate,
    });
    const dueAt = civilDateToUtcMidnight(scheduledDate);
    const initialStatus = assignedEmployeeId ? "ASSIGNED" : "OPEN";
    const repairCode = await nextRepairCode(tx);

    const created = await tx.repair.create({
      data: {
        id: newWorkOrderCuid(),
        repairCode,
        assetId: location.assetId,
        unitId: location.unitId,
        spaceId: location.spaceId,
        title: copy.title,
        description: copy.description,
        priority: version.priority,
        status: initialStatus,
        workOrderKind: "PREVENTIVE",
        repairTrade: "GENERAL",
        issueType: "EQUIPMENT",
        requestingDepartmentId: plan.departmentId,
        responsibleDepartmentId: plan.departmentId,
        assignedEmployeeId,
        vendorId: null,
        issueId: null,
        pmOccurrenceId: occurrence.id,
        procedureVersionId: version.procedureVersionId,
        maintenanceCategoryId: category.id,
        dueAt,
        targetDate: dueAt,
        requestedAt: now,
        reportedById: null,
        holdReason: null,
        updates: {
          create: {
            id: newWorkOrderCuid(),
            updateText: "Preventive Maintenance Work Order generated",
            statusAfterUpdate: initialStatus,
            updatedById: null,
          },
        },
        recordRequirements: {
          create: version.recordRequirements.map((requirement) => ({
            id: newWorkOrderCuid(),
            templateId: requirement.templateId,
            templateStableKey: requirement.templateStableKey,
            templateVersion: requirement.templateVersion,
            templateName: requirement.templateName,
            sortOrder: requirement.sortOrder,
            createdByUserId: null,
          })),
        },
      },
    });
    return { repair: created, created: true };
  };

  const startTransaction =
    typeof (outer as PrismaClient).$transaction === "function"
      ? (fn: (tx: DbClient) => ReturnType<typeof run>) =>
          (outer as PrismaClient).$transaction((tx) => fn(tx))
      : (fn: (tx: DbClient) => ReturnType<typeof run>) => fn(outer);

  try {
    return await startTransaction(run);
  } catch (err) {
    if (isUniqueConflict(err)) {
      const existing = await findActiveWorkOrder(outer, input.occurrenceId);
      if (existing && isPmActiveWorkOrderStatus(existing.status)) {
        return { repair: existing, created: false };
      }
    }
    throw err;
  }
}
