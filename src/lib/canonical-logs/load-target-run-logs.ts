/**
 * Canonical RUN Logs for a single Attachment target (Asset / Room / Unit / Department).
 * Direct target attachments only — Room does not mix Asset Logs from the same space.
 */

import type { LogAttachmentTargetKind, PrismaClient } from "@prisma/client";

import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { dayBefore } from "@/lib/operational-cycles/cycle-lifecycle";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import {
  enumerateServiceDateKeys,
  projectLogExpectationHistory,
  type LogHistorySubmission,
} from "./expectation-history";
import { presentHistoryTable, type TargetRunLogHistoryTable } from "./history-presentation";
import { loadPublishedCyclesForLogsDateRange } from "./load-published-cycles-for-logs";
import { groupLogicalLogAttachments } from "./logical-attachment";
import { dedupeLocationLogRequirements } from "./log-operational-type-applicability";
import {
  resolveLogRequirementsForAttachment,
  type LogAttachmentForResolve,
  type PublishedCycleForLogs,
} from "./resolve-log-requirements";
import {
  presentRunLogRequirement,
  type RunAdHocAttachmentView,
  type RunLogRequirementView,
  type UpcomingRunLogView,
} from "./run-presentation";
import { resolveAttachmentTargetLabel } from "./target-labels";
import { describeAttachmentStart } from "./effective-from";

const attachmentInclude = {
  dailyWindows: { orderBy: { displaySequence: "asc" as const } },
  cycleSelections: { orderBy: { displaySequence: "asc" as const } },
  catalogDefinition: {
    include: { fields: { orderBy: { displaySequence: "asc" as const } } },
  },
};

export type RunTargetRef = {
  kind: Exclude<LogAttachmentTargetKind, "FACILITY" | "OPERATIONAL_TYPE">;
  id: string;
};

export type TargetRunLogsView = {
  operationalDateKey: string;
  targetKind: RunTargetRef["kind"];
  targetLabel: string;
  emptyLabel: string;
  requirements: RunLogRequirementView[];
  adHocAttachments: RunAdHocAttachmentView[];
  upcoming: UpcomingRunLogView[];
  history: TargetRunLogHistoryTable[];
  buildHref: string;
};

/** Direct-target where clause — Room never includes Asset attachments. */
export function targetRunAttachmentWhere(
  facilityId: string,
  target: RunTargetRef,
): {
  facilityId: string;
  targetKind: RunTargetRef["kind"];
  assetId?: string;
  spaceId?: string;
  unitId?: string;
  targetDepartmentId?: string;
} {
  switch (target.kind) {
    case "ASSET":
      return { facilityId, targetKind: "ASSET", assetId: target.id };
    case "SPACE":
      return { facilityId, targetKind: "SPACE", spaceId: target.id };
    case "UNIT":
      return { facilityId, targetKind: "UNIT", unitId: target.id };
    case "DEPARTMENT":
      return { facilityId, targetKind: "DEPARTMENT", targetDepartmentId: target.id };
  }
}

export function targetRunBuildHref(target: RunTargetRef): string {
  switch (target.kind) {
    case "ASSET":
      return `/build/logs/targets/asset/${target.id}`;
    case "SPACE":
      return `/build/logs/targets/space/${target.id}`;
    case "UNIT":
      return `/build/logs/targets/unit/${target.id}`;
    case "DEPARTMENT":
      return `/admin/departments/${target.id}`;
  }
}

function emptyLabelFor(kind: RunTargetRef["kind"]): string {
  switch (kind) {
    case "ASSET":
      return "No Logs due on this asset today.";
    case "SPACE":
      return "No Logs due in this room today.";
    case "UNIT":
      return "No Logs due on this unit today.";
    case "DEPARTMENT":
      return "No Logs due for this department today.";
  }
}

