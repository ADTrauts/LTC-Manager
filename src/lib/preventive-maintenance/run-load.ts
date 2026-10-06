/**
 * Preventive Maintenance Run loaders.
 * Read-only. Does not invoke the generator.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { isKnowledgeProcedureCategory } from "@/lib/knowledge/version-semantics";
import { formatAssetLocationLabel } from "@/lib/asset-operations";
import { isDepartmentAssetOperationsEnabled } from "@/lib/department-operations";
import { prisma } from "@/lib/prisma";
import { preventiveMaintenancePlanHref } from "@/lib/department-administration";

import { resolvePmPlanAuthority, type PmPlanAuthorityDecision } from "./authority";
import { type CivilDate, facilityCivilToday, parseCivilDate } from "./civil-date";
import { addMonthsClamped, projectPmSchedule } from "./schedule";
import { isPmActiveWorkOrderStatus } from "./active-work-order";
import {
  groupPmRunBoard,
  presentPmConfigurationIssue,
  type PmRunBoardCounts,
  type PmRunConfigurationIssue,
  type PmRunRowInput,
  type PmRunWorkOrderSummary,
} from "./run-board";
import { formatCadenceSummary } from "./presentation";

type DbClient = PrismaClient | Prisma.TransactionClient;

const occurrenceInclude = {
  plan: {
    select: {
      id: true,
      status: true,
      departmentId: true,
      asset: {
        select: {
          id: true,
          name: true,
          assetCode: true,
          status: true,
          unit: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
    },
  },
  planVersion: {
    select: {
      id: true,
      version: true,
      name: true,
      status: true,
      intervalMonths: true,
      generationLeadDays: true,
      priority: true,
      maintenanceCategoryId: true,
      procedureVersionId: true,
      maintenanceCategory: { select: { label: true, archivedAt: true } },
      procedureVersion: {
        select: {
          version: true,
          title: true,
          status: true,
          article: { select: { title: true, category: true } },
        },
      },
      recordRequirements: {
        select: { templateId: true, templateName: true, templateVersion: true },
        orderBy: { sortOrder: "asc" as const },
      },
    },
  },
  skippedByUser: { select: { displayName: true } },
  workOrders: {
    select: {
      id: true,
      repairCode: true,
      status: true,
      assignedEmployeeId: true,
      priority: true,
      unit: { select: { name: true } },
      space: { select: { name: true } },
      assignedEmployee: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function assigneeLabel(row: {
  assignedEmployee?: { firstName: string; lastName: string } | null;
}): string | null {
  if (!row.assignedEmployee) return null;
  return `${row.assignedEmployee.firstName} ${row.assignedEmployee.lastName}`.trim();
}

function procedureLabel(version: {
  version: number;
  title: string;
  article?: { title: string } | null;
} | null): string | null {
  if (!version) return null;
  return `${version.article?.title || version.title} v${version.version}`;
}

async function diagnoseMissingWorkOrder(
  client: DbClient,
  input: {
    planStatus: string;
    assetStatus: string;
    version: {
      maintenanceCategoryId: string | null;
      maintenanceCategory: { archivedAt: Date | null } | null;
      procedureVersionId: string | null;
      procedureVersion: {
        status: string;
        article: { category: string };
      } | null;
      recordRequirements: Array<{ templateId: string; templateName: string }>;
    };
  },
): Promise<PmRunConfigurationIssue> {
  if (input.planStatus === "RETIRED") {
    return presentPmConfigurationIssue("PLAN_RETIRED", "Plan is retired.");
  }
  if (input.assetStatus === "RETIRED") {
    return presentPmConfigurationIssue("ASSET_RETIRED", "Asset is retired.");
  }
  if (!input.version.maintenanceCategoryId || !input.version.maintenanceCategory) {
    return presentPmConfigurationIssue("CATEGORY_MISSING", "Maintenance category is missing.");
  }
  if (input.version.maintenanceCategory.archivedAt) {
    return presentPmConfigurationIssue("ARCHIVED_CATEGORY", "Maintenance category is archived.");
  }
  if (!input.version.procedureVersionId || !input.version.procedureVersion) {
    return presentPmConfigurationIssue("PROCEDURE_INVALID", "Pinned Procedure is missing.");
  }
  const procedure = input.version.procedureVersion;
  if (!isKnowledgeProcedureCategory(procedure.article.category)) {
    return presentPmConfigurationIssue("PROCEDURE_INVALID", "Pinned Knowledge version is not a Procedure.");
  }
  if (procedure.status !== "PUBLISHED" && procedure.status !== "SUPERSEDED") {
    return presentPmConfigurationIssue(
      "PROCEDURE_INVALID",
      "Pinned Procedure version is not historically published.",
    );
  }
  for (const requirement of input.version.recordRequirements) {
    const template = await client.operationalTemplate.findFirst({
      where: { id: requirement.templateId },
      select: { id: true },
    });
    if (!template) {
      return presentPmConfigurationIssue(
        "TEMPLATE_MISSING",
        `Required Record template ${requirement.templateName} is missing.`,
      );
    }
  }
  return presentPmConfigurationIssue("WORK_ORDER_MISSING", "Work Order could not be generated.");
}

function toWorkOrders(
  rows: Array<{
    id: string;
    repairCode: string;
    status: string;
    assignedEmployeeId: string | null;
    priority: string;
    assignedEmployee: { firstName: string; lastName: string } | null;
  }>,
): PmRunWorkOrderSummary[] {
  return rows.map((row) => ({
    id: row.id,
    repairCode: row.repairCode,
    status: row.status,
    assignedEmployeeId: row.assignedEmployeeId,
    assigneeLabel: assigneeLabel(row),
    priority: row.priority,
  }));
}

function snapshotLocation(wo: {
  unit: { name: string };
  space: { name: string } | null;
} | null): string | null {
  if (!wo) return null;
  return formatAssetLocationLabel({
    unitName: wo.unit.name,
    spaceName: wo.space?.name ?? null,
  });
}

export async function loadPlantRunDepartment(session: AppJwtPayload, client: DbClient = prisma) {
  const department = await client.department.findFirst({
    where: { facilityId: session.facilityId, key: "PLANT", isActive: true },
    select: { id: true, key: true, name: true },
  });
  if (!department) return null;
  if (!isDepartmentAssetOperationsEnabled(department.key)) return null;
  return department;
}

async function occurrenceToRow(
  client: DbClient,
  occurrence: Prisma.PreventiveMaintenanceOccurrenceGetPayload<{ include: typeof occurrenceInclude }>,
  facilityToday: CivilDate,
): Promise<PmRunRowInput> {
  const active = occurrence.workOrders.find((row) => isPmActiveWorkOrderStatus(row.status)) ?? null;
  const locationFromWo = snapshotLocation(active);
  const currentAssetLocation = formatAssetLocationLabel({
    unitName: occurrence.plan.asset.unit.name,
    spaceName: occurrence.plan.asset.space?.name ?? null,
  });
  let configurationIssue: PmRunConfigurationIssue | null = null;
  if (occurrence.status === "OPEN" && !active && occurrence.workOrders.length === 0) {
    configurationIssue = await diagnoseMissingWorkOrder(client, {
      planStatus: occurrence.plan.status,
      assetStatus: occurrence.plan.asset.status,
      version: occurrence.planVersion,
    });
  }
  return {
    occurrenceId: occurrence.id,
    planId: occurrence.plan.id,
    planName: occurrence.planVersion.name,
    planStatus: occurrence.plan.status,
    assetName: occurrence.plan.asset.name,
    assetCode: occurrence.plan.asset.assetCode,
    assetStatus: occurrence.plan.asset.status,
    locationLabel: locationFromWo ?? currentAssetLocation,
    locationIsPreview: !locationFromWo,
    scheduledDate: parseCivilDate(occurrence.scheduledDate),
    occurrenceStatus: occurrence.status,
    generationLeadDays: occurrence.planVersion.generationLeadDays,
    facilityToday,
    categoryLabel: occurrence.planVersion.maintenanceCategory?.label ?? null,
    priority: occurrence.planVersion.priority,
    procedureLabel: procedureLabel(occurrence.planVersion.procedureVersion),
    workOrders: toWorkOrders(occurrence.workOrders),
    skipReason: occurrence.skipReason,
    skippedAt: occurrence.skippedAt ? occurrence.skippedAt.toISOString() : null,
    skippedByLabel: occurrence.skippedByUser?.displayName ?? null,
    completedAt: occurrence.completedAt ? occurrence.completedAt.toISOString() : null,
    configurationIssue,
  };
}

export async function loadPmRunBoard(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    now?: Date;
    client?: DbClient;
  },
): Promise<{
  authority: PmPlanAuthorityDecision;
  facilityToday: CivilDate;
  departmentId: string;
  publishedPlanCount: number;
  grouped: ReturnType<typeof groupPmRunBoard>;
  counts: PmRunBoardCounts;
}> {
  const client = input.client ?? prisma;
  const authority = await resolvePmPlanAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  const facility = await client.facility.findFirst({
    where: { id: input.facilityId },
    select: { timezone: true },
  });
  const facilityToday = facilityCivilToday(facility?.timezone, input.now);

  if (!authority.canView) {
    return {
      authority,
      facilityToday,
      departmentId: input.departmentId,
      publishedPlanCount: 0,
      grouped: groupPmRunBoard([]),
      counts: groupPmRunBoard([]).counts,
    };
  }

  const plans = await client.preventiveMaintenancePlan.findMany({
    where: { facilityId: input.facilityId, departmentId: input.departmentId },
    include: {
      asset: {
        select: {
          name: true,
          assetCode: true,
          status: true,
          unit: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
      versions: {
        where: { status: { in: ["PUBLISHED", "SUPERSEDED"] } },
        select: {
          id: true,
          status: true,
          effectiveDate: true,
          intervalMonths: true,
          anchorDate: true,
          generationLeadDays: true,
          name: true,
          priority: true,
          maintenanceCategory: { select: { label: true } },
          procedureVersion: {
            select: { version: true, title: true, article: { select: { title: true } } },
          },
        },
        orderBy: { version: "asc" },
      },
      occurrences: {
        include: occurrenceInclude,
        orderBy: { scheduledDate: "asc" },
      },
    },
  });

  const publishedPlanCount = plans.filter((row) => row.status === "PUBLISHED").length;
  const rows: PmRunRowInput[] = [];
  const through = addMonthsClamped(facilityToday, 12);

  for (const plan of plans) {
    for (const occurrence of plan.occurrences) {
      rows.push(await occurrenceToRow(client, occurrence, facilityToday));
    }
    if (plan.status !== "PUBLISHED") continue;
    const have = new Set(plan.occurrences.map((row) => parseCivilDate(row.scheduledDate)));
    const projected = projectPmSchedule(
      plan.versions.map((row) => ({
        id: row.id,
        status: row.status,
        effectiveDate: row.effectiveDate,
        intervalMonths: row.intervalMonths,
        anchorDate: row.anchorDate,
      })),
      { fromInclusive: facilityToday, throughInclusive: through },
    );
    const currentLocation = formatAssetLocationLabel({
      unitName: plan.asset.unit.name,
      spaceName: plan.asset.space?.name ?? null,
    });
    for (const item of projected) {
      if (have.has(item.scheduledDate)) continue;
      if (parseCivilDate(item.scheduledDate) === facilityToday) continue;
      const version = plan.versions.find((row) => row.id === item.planVersionId);
      if (!version) continue;
      rows.push({
        occurrenceId: null,
        planId: plan.id,
        planName: version.name,
        planStatus: plan.status,
        assetName: plan.asset.name,
        assetCode: plan.asset.assetCode,
        assetStatus: plan.asset.status,
        locationLabel: currentLocation,
        locationIsPreview: true,
        scheduledDate: item.scheduledDate,
        occurrenceStatus: "PROJECTED",
        generationLeadDays: version.generationLeadDays,
        facilityToday,
        categoryLabel: version.maintenanceCategory?.label ?? null,
        priority: version.priority,
        procedureLabel: procedureLabel(version.procedureVersion),
        workOrders: [],
        skipReason: null,
        skippedAt: null,
        skippedByLabel: null,
        completedAt: null,
        configurationIssue: null,
      });
    }
  }

  const grouped = groupPmRunBoard(rows);
  return {
    authority,
    facilityToday,
    departmentId: input.departmentId,
    publishedPlanCount,
    grouped,
    counts: grouped.counts,
  };
}

export async function loadPmOccurrenceDetail(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    occurrenceId: string;
    now?: Date;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePmPlanAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  const facility = await client.facility.findFirst({
    where: { id: input.facilityId },
    select: { timezone: true },
  });
  const facilityToday = facilityCivilToday(facility?.timezone, input.now);
  const occurrence = await client.preventiveMaintenanceOccurrence.findFirst({
    where: {
      id: input.occurrenceId,
      plan: { facilityId: input.facilityId, departmentId: input.departmentId },
    },
    include: occurrenceInclude,
  });
  if (!occurrence) return { authority, facilityToday, row: null as PmRunRowInput | null, planHref: null as string | null, cadenceSummary: null as string | null, versionNumber: null as number | null };

  const row = await occurrenceToRow(client, occurrence, facilityToday);
  return {
    authority,
    facilityToday,
    row,
    planHref: preventiveMaintenancePlanHref(input.departmentId, occurrence.plan.id),
    cadenceSummary: formatCadenceSummary(occurrence.planVersion.intervalMonths),
    versionNumber: occurrence.planVersion.version,
  };
}
