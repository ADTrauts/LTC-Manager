/**
 * Batch prefetch for Runtime Location State.
 * One query set per request scope. No per-space domain loads.
 */

import {
  OPEN_ASSET_ISSUE_STATUSES,
  OPEN_WORK_ORDER_STATUSES,
  normalizeAssetStatus,
} from "@/lib/asset-operations/types";
import type { ExistingLogEvidenceForResolve, LogAttachmentForResolve } from "@/lib/canonical-logs/resolve-log-requirements";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import { loadPublishedRunModel } from "@/lib/operational-cycles/load-run-operation-presentation";
import { loadSpaceOperationalTypeAssignments } from "@/lib/operational-cycles/load-operational-type-targets";
import type { PublishedCycleForLogs } from "@/lib/canonical-logs/resolve-log-requirements";
import { prisma } from "@/lib/prisma";
import type { CoverageAssignmentActual, CoverageTemplateVersionRow } from "@/lib/scheduling/coverage-expectations";
import { isCanonicalLogsEnabled, isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { localHhMmFromInstant } from "@/lib/operational-cycles/key-time-day-expectation";

import type { RuntimeLocationComposeInput, RuntimePublishedRunModel } from "./compose";
import { resolveEvidenceRequirementsForSpaces } from "./evidence";
import type {
  LoadRuntimeLocationStatesInput,
  RuntimeAssetFact,
  RuntimeAssetIssueFact,
  RuntimeLocationPrefetchStats,
  RuntimeLocationSpaceRef,
} from "./types";

export type PrefetchedRuntimeLocationInputs = RuntimeLocationComposeInput & {
  stats: RuntimeLocationPrefetchStats;
};

function emptyStats(): RuntimeLocationPrefetchStats {
  return {
    publishedRunModelLoads: 0,
    coveragePrefetchSets: 0,
    evidenceAttachmentQueries: 0,
    assetIssueQueries: 0,
    spaceIdentityQueries: 0,
    perSpaceDomainLoads: 0,
  };
}

function uniqueIds(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function toCoverageTemplates(
  rows: Array<{
    id: string;
    stableKey: string;
    version: number;
    status: string;
    isActive: boolean;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    items: Array<{
      id: string;
      roleKey: string;
      roleLabel: string;
      requiredCount: number;
      unitId: string | null;
      applicableOperationalTypeKeys: string[];
      applicableOperationalCycleStableKeys: string[];
    }>;
  }>,
): CoverageTemplateVersionRow[] {
  return rows.map((row) => ({
    id: row.id,
    stableKey: row.stableKey,
    version: row.version,
    status: row.status as CoverageTemplateVersionRow["status"],
    isActive: row.isActive,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    items: row.items.map((item) => ({
      id: item.id,
      roleKey: item.roleKey,
      roleLabel: item.roleLabel,
      requiredCount: item.requiredCount,
      unitId: item.unitId,
      applicableOperationalTypeKeys: item.applicableOperationalTypeKeys,
      applicableOperationalCycleStableKeys: item.applicableOperationalCycleStableKeys,
    })),
  }));
}

export async function prefetchRuntimeLocationInputs(
  input: LoadRuntimeLocationStatesInput,
): Promise<PrefetchedRuntimeLocationInputs> {
  const stats = emptyStats();
  const now = input.now ?? new Date();
  const spaceRefs = input.spaceRefs;
  const spaceIds = uniqueIds(spaceRefs.map((row) => row.spaceId));
  const departmentIds = uniqueIds(spaceRefs.map((row) => row.departmentId));
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const nowLocalHhMm = localHhMmFromInstant(now, timezone);
  const serviceDate = getFacilityServiceDate(timezone, now);
  const oaEnabled = input.operationalAssignmentsEnabled ?? isOperationalAssignmentsEnabled();
  const logsEnabled = input.canonicalLogsEnabled ?? isCanonicalLogsEnabled();

  if (spaceIds.length === 0) {
    return {
      facilityId: input.facilityId,
      facilityName: "",
      now,
      operationalDateKey,
      timezone,
      nowLocalHhMm,
      operationalAssignmentsEnabled: oaEnabled,
      spaces: [],
      spaceRefs,
      profilesByDepartmentId: new Map(),
      operationalTypesBySpaceId: new Map(),
      runModelsByDepartmentId: new Map(),
      coverageTemplatesByDepartmentId: new Map(),
      coveragePlanByDepartmentId: new Map(),
      assignmentsByDepartmentId: new Map(),
      evidenceBySpaceId: new Map(),
      assetsBySpaceId: new Map(),
      issuesBySpaceId: new Map(),
      serveryEventsByUnitId: new Map(),
      stats,
    };
  }

  stats.spaceIdentityQueries += 1;
  const [facility, spaces, activeProfiles] = await Promise.all([
    prisma.facility.findFirst({
      where: { id: input.facilityId },
      select: { id: true, displayName: true },
    }),
    prisma.unitSpace.findMany({
      where: { id: { in: spaceIds }, facilityId: input.facilityId },
      select: {
        id: true,
        name: true,
        unitId: true,
        customTypeLabel: true,
        facilityRoomType: { select: { baseTypeKey: true, displayName: true } },
        unit: {
          select: {
            id: true,
            name: true,
            hierarchyRole: true,
            parentUnit: { select: { name: true, hierarchyRole: true } },
          },
        },
      },
    }),
    departmentIds.length === 0
      ? Promise.resolve([])
      : prisma.departmentOperationalProfile.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: { in: departmentIds },
            status: "ACTIVE",
          },
          select: { id: true, departmentId: true, version: true, status: true },
          orderBy: { version: "desc" },
        }),
  ]);

  const refBySpaceId = new Map(spaceRefs.map((row) => [row.spaceId, row] as const));
  const spaceRows = spaces.map((space) => {
    const ref = refBySpaceId.get(space.id);
    const unit = space.unit;
    const parent = unit?.parentUnit ?? null;
    const neighborhoodName =
      ref?.neighborhoodName ??
      (unit?.hierarchyRole === "NEIGHBORHOOD" ? unit.name : null);
    const floorName =
      ref?.floorName ??
      (parent?.hierarchyRole === "FLOOR"
        ? parent.name
        : unit?.hierarchyRole === "FLOOR"
          ? unit.name
          : null);
    return {
      spaceId: space.id,
      name: ref?.displayName?.trim() || space.name,
      unitId: space.unitId ?? ref?.unitId ?? null,
      unitName: unit?.name ?? null,
      departmentId: ref?.departmentId ?? "",
      departmentLabel: ref?.departmentLabel ?? null,
      floorName,
      neighborhoodName,
      roomTypeKey: space.facilityRoomType?.baseTypeKey ?? null,
      roomTypeLabel: space.facilityRoomType?.displayName ?? space.customTypeLabel ?? null,
    };
  });

  const profilesByDepartmentId = new Map<
    string,
    { id: string; version: number; status: "ACTIVE" } | null
  >();
  for (const departmentId of departmentIds) {
    const profile = activeProfiles.find((row) => row.departmentId === departmentId);
    profilesByDepartmentId.set(
      departmentId,
      profile
        ? { id: profile.id, version: profile.version, status: "ACTIVE" }
        : null,
    );
  }

  const operationalTypesBySpaceId = new Map<
    string,
    { key: string; name: string; id: string | null } | null
  >();
  const otByDepartment = await Promise.all(
    departmentIds.map(async (departmentId) => {
      const scopedIds = spaceRows
        .filter((space) => space.departmentId === departmentId)
        .map((space) => space.spaceId);
      const assignments = await loadSpaceOperationalTypeAssignments({
        facilityId: input.facilityId,
        departmentId,
        spaceIds: scopedIds,
        perspective: "runtime",
      });
      return { departmentId, assignments };
    }),
  );
  for (const space of spaceRows) {
    operationalTypesBySpaceId.set(space.spaceId, null);
  }
  for (const { assignments } of otByDepartment) {
    for (const [spaceId, assignment] of assignments) {
      operationalTypesBySpaceId.set(spaceId, {
        key: assignment.key,
        name: assignment.name,
        id: null,
      });
    }
  }

  const runModelsByDepartmentId = new Map<string, RuntimePublishedRunModel>();
  const loadedModels = await Promise.all(
    departmentIds.map(async (departmentId) => {
      stats.publishedRunModelLoads += 1;
      const model = await loadPublishedRunModel({
        facilityId: input.facilityId,
        departmentId,
        now,
      });
      return { departmentId, model };
    }),
  );
  for (const { departmentId, model } of loadedModels) {
    runModelsByDepartmentId.set(departmentId, {
      cycles: model.cycles,
      timings: model.timings,
      provenance: model.provenance,
      timezone: model.timezone,
      operationalDateKey: model.operationalDateKey,
      now: model.now,
      nowLocalHhMm: model.nowLocalHhMm,
    });
  }

  stats.coveragePrefetchSets += 1;
  const [templateRows, planRows, assignmentRows] = oaEnabled
    ? await Promise.all([
        prisma.operationalAssignmentTemplate.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: { in: departmentIds },
          },
          include: {
            items: {
              select: {
                id: true,
                roleKey: true,
                roleLabel: true,
                requiredCount: true,
                unitId: true,
                applicableOperationalTypeKeys: true,
                applicableOperationalCycleStableKeys: true,
              },
            },
          },
        }),
        prisma.operationalAssignmentPlan.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: { in: departmentIds },
            serviceDate,
          },
          select: { departmentId: true, status: true },
        }),
        prisma.operationalAssignment.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: { in: departmentIds },
            serviceDate,
            status: { in: ["PLANNED", "ACTIVE"] },
          },
          select: {
            id: true,
            departmentId: true,
            employeeId: true,
            roleKey: true,
            status: true,
            unitId: true,
            startsAt: true,
            endsAt: true,
            employee: { select: { firstName: true, lastName: true } },
            locations: { select: { unitSpaceId: true } },
          },
        }),
      ])
    : [[], [], []];

  const coverageTemplatesByDepartmentId = new Map<string, CoverageTemplateVersionRow[]>();
  const coveragePlanByDepartmentId = new Map<string, string | null>();
  const assignmentsByDepartmentId = new Map<string, CoverageAssignmentActual[]>();
  for (const departmentId of departmentIds) {
    coverageTemplatesByDepartmentId.set(departmentId, []);
    coveragePlanByDepartmentId.set(departmentId, null);
    assignmentsByDepartmentId.set(departmentId, []);
  }
  if (oaEnabled) {
    for (const departmentId of departmentIds) {
      coverageTemplatesByDepartmentId.set(
        departmentId,
        toCoverageTemplates(templateRows.filter((row) => row.departmentId === departmentId)),
      );
      coveragePlanByDepartmentId.set(
        departmentId,
        planRows.find((row) => row.departmentId === departmentId)?.status ?? null,
      );
      assignmentsByDepartmentId.set(
        departmentId,
        assignmentRows
          .filter((row) => row.departmentId === departmentId)
          .map((row) => ({
            id: row.id,
            roleKey: row.roleKey,
            status: row.status,
            unitId: row.unitId,
            coveredSpaceIds: row.locations.map((location) => location.unitSpaceId),
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            employeeId: row.employeeId,
            employeeDisplayName:
              `${row.employee.firstName} ${row.employee.lastName}`.trim() || null,
          })),
      );
    }
  }

  const assetsBySpaceId = new Map<string, RuntimeAssetFact[]>();
  const issuesBySpaceId = new Map<string, RuntimeAssetIssueFact[]>();
  for (const spaceId of spaceIds) {
    assetsBySpaceId.set(spaceId, []);
    issuesBySpaceId.set(spaceId, []);
  }

  stats.assetIssueQueries += 1;
  const assets = await prisma.asset.findMany({
    where: {
      spaceId: { in: spaceIds },
      unit: { facilityId: input.facilityId },
    },
    select: { id: true, name: true, status: true, spaceId: true },
  });
  const assetIds = assets.map((asset) => asset.id);
  const [openIssues, openWorkOrders] =
    assetIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.assetIssue.findMany({
            where: {
              facilityId: input.facilityId,
              assetId: { in: assetIds },
              status: { in: OPEN_ASSET_ISSUE_STATUSES },
            },
            select: {
              id: true,
              assetId: true,
              spaceId: true,
              summary: true,
              operationalImpact: true,
            },
          }),
          prisma.repair.groupBy({
            by: ["assetId"],
            where: {
              assetId: { in: assetIds },
              unit: { facilityId: input.facilityId },
              status: { in: OPEN_WORK_ORDER_STATUSES },
            },
            _count: { _all: true },
          }),
        ]);

  const issueCountByAsset = new Map<string, number>();
  for (const issue of openIssues) {
    issueCountByAsset.set(issue.assetId, (issueCountByAsset.get(issue.assetId) ?? 0) + 1);
  }
  const woCountByAsset = new Map(
    openWorkOrders
      .filter((row): row is typeof row & { assetId: string } => Boolean(row.assetId))
      .map((row) => [row.assetId, row._count._all] as const),
  );

  for (const asset of assets) {
    if (!asset.spaceId) continue;
    const list = assetsBySpaceId.get(asset.spaceId) ?? [];
    list.push({
      assetId: asset.id,
      name: asset.name,
      status: normalizeAssetStatus(asset.status),
      openIssueCount: issueCountByAsset.get(asset.id) ?? 0,
      openWorkOrderCount: woCountByAsset.get(asset.id) ?? 0,
    });
    assetsBySpaceId.set(asset.spaceId, list);
  }
  for (const issue of openIssues) {
    const spaceId =
      issue.spaceId ?? assets.find((asset) => asset.id === issue.assetId)?.spaceId ?? null;
    if (!spaceId) continue;
    const list = issuesBySpaceId.get(spaceId) ?? [];
    list.push({
      issueId: issue.id,
      assetId: issue.assetId,
      impact: issue.operationalImpact,
      summary: issue.summary,
      href: `/asset-issues/${issue.id}`,
    });
    issuesBySpaceId.set(spaceId, list);
  }

  const unitIds = uniqueIds(spaceRows.map((space) => space.unitId));
  const serveryEvents =
    unitIds.length === 0
      ? []
      : await prisma.serveryMealServiceEvent.findMany({
          where: {
            unitId: { in: unitIds },
            serviceDate,
          },
          select: {
            id: true,
            unitId: true,
            mealType: true,
            mealServiceReadyAt: true,
            mealServiceStartedAt: true,
            readyRecordedAt: true,
            startedRecordedAt: true,
          },
        });
  const serveryEventsByUnitId = new Map<string, typeof serveryEvents>();
  for (const event of serveryEvents) {
    const list = serveryEventsByUnitId.get(event.unitId) ?? [];
    list.push(event);
    serveryEventsByUnitId.set(event.unitId, list);
  }

  const evidenceBySpaceId = new Map<string, ReturnType<typeof resolveEvidenceRequirementsForSpaces> extends Map<string, infer V> ? V : never>();
  if (logsEnabled) {
    stats.evidenceAttachmentQueries += 1;
    const todayDate = new Date(`${operationalDateKey}T00:00:00.000Z`);
    const attachments = await prisma.logAttachment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: { in: departmentIds },
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
    const attachmentIds = attachments.map((row) => row.id);
    const existingRecords: ExistingLogEvidenceForResolve[] =
      attachmentIds.length === 0
        ? []
        : await prisma.operationalEvidenceRecord.findMany({
            where: {
              facilityId: input.facilityId,
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

    const resolvedAttachments: LogAttachmentForResolve[] = attachments.map((row) => ({
      id: row.id,
      stableKey: row.stableKey,
      facilityId: row.facilityId,
      departmentId: row.departmentId,
      catalogStableKey: row.catalogStableKey,
      catalogVersion: row.catalogVersion,
      status: row.status,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      timingMode: row.timingMode,
      allowAdHoc: row.allowAdHoc,
      calendarCadence: row.calendarCadence,
      calendarDaysOfWeek: row.calendarDaysOfWeek,
      calendarDayOfMonth: row.calendarDayOfMonth,
      calendarDueTimeLocal: row.calendarDueTimeLocal,
      localDisplayLabel: row.localDisplayLabel,
      localInstructions: row.localInstructions,
      targetKind: row.targetKind,
      assetId: row.assetId,
      spaceId: row.spaceId,
      unitId: row.unitId,
      targetDepartmentId: row.targetDepartmentId,
      operationalTypeKey: row.operationalTypeKey,
      dailyWindows: row.dailyWindows,
      cycleSelections: row.cycleSelections,
      catalogDefinition: {
        id: row.catalogDefinition.id,
        name: row.catalogDefinition.name,
        purposeType: row.catalogDefinition.purposeType,
        instructions: row.catalogDefinition.instructions,
        status: row.catalogDefinition.status,
        fields: row.catalogDefinition.fields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          displaySequence: field.displaySequence,
          helpText: field.helpText,
          unitLabel: field.unitLabel,
          minNumber: field.minNumber,
          maxNumber: field.maxNumber,
          allowedSelections: field.allowedSelections,
          correctiveActionTrigger: field.correctiveActionTrigger,
          correctiveActionRequired: field.correctiveActionRequired,
        })),
      },
    }));

    const publishedCyclesByDepartmentId = new Map<string, PublishedCycleForLogs[]>();
    for (const departmentId of departmentIds) {
      const model = runModelsByDepartmentId.get(departmentId);
      const cycles: PublishedCycleForLogs[] = [];
      for (const cycle of model?.cycles ?? []) {
        if (cycle.nodeKind !== "PERIOD" || !cycle.startLocal || !cycle.endLocal) continue;
        const window = resolveCycleWindowInstants({
          operationalDateKey,
          startLocal: cycle.startLocal,
          endLocal: cycle.endLocal,
          overnight: cycle.overnight,
          facilityTimezone: timezone,
        });
        if (!window) continue;
        cycles.push({
          stableKey: cycle.stableKey,
          label: cycle.label,
          startLocal: cycle.startLocal,
          endLocal: cycle.endLocal,
          overnight: cycle.overnight,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        });
      }
      publishedCyclesByDepartmentId.set(departmentId, cycles);
    }

    const resolved = resolveEvidenceRequirementsForSpaces({
      attachments: resolvedAttachments,
      spaces: spaceRows.map((space) => ({
        spaceId: space.spaceId,
        departmentId: space.departmentId,
        unitId: space.unitId,
        operationalTypeKey: operationalTypesBySpaceId.get(space.spaceId)?.key ?? null,
        operationalTypeName: operationalTypesBySpaceId.get(space.spaceId)?.name ?? null,
        facilityId: input.facilityId,
      })),
      operationalDateKey,
      now,
      facilityTimezone: timezone,
      publishedCyclesByDepartmentId,
      existingRecords,
    });
    for (const [spaceId, requirements] of resolved) {
      evidenceBySpaceId.set(spaceId, requirements);
    }
  }

  return {
    facilityId: input.facilityId,
    facilityName: facility?.displayName ?? "",
    now,
    operationalDateKey,
    timezone,
    nowLocalHhMm,
    operationalAssignmentsEnabled: oaEnabled,
    spaces: spaceRows,
    spaceRefs,
    profilesByDepartmentId,
    operationalTypesBySpaceId,
    runModelsByDepartmentId,
    coverageTemplatesByDepartmentId,
    coveragePlanByDepartmentId,
    assignmentsByDepartmentId,
    evidenceBySpaceId,
    assetsBySpaceId,
    issuesBySpaceId,
    serveryEventsByUnitId,
    stats,
  };
}

export function spaceRefsFromIds(
  departmentId: string,
  spaceIds: readonly string[],
): RuntimeLocationSpaceRef[] {
  return spaceIds.map((spaceId) => ({ spaceId, departmentId }));
}
