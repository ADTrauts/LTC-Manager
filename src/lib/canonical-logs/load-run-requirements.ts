/**
 * Load today's canonical Log requirements for RUN.
 */

import type { PrismaClient } from "@prisma/client";

import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import { dedupeLocationLogRequirements } from "./log-operational-type-applicability";
import { loadPublishedCyclesForLogsOnDate } from "./load-published-cycles-for-logs";
import { resolveLogRequirementsForAttachment } from "./resolve-log-requirements";
import { resolveAttachmentTargetLabel } from "./target-labels";
import {
  presentRunLogRequirement,
  type RunAdHocAttachmentView,
  type RunLogRequirementView,
  type UpcomingRunLogView,
} from "./run-presentation";
import { describeAttachmentStart } from "./effective-from";

type Db = PrismaClient;

export async function loadFacilityRunLogRequirements(input: {
  client: Db;
  session: AppJwtPayload;
  facilityId: string;
  /** Null = facility-wide (All Departments). */
  departmentId: string | null;
  now?: Date;
}): Promise<{
  operationalDateKey: string;
  requirements: RunLogRequirementView[];
  adHocAttachments: RunAdHocAttachmentView[];
  upcoming: UpcomingRunLogView[];
  otherDepartmentNames: string[];
  timezone: string;
}> {
  if (!isCanonicalLogsEnabled()) {
    return {
      operationalDateKey: toServiceDateKey(new Date()),
      requirements: [],
      adHocAttachments: [],
      upcoming: [],
      otherDepartmentNames: [],
      timezone: "UTC",
    };
  }

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(input.client, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const isManager = hasAtLeastRole(input.session.role, "MANAGER");
  const todayDate = new Date(`${operationalDateKey}T00:00:00.000Z`);

  const attachments = await input.client.logAttachment.findMany({
    where: {
      facilityId: input.facilityId,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      effectiveFrom: { lte: todayDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: todayDate } }],
    },
    include: {
      dailyWindows: { orderBy: { displaySequence: "asc" } },
      cycleSelections: { orderBy: { displaySequence: "asc" } },
      catalogDefinition: {
        include: { fields: { orderBy: { displaySequence: "asc" } } },
      },
    },
  });

  const departmentIds = [
    ...new Set(
      [
        input.departmentId,
        ...attachments.map((a) => a.departmentId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const publishedCyclesByDepartment = new Map<string, Awaited<ReturnType<typeof loadPublishedCyclesForLogsOnDate>>>();
  for (const departmentId of departmentIds) {
    publishedCyclesByDepartment.set(
      departmentId,
      await loadPublishedCyclesForLogsOnDate({
        client: input.client,
        facilityId: input.facilityId,
        departmentId,
        operationalDateKey,
        timezone,
      }),
    );
  }

  const attachmentIds = attachments.map((a) => a.id);
  const existingRecords =
    attachmentIds.length === 0
      ? []
      : await input.client.operationalEvidenceRecord.findMany({
          where: {
            facilityId: input.facilityId,
            ...(input.departmentId ? { departmentId: input.departmentId } : {}),
            operationalDate: todayDate,
            logAttachmentId: { in: attachmentIds },
          },
          select: {
            id: true,
            requirementKey: true,
            logRequirementKey: true,
            status: true,
          },
        });

  const requirements: RunLogRequirementView[] = [];
  const adHocAttachments: RunAdHocAttachmentView[] = [];
  const collected: ReturnType<typeof resolveLogRequirementsForAttachment> = [];
  const presented: Array<{
    requirement: (typeof collected)[number];
    catalogDefinitionName: string;
    localDisplayLabel: string | null;
    localInstructions: string | null;
    catalogInstructions: string | null;
    targetLabel: string;
  }> = [];
  const spaceLabels = new Map<string, string>();

  function catalogForResolve(attachment: (typeof attachments)[number]) {
    return {
      id: attachment.catalogDefinition.id,
      name: attachment.catalogDefinition.name,
      purposeType: attachment.catalogDefinition.purposeType,
      instructions: attachment.catalogDefinition.instructions,
      status: attachment.catalogDefinition.status,
      fields: attachment.catalogDefinition.fields.map((f) => ({
        fieldKey: f.fieldKey,
        label: f.label,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        displaySequence: f.displaySequence,
        helpText: f.helpText,
        unitLabel: f.unitLabel,
        minNumber: f.minNumber,
        maxNumber: f.maxNumber,
        allowedSelections: f.allowedSelections,
        correctiveActionTrigger: f.correctiveActionTrigger,
        correctiveActionRequired: f.correctiveActionRequired,
      })),
    };
  }

  for (const attachment of attachments) {
    const targetLabel =
      (
        await resolveAttachmentTargetLabel(input.client, {
          facilityId: input.facilityId,
          targetKind: attachment.targetKind,
          assetId: attachment.assetId,
          spaceId: attachment.spaceId,
          unitId: attachment.unitId,
          targetDepartmentId: attachment.targetDepartmentId,
          operationalTypeKey: attachment.operationalTypeKey,
          departmentId: attachment.departmentId,
        })
      )?.title ?? "Target";

    if (attachment.timingMode === "AD_HOC") {
      const catalogName = attachment.catalogDefinition.name;
      adHocAttachments.push({
        attachmentId: attachment.id,
        departmentId: attachment.departmentId,
        displayName: attachment.localDisplayLabel?.trim() || catalogName,
        catalogDefinitionName: catalogName,
        targetLabel,
        startHref: `/staffing/logs/adhoc/${attachment.id}`,
      });
      continue;
    }

    if (attachment.targetKind === "OPERATIONAL_TYPE") {
      continue;
    }

    const spaceIds = [null];

    for (const spaceId of spaceIds) {
      const resolved = resolveLogRequirementsForAttachment({
        attachment: {
          ...attachment,
          resolvedSpaceId: spaceId,
          catalogDefinition: catalogForResolve(attachment),
        },
        operationalDateKey,
        now,
        facilityTimezone: timezone,
        publishedCycles: publishedCyclesByDepartment.get(attachment.departmentId) ?? [],
        existingRecords,
      });

      for (const req of resolved) {
        if (req.productState === "NEEDS_SETUP" && !isManager) continue;
        collected.push(req);
        presented.push({
          requirement: req,
          catalogDefinitionName: attachment.catalogDefinition.name,
          localDisplayLabel: attachment.localDisplayLabel,
          localInstructions: attachment.localInstructions,
          catalogInstructions: attachment.catalogDefinition.instructions,
          targetLabel: spaceId ? (spaceLabels.get(spaceId) ?? targetLabel) : targetLabel,
        });
      }
    }
  }

  const kept = new Set(dedupeLocationLogRequirements(collected).map((row) => row.requirementKey));
  for (const item of presented) {
    if (!kept.has(item.requirement.requirementKey)) continue;
    requirements.push(
      presentRunLogRequirement({
        requirement: item.requirement,
        catalogDefinitionName: item.catalogDefinitionName,
        localDisplayLabel: item.localDisplayLabel,
        localInstructions: item.localInstructions,
        catalogInstructions: item.catalogInstructions,
        targetLabel: item.targetLabel,
        isManager,
      }),
    );
  }

  const upcomingRows = await input.client.logAttachment.findMany({
    where: {
      facilityId: input.facilityId,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      status: { not: "RETIRED" },
      effectiveFrom: { gt: todayDate },
    },
    orderBy: { effectiveFrom: "asc" },
    take: 24,
    select: {
      localDisplayLabel: true,
      effectiveFrom: true,
      targetKind: true,
      assetId: true,
      spaceId: true,
      unitId: true,
      targetDepartmentId: true,
      operationalTypeKey: true,
      catalogDefinition: { select: { name: true } },
    },
  });

  const upcoming: UpcomingRunLogView[] = [];
  for (const row of upcomingRows) {
    const fromKey = toServiceDateKey(row.effectiveFrom);
    const start = describeAttachmentStart({ effectiveFromKey: fromKey, todayKey: operationalDateKey });
    const targetLabel =
      (
        await resolveAttachmentTargetLabel(input.client, {
          facilityId: input.facilityId,
          targetKind: row.targetKind,
          assetId: row.assetId,
          spaceId: row.spaceId,
          unitId: row.unitId,
          targetDepartmentId: row.targetDepartmentId,
          operationalTypeKey: row.operationalTypeKey,
          departmentId: undefined,
        })
      )?.title ?? null;
    upcoming.push({
      displayName: row.localDisplayLabel?.trim() || row.catalogDefinition.name,
      startsOnLabel: start.startsOnLabel ?? start.effectiveLabel,
      targetLabel,
    });
  }

  let otherDepartmentNames: string[] = [];
  if (
    input.departmentId &&
    requirements.length === 0 &&
    adHocAttachments.length === 0 &&
    upcoming.length === 0
  ) {
    const others = await input.client.logAttachment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: { not: input.departmentId },
        status: { not: "RETIRED" },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: todayDate } }],
      },
      distinct: ["departmentId"],
      select: { departmentId: true, department: { select: { name: true } } },
      take: 8,
    });
    otherDepartmentNames = [
      ...new Set(others.map((row) => row.department?.name).filter((name): name is string => Boolean(name))),
    ];
  }

  return {
    operationalDateKey,
    requirements,
    adHocAttachments,
    upcoming,
    otherDepartmentNames,
    timezone,
  };
}

export async function loadRunLogRequirementByKey(input: {
  client: Db;
  session: AppJwtPayload;
  facilityId: string;
  attachmentId: string;
  requirementKey: string;
  now?: Date;
}): Promise<RunLogRequirementView | null> {
  const attachment = await input.client.logAttachment.findFirst({
    where: { id: input.attachmentId, facilityId: input.facilityId },
    select: { departmentId: true },
  });
  if (!attachment) return null;

  const bundle = await loadFacilityRunLogRequirements({
    client: input.client,
    session: input.session,
    facilityId: input.facilityId,
    departmentId: attachment.departmentId,
    now: input.now,
  });

  return bundle.requirements.find((r) => r.requirementKey === input.requirementKey) ?? null;
}