function catalogForResolve(def: {
  id: string;
  name: string;
  purposeType: LogAttachmentForResolve["catalogDefinition"]["purposeType"];
  instructions: string | null;
  status: LogAttachmentForResolve["catalogDefinition"]["status"];
  fields: Array<{
    fieldKey: string;
    label: string;
    fieldType: LogAttachmentForResolve["catalogDefinition"]["fields"][number]["fieldType"];
    isRequired: boolean;
    displaySequence: number;
    helpText: string | null;
    unitLabel: string | null;
    minNumber: number | null;
    maxNumber: number | null;
    allowedSelections: string[];
    correctiveActionTrigger: boolean;
    correctiveActionRequired: boolean;
  }>;
}): LogAttachmentForResolve["catalogDefinition"] {
  return {
    id: def.id,
    name: def.name,
    purposeType: def.purposeType,
    instructions: def.instructions,
    status: def.status,
    fields: def.fields.map((f) => ({
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

async function targetExists(
  client: PrismaClient,
  facilityId: string,
  target: RunTargetRef,
): Promise<boolean> {
  switch (target.kind) {
    case "ASSET":
      return Boolean(
        await client.asset.findFirst({
          where: { id: target.id, unit: { facilityId } },
          select: { id: true },
        }),
      );
    case "SPACE":
      return Boolean(
        await client.unitSpace.findFirst({
          where: { id: target.id, facilityId },
          select: { id: true },
        }),
      );
    case "UNIT":
      return Boolean(
        await client.unit.findFirst({
          where: { id: target.id, facilityId },
          select: { id: true },
        }),
      );
    case "DEPARTMENT":
      return Boolean(
        await client.department.findFirst({
          where: { id: target.id, facilityId },
          select: { id: true },
        }),
      );
  }
}

export async function loadTargetRunLogs(input: {
  client: PrismaClient;
  session: AppJwtPayload;
  facilityId: string;
  target: RunTargetRef;
  historyDays?: number;
  now?: Date;
}): Promise<TargetRunLogsView | null> {
  if (!isCanonicalLogsEnabled()) return null;
  if (!hasAtLeastRole(input.session.role, "STAFF")) return null;
  if (!(await targetExists(input.client, input.facilityId, input.target))) return null;

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(input.client, input.facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const historyDays = Math.min(Math.max(input.historyDays ?? 14, 1), 31);
  let fromKey = todayKey;
  for (let i = 1; i < historyDays; i += 1) fromKey = dayBefore(fromKey);

  const targetLabel =
    (
      await resolveAttachmentTargetLabel(input.client, {
        facilityId: input.facilityId,
        targetKind: input.target.kind,
        assetId: input.target.kind === "ASSET" ? input.target.id : null,
        spaceId: input.target.kind === "SPACE" ? input.target.id : null,
        unitId: input.target.kind === "UNIT" ? input.target.id : null,
        targetDepartmentId: input.target.kind === "DEPARTMENT" ? input.target.id : null,
      })
    )?.title ?? input.target.kind;

  const emptyView = (): TargetRunLogsView => ({
    operationalDateKey: todayKey,
    targetKind: input.target.kind,
    targetLabel,
    emptyLabel: emptyLabelFor(input.target.kind),
    requirements: [],
    adHocAttachments: [],
    upcoming: [],
    history: [],
    buildHref: targetRunBuildHref(input.target),
  });

  const rows = [
    ...(await input.client.logAttachment.findMany({
      where: targetRunAttachmentWhere(input.facilityId, input.target),
      include: attachmentInclude,
    })),
    ...(await loadRuntimeOperationalTypeAttachmentsForTarget({
      client: input.client,
      facilityId: input.facilityId,
      target: input.target,
    })),
  ];
  if (rows.length === 0) return emptyView();

  const isManager = hasAtLeastRole(input.session.role, "MANAGER");
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
  const coveringToday = rows.filter((row) => {
    const from = toServiceDateKey(row.effectiveFrom);
    const to = row.effectiveTo ? toServiceDateKey(row.effectiveTo) : null;
    return from <= todayKey && (!to || todayKey <= to);
  });
  const upcoming: UpcomingRunLogView[] = rows
    .filter((row) => {
      if (row.status === "RETIRED") return false;
      return toServiceDateKey(row.effectiveFrom) > todayKey;
    })
    .map((row) => {
      const fromKey = toServiceDateKey(row.effectiveFrom);
      const start = describeAttachmentStart({ effectiveFromKey: fromKey, todayKey });
      return {
        displayName: row.localDisplayLabel?.trim() || row.catalogDefinition.name,
        startsOnLabel: start.startsOnLabel ?? start.effectiveLabel,
        targetLabel: null,
      };
    });

  const attachmentIds = rows.map((r) => r.id);
  const evidence = await input.client.operationalEvidenceRecord.findMany({
    where: {
      facilityId: input.facilityId,
      logAttachmentId: { in: attachmentIds },
      operationalDate: {
        gte: new Date(`${fromKey}T00:00:00.000Z`),
        lte: todayDate,
      },
    },
    select: {
      id: true,
      logAttachmentId: true,
      requirementKey: true,
      logRequirementKey: true,
      status: true,
      operationalDate: true,
      catalogDefinitionId: true,
      templateVersion: true,
      outOfStandard: true,
      values: {
        select: { valueNumber: true, fieldType: true, fieldKey: true },
        orderBy: { fieldKey: "asc" },
      },
    },
  });

  const submissions: LogHistorySubmission[] = evidence.map((row) => {
    const numeric = row.values.find((v) => v.valueNumber != null);
    const owner = rows.find((r) => r.id === row.logAttachmentId);
    const field = owner?.catalogDefinition.fields.find((f) => f.fieldKey === numeric?.fieldKey);
    return {
      id: row.id,
      requirementKey: row.requirementKey,
      logRequirementKey: row.logRequirementKey,
      status: row.status,
      operationalDateKey: toServiceDateKey(row.operationalDate),
      catalogVersion: row.templateVersion,
      valueNumber: numeric?.valueNumber ?? null,
      unitLabel: field?.unitLabel ?? null,
      outOfStandard: row.outOfStandard,
    };
  });

  const departmentIds = [...new Set(rows.map((row) => row.departmentId))];
  const cyclesByDepartment = new Map<string, Record<string, PublishedCycleForLogs[]>>();
  for (const departmentId of departmentIds) {
    cyclesByDepartment.set(
      departmentId,
      await loadPublishedCyclesForLogsDateRange({
        client: input.client,
        facilityId: input.facilityId,
        departmentId,
        fromDateKey: fromKey,
        toDateKey: todayKey,
        timezone,
      }),
    );
  }

  const todayEvidence = evidence.filter((e) => toServiceDateKey(e.operationalDate) === todayKey);
  const requirements: RunLogRequirementView[] = [];
  const collected: ReturnType<typeof resolveLogRequirementsForAttachment> = [];
  const presented: Array<{
    requirement: (typeof collected)[number];
    catalogDefinitionName: string;
    localDisplayLabel: string | null;
    localInstructions: string | null;
    catalogInstructions: string | null;
  }> = [];
  const adHocAttachments: RunAdHocAttachmentView[] = [];

  for (const attachment of coveringToday) {
    const catalogName = attachment.catalogDefinition.name;
    if (attachment.timingMode === "AD_HOC") {
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

    const todayCycles = cyclesByDepartment.get(attachment.departmentId)?.[todayKey] ?? [];
    const resolved = resolveLogRequirementsForAttachment({
      attachment: {
        ...attachment,
        resolvedSpaceId:
          attachment.targetKind === "OPERATIONAL_TYPE" && input.target.kind === "SPACE"
            ? input.target.id
            : null,
        catalogDefinition: catalogForResolve(attachment.catalogDefinition),
      },
      operationalDateKey: todayKey,
      now,
      facilityTimezone: timezone,
      publishedCycles: todayCycles,
      existingRecords: todayEvidence,
    });

    for (const req of resolved) {
      if (req.productState === "NEEDS_SETUP" && !isManager) continue;
      collected.push(req);
      presented.push({
        requirement: req,
        catalogDefinitionName: catalogName,
        localDisplayLabel: attachment.localDisplayLabel,
        localInstructions: attachment.localInstructions,
        catalogInstructions: attachment.catalogDefinition.instructions,
      });
    }
  }

  const kept = new Set(dedupeLocationLogRequirements(collected).map((row) => row.requirementKey));
  for (const item of presented) {
    if (!kept.has(item.requirement.requirementKey)) continue;
    requirements.push(
      presentRunLogRequirement({
        ...item,
        targetLabel,
        isManager,
      }),
    );
  }

  const dateKeys = enumerateServiceDateKeys(fromKey, todayKey);
  const groups = groupLogicalLogAttachments(rows);
  const history: TargetRunLogHistoryTable[] = [];

  for (const group of groups) {
    const segments = rows.filter(
      (row) => row.id === group.current.id || group.prior.some((p) => p.id === row.id),
    );
    const resolveSegments: LogAttachmentForResolve[] = segments.map((attachment) => ({
      ...attachment,
      resolvedSpaceId:
        attachment.targetKind === "OPERATIONAL_TYPE" && input.target.kind === "SPACE"
          ? input.target.id
          : null,
      catalogDefinition: catalogForResolve(attachment.catalogDefinition),
    }));

    const currentRow = rows.find((r) => r.id === group.current.id)!;
    const publishedCyclesByDate: Record<string, PublishedCycleForLogs[]> = {};
    const deptCycles = cyclesByDepartment.get(currentRow.departmentId) ?? {};
    for (const dateKey of dateKeys) {
      publishedCyclesByDate[dateKey] = deptCycles[dateKey] ?? [];
    }

    const days = projectLogExpectationHistory({
      segments: resolveSegments,
      fromDateKey: fromKey,
      toDateKey: todayKey,
      todayKey,
      now,
      facilityTimezone: timezone,
      publishedCyclesByDate,
      submissions: submissions.filter((s) =>
        segments.some((seg) => {
          const rec = evidence.find((e) => e.id === s.id);
          return rec?.logAttachmentId === seg.id;
        }),
      ),
    });

    history.push(
      presentHistoryTable(
        currentRow.localDisplayLabel?.trim() || currentRow.catalogDefinition.name,
        currentRow.timingMode,
        days,
      ),
    );
  }

  return {
    operationalDateKey: todayKey,
    targetKind: input.target.kind,
    targetLabel,
    emptyLabel: emptyLabelFor(input.target.kind),
    requirements,
    adHocAttachments,
    upcoming,
    history,
    buildHref: targetRunBuildHref(input.target),
  };
}

async function loadRuntimeOperationalTypeAttachmentsForTarget(_input: {
  client: PrismaClient;
  facilityId: string;
  target: RunTargetRef;
}) {
  return [];
}
