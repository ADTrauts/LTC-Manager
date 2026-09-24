/**
 * Load inspect-only overlays for Effective Location Program.
 * Reuses published cycle / work-plan loaders. Does not mutate configuration.
 *
 * These loaders are Build preview: they resolve Operational Type from the
 * working profile/bindings the caller supplies (typically the DRAFT).
 * Runtime must load assignments with perspective: "runtime" instead.
 */

import {
  describeCycleApplicability,
  matchCycleApplicability,
  primaryCycleApplicabilitySource,
} from "@/lib/operational-cycles/cycle-applicability";
import { buildCyclesByStableKey } from "@/lib/operational-cycles/effective-cycle-spaces";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { loadPublishedWorkPlansForResolve } from "@/lib/department-work/load-runtime-work";
import { formatTimingSummary } from "@/lib/canonical-logs/timing-display";
import {
  dedupeLocationLogMatches,
  describeLogApplicability,
  matchLogAttachmentToLocation,
  overlaySourceFromLogMatch,
  type LocationLogAttachmentRow,
} from "@/lib/canonical-logs/log-operational-type-applicability";
import {
  dedupeTeamLocationMatches,
  matchTeamToLocation,
  overlaySourceFromTeamMatch,
  type TeamApplicabilityRow,
} from "@/lib/department-teams/team-operational-type-applicability";
import {
  flattenCoverageTemplateItems,
  resolveCoverageExpectationsForLocation,
  selectWorkingCoverageTemplates,
  type CoverageTemplateVersionRow,
} from "@/lib/scheduling/coverage-expectations";
import type { SpaceType, UnitType } from "@prisma/client";

import {
  emptyLocationOverlays,
  resolveEffectiveLocationProgram,
  type EffectiveLocationKind,
  type EffectiveCoverageExpectationItem,
  type EffectiveLocationOverlays,
  type EffectiveLocationProgram,
  type OverlayApplicabilityMechanism,
} from "./effective-location-program";
import type { DepartmentActionableLocation } from "./department-locations";
import type {
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionSnapshot,
} from "./profile-types";

function overlay(
  id: string,
  label: string,
  mechanism: OverlayApplicabilityMechanism,
  detail: string,
  source: EffectiveLocationOverlays["cycles"][number]["provenance"]["source"] = "EXPLICIT_APPLICABILITY",
): EffectiveLocationOverlays["cycles"][number] {
  return {
    id,
    label,
    provenance: {
      source,
      mechanism,
      detail,
    },
  };
}

function logTimingDetail(row: {
  timingMode: string;
  dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleSelections: Array<{ cycleStableKey: string }>;
  calendarCadence: string | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal?: string | null;
  allowAdHoc: boolean;
  cycleLabelByKey: ReadonlyMap<string, string>;
}): string | null {
  const cycleLabels = row.cycleSelections
    .map((sel) => row.cycleLabelByKey.get(sel.cycleStableKey))
    .filter((label): label is string => Boolean(label));
  if (row.timingMode === "OPERATIONAL_CYCLE" && cycleLabels.length > 0) {
    return cycleLabels.join(", ");
  }
  const summary = formatTimingSummary({
    timingMode: row.timingMode as "DAILY_WINDOWS" | "OPERATIONAL_CYCLE" | "CALENDAR" | "AD_HOC",
    recommendedCadence: null,
    dailyWindows: row.dailyWindows,
    cycleLabels,
    calendarCadence: row.calendarCadence as "DAILY" | "WEEKLY" | "MONTHLY" | null,
    calendarDaysOfWeek: row.calendarDaysOfWeek,
    calendarDayOfMonth: row.calendarDayOfMonth,
    calendarDueTimeLocal: row.calendarDueTimeLocal ?? null,
    allowAdHoc: row.allowAdHoc,
  });
  return summary.trim() || null;
}

function locationLogOverlays(input: {
  attachments: readonly LocationLogAttachmentRow[];
  context: {
    facilityId: string;
    departmentId: string;
    spaceId: string;
    unitId: string | null;
    operationalTypeKey: string | null;
    operationalTypeName: string | null;
  };
  assetLogs: readonly LocationLogMatchLike[];
  timingByAttachmentId: ReadonlyMap<string, string | null>;
}): EffectiveLocationOverlays["logAttachments"] {
  const matches = input.attachments
    .map((row) => matchLogAttachmentToLocation(row, input.context))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const combined = dedupeLocationLogMatches([...matches, ...input.assetLogs]);
  return combined.map((match) => {
    const timing = input.timingByAttachmentId.get(match.attachment.id);
    return overlay(
      match.attachment.id,
      match.attachment.label,
      "LOG_ATTACHMENT",
      timing ? `${match.detail}. ${timing}` : match.detail,
      overlaySourceFromLogMatch(match.source),
    );
  });
}

type LocationLogMatchLike = NonNullable<ReturnType<typeof matchLogAttachmentToLocation>>;

function cycleOverlay(
  cycle: OperationalCycleDefinition,
  match: NonNullable<ReturnType<typeof matchCycleApplicability>>,
): EffectiveLocationOverlays["cycles"][number] {
  return overlay(
    cycle.id,
    cycle.label,
    "CYCLE_LOCATION_MODE",
    describeCycleApplicability(match),
    primaryCycleApplicabilitySource(match.sources),
  );
}

function teamApplicabilityRows(
  rows: readonly {
    id: string;
    departmentId: string;
    displayName: string;
    status: "ACTIVE" | "ARCHIVED";
    applicableOperationalTypeKeys: readonly string[];
    roomMemberships: readonly { spaceId: string }[];
  }[],
): TeamApplicabilityRow[] {
  return rows.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    displayName: row.displayName,
    status: row.status,
    applicableOperationalTypeKeys: row.applicableOperationalTypeKeys,
    explicitSpaceIds: row.roomMemberships.map((membership) => membership.spaceId),
  }));
}

function teamOverlays(input: {
  teams: readonly TeamApplicabilityRow[];
  departmentId: string;
  spaceId: string;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
}): EffectiveLocationOverlays["teams"] {
  const matches = input.teams.flatMap((team) =>
    matchTeamToLocation(team, {
      departmentId: input.departmentId,
      spaceId: input.spaceId,
      operationalTypeKey: input.operationalTypeKey,
      operationalTypeName: input.operationalTypeName,
    }),
  );
  return dedupeTeamLocationMatches(matches).map((match) =>
    overlay(
      match.team.id,
      match.team.displayName,
      "TEAM_ROOM_MEMBERSHIP",
      match.detail,
      overlaySourceFromTeamMatch(match.source),
    ),
  );
}

const TEAM_APPLICABILITY_SELECT = {
  id: true,
  departmentId: true,
  displayName: true,
  status: true,
  applicableOperationalTypeKeys: true,
  roomMemberships: { select: { spaceId: true } },
} as const;

export type LocationOverlayScope = {
  kind: EffectiveLocationKind;
  id: string;
  unitId: string | null;
  spaceId: string | null;
  unitType: UnitType | null;
  roomTypeKey: string | null;
  spaceType: SpaceType | null;
  operationalTypeKey?: string | null;
  operationalTypeName?: string | null;
};

export async function loadLocationProgramOverlays(input: {
  facilityId: string;
  departmentId: string;
  asOf: Date;
  timezone?: string | null;
  scope: LocationOverlayScope;
}): Promise<EffectiveLocationOverlays> {
  const date = toServiceDateKey(getFacilityServiceDate(input.timezone, input.asOf));
  const [cycles, teams, attachments, assets, workPlans, coverageTemplates] = await Promise.all([
    loadPublishedCyclesForDate(input.facilityId, input.departmentId, date),
    prisma.departmentTeam.findMany({
      where: {
        departmentId: input.departmentId,
        facilityId: input.facilityId,
        status: "ACTIVE",
      },
      select: TEAM_APPLICABILITY_SELECT,
    }),
    prisma.logAttachment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        departmentId: true,
        localDisplayLabel: true,
        catalogStableKey: true,
        catalogVersion: true,
        targetKind: true,
        spaceId: true,
        unitId: true,
        targetDepartmentId: true,
        operationalTypeKey: true,
        assetId: true,
        timingMode: true,
        calendarCadence: true,
        calendarDaysOfWeek: true,
        calendarDayOfMonth: true,
        calendarDueTimeLocal: true,
        allowAdHoc: true,
        dailyWindows: { select: { label: true, startLocal: true, endLocal: true } },
        cycleSelections: { select: { cycleStableKey: true } },
        catalogDefinition: { select: { name: true } },
        asset: { select: { name: true, spaceId: true } },
      },
    }),
    input.scope.spaceId
      ? prisma.asset.findMany({
          where: {
            spaceId: input.scope.spaceId,
            retiredAt: null,
            unit: { facilityId: input.facilityId },
          },
          select: { id: true, name: true, assetCode: true },
        })
      : input.scope.unitId
        ? prisma.asset.findMany({
            where: {
              unitId: input.scope.unitId,
              spaceId: null,
              retiredAt: null,
              unit: { facilityId: input.facilityId },
            },
            select: { id: true, name: true, assetCode: true },
          })
        : Promise.resolve([]),
    loadPublishedWorkPlansForResolve(input.facilityId, input.departmentId),
    loadCoverageTemplateRows({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    }),
  ]);

  const byKey = buildCyclesByStableKey(cycles);
  const cycleItems = cycles
    .map((cycle) => {
      const match = matchCycleApplicability({
        cycle,
        allCyclesByStableKey: byKey,
        context: {
          spaceId: input.scope.spaceId,
          unitId: input.scope.unitId,
          operationalTypeKey: input.scope.operationalTypeKey,
          operationalTypeName: input.scope.operationalTypeName,
          physicalRoomTypeKey: input.scope.roomTypeKey,
          unitType: input.scope.unitType,
        },
      });
      return match ? cycleOverlay(cycle, match) : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const teamItems = input.scope.spaceId
    ? teamOverlays({
        teams: teamApplicabilityRows(teams),
        departmentId: input.departmentId,
        spaceId: input.scope.spaceId,
        operationalTypeKey: input.scope.operationalTypeKey ?? null,
        operationalTypeName: input.scope.operationalTypeName ?? null,
      })
    : [];

  const cycleLabelByKey = new Map(cycles.map((cycle) => [cycle.stableKey, cycle.label]));
  const timingByAttachmentId = new Map(
    attachments.map((row) => [
      row.id,
      logTimingDetail({ ...row, cycleLabelByKey }),
    ]),
  );
  const logRows: LocationLogAttachmentRow[] = attachments.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    catalogStableKey: row.catalogStableKey,
    catalogVersion: row.catalogVersion,
    label: row.localDisplayLabel?.trim() || row.catalogDefinition.name,
    targetKind: row.targetKind,
    spaceId: row.spaceId,
    unitId: row.unitId,
    targetDepartmentId: row.targetDepartmentId,
    operationalTypeKey: row.operationalTypeKey,
    assetId: row.assetId,
    assetName: row.asset?.name ?? null,
    status: "ACTIVE",
  }));
  const assetLogs: LocationLogMatchLike[] = attachments
    .filter((row) => {
      if (row.targetKind !== "ASSET" || !row.assetId) return false;
      if (input.scope.spaceId) return row.asset?.spaceId === input.scope.spaceId;
      return false;
    })
    .map((row) => ({
      attachment: logRows.find((item) => item.id === row.id)!,
      source: "ASSET" as const,
      detail: describeLogApplicability({
        source: "ASSET",
        assetName: row.asset?.name ?? null,
      }),
    }));
  const logItems = input.scope.spaceId
    ? locationLogOverlays({
        attachments: logRows,
        context: {
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          spaceId: input.scope.spaceId,
          unitId: input.scope.unitId,
          operationalTypeKey: input.scope.operationalTypeKey ?? null,
          operationalTypeName: input.scope.operationalTypeName ?? null,
        },
        assetLogs,
        timingByAttachmentId,
      })
    : attachments
        .filter((row) => row.targetKind === "UNIT" || row.targetKind === "DEPARTMENT" || row.targetKind === "FACILITY")
        .map((row) =>
          overlay(
            row.id,
            row.localDisplayLabel?.trim() || row.catalogDefinition.name,
            "LOG_ATTACHMENT",
            `Canonical LogAttachment (${row.targetKind})`,
          ),
        );

  const assetItems = assets.map((row) =>
    overlay(
      row.id,
      row.assetCode ? `${row.name} (${row.assetCode})` : row.name,
      "ASSET_PLACEMENT",
      input.scope.spaceId ? "Asset.spaceId" : "Asset.unitId",
    ),
  );

  const workItems = workPlans
    .filter((plan) =>
      workPlanAppliesToScope(plan.applicabilities, {
        unitId: input.scope.unitId,
        spaceId: input.scope.spaceId,
        spaceType: input.scope.spaceType,
      }),
    )
    .map((plan) =>
      overlay(
        plan.id,
        plan.name,
        "WORK_PLAN_APPLICABILITY",
        "Published work-plan applicability",
      ),
    );

  return {
    cycles: cycleItems,
    teams: teamItems,
    logAttachments: logItems,
    assets: assetItems,
    workPlans: workItems,
    coverageExpectations: coverageExpectationOverlays({
      templates: coverageTemplates,
      departmentId: input.departmentId,
      spaceId: input.scope.spaceId,
      unitId: input.scope.unitId,
      operationalTypeKey: input.scope.operationalTypeKey ?? null,
      operationalTypeName: input.scope.operationalTypeName ?? null,
      cycles: cycles.map((cycle) => ({ stableKey: cycle.stableKey, label: cycle.label })),
    }),
  };
}

const COVERAGE_TEMPLATE_SELECT = {
  id: true,
  stableKey: true,
  version: true,
  status: true,
  isActive: true,
  effectiveFrom: true,
  effectiveTo: true,
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
} as const;

async function loadCoverageTemplateRows(input: { facilityId: string; departmentId: string }) {
  return prisma.operationalAssignmentTemplate.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    select: COVERAGE_TEMPLATE_SELECT,
  });
}

function coverageExpectationOverlays(input: {
  templates: Awaited<ReturnType<typeof loadCoverageTemplateRows>>;
  departmentId: string;
  spaceId: string | null;
  unitId: string | null;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
  cycles: Array<{ stableKey: string; label: string }>;
}): EffectiveCoverageExpectationItem[] {
  if (!input.spaceId) return [];
  const working = selectWorkingCoverageTemplates(input.templates as CoverageTemplateVersionRow[]);
  const items = flattenCoverageTemplateItems(working);
  const resolved = resolveCoverageExpectationsForLocation({
    items,
    context: {
      departmentId: input.departmentId,
      spaceId: input.spaceId,
      unitId: input.unitId,
      operationalTypeKey: input.operationalTypeKey,
      operationalTypeName: input.operationalTypeName,
    },
    cycles: input.cycles,
  });
  return resolved.map((row) => ({
    id: row.id,
    label: row.cycleLabel
      ? `${row.roleLabel} × ${row.requiredCount} — ${row.cycleLabel}`
      : `${row.roleLabel} × ${row.requiredCount}`,
    roleKey: row.roleKey,
    roleLabel: row.roleLabel,
    requiredCount: row.requiredCount,
    cycleStableKey: row.cycleStableKey,
    cycleLabel: row.cycleLabel,
    provenance: {
      source: row.provenance,
      mechanism: "COVERAGE_EXPECTATION",
      detail: row.detail,
    },
  }));
}

function workPlanAppliesToScope(
  applicabilities: readonly {
    kind: string;
    unitId: string | null;
    spaceId: string | null;
    spaceType: SpaceType | null;
  }[],
  scope: { unitId: string | null; spaceId: string | null; spaceType: SpaceType | null },
): boolean {
  if (applicabilities.length === 0) return true;
  return applicabilities.some((row) => {
    if (row.kind === "DEPARTMENT_UNIT") return true;
    if (row.kind === "SPECIFIC_UNIT") {
      return Boolean(scope.unitId && row.unitId === scope.unitId);
    }
    if (row.kind === "SPECIFIC_SPACE") {
      return Boolean(scope.spaceId && row.spaceId === scope.spaceId);
    }
    if (row.kind === "SPACE_TYPE") {
      return Boolean(scope.spaceType && row.spaceType === scope.spaceType);
    }
    return false;
  });
}

export type LocationProgramLoadInput = {
  facilityId: string;
  department: { id: string; key: string; name: string };
  asOf: Date;
  timezone?: string | null;
  location: DepartmentActionableLocation;
  profile: ProfileSnapshot | null;
  bindings: readonly RoomArchetypeBindingSnapshot[];
  exceptions: readonly RoomExceptionSnapshot[];
  spaceType?: SpaceType | null;
};

export async function loadEffectiveLocationProgram(
  input: LocationProgramLoadInput,
): Promise<EffectiveLocationProgram> {
  const isRoom = input.location.kind === "room";
  const overlays =
    input.location.source === "space_responsibility" ||
    input.location.source === "unit_responsibility"
      ? await loadLocationProgramOverlays({
          facilityId: input.facilityId,
          departmentId: input.department.id,
          asOf: input.asOf,
          timezone: input.timezone,
          scope: {
            kind: isRoom ? "SPACE" : "UNIT",
            id: input.location.id,
            unitId: isRoom ? input.location.parentUnitId : input.location.id,
            spaceId: isRoom ? input.location.id : null,
            unitType: input.location.unitType,
            roomTypeKey: input.location.roomTypeKey,
            spaceType: input.spaceType ?? null,
            operationalTypeKey:
              input.profile && input.bindings.length > 0
                ? input.profile.archetypes.find(
                    (archetype) =>
                      archetype.id ===
                      input.bindings.find((row) => row.unitSpaceId === input.location.id)
                        ?.archetypeId,
                  )?.key ?? null
                : null,
            operationalTypeName:
              input.profile && input.bindings.length > 0
                ? input.profile.archetypes.find(
                    (archetype) =>
                      archetype.id ===
                      input.bindings.find((row) => row.unitSpaceId === input.location.id)
                        ?.archetypeId,
                  )?.name ?? null
                : null,
          },
        })
      : emptyLocationOverlays();

  const binding = isRoom
    ? (input.bindings.find((row) => row.unitSpaceId === input.location.id) ?? null)
    : null;

  const roomContext: RoomContext | null = isRoom
    ? {
        id: input.location.id,
        facilityId: input.facilityId,
        isActive: input.location.isActive,
        unitId: input.location.parentUnitId,
        parentHierarchyRole: "NEIGHBORHOOD",
        assignedDepartmentIds: [input.department.id],
      }
    : null;

  return resolveEffectiveLocationProgram({
    asOf: input.asOf.toISOString(),
    department: input.department,
    location: {
      kind: isRoom ? "SPACE" : "UNIT",
      id: input.location.id,
      name: input.location.name,
      displayName: input.location.displayName,
      floorName: input.location.floorName,
      neighborhoodName: input.location.parentNeighborhoodName,
      unitId: isRoom ? input.location.parentUnitId : input.location.id,
      spaceId: isRoom ? input.location.id : null,
    },
    responsibility: {
      assigned: true,
      source: input.location.source,
    },
    physical: {
      roomTypeKey: input.location.roomTypeKey,
      roomTypeLabel: input.location.roomTypeLabel,
    },
    profile: input.profile,
    roomContext,
    archetypeBinding: binding,
    exceptions: input.exceptions,
    overlays,
  });
}

export async function loadDepartmentLocationPrograms(input: {
  facilityId: string;
  department: { id: string; key: string; name: string };
  asOf?: Date;
  timezone?: string | null;
  locations: readonly DepartmentActionableLocation[];
  profile: ProfileSnapshot | null;
  bindings: readonly RoomArchetypeBindingSnapshot[];
  exceptions: readonly RoomExceptionSnapshot[];
}): Promise<Record<string, EffectiveLocationProgram>> {
  const asOf = input.asOf ?? new Date();
  const rooms = input.locations.filter((location) => location.kind === "room");
  const spaceIds = rooms.map((room) => room.id);
  const unitIds = [
    ...new Set(rooms.map((room) => room.parentUnitId).filter((id): id is string => Boolean(id))),
  ];
  const date = toServiceDateKey(getFacilityServiceDate(input.timezone, asOf));

  const [cycles, teamRows, attachments, assets, workPlans, coverageTemplates] = await Promise.all([
    loadPublishedCyclesForDate(input.facilityId, input.department.id, date),
    prisma.departmentTeam.findMany({
      where: {
        departmentId: input.department.id,
        facilityId: input.facilityId,
        status: "ACTIVE",
      },
      select: TEAM_APPLICABILITY_SELECT,
    }),
    prisma.logAttachment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.department.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        departmentId: true,
        localDisplayLabel: true,
        catalogStableKey: true,
        catalogVersion: true,
        targetKind: true,
        spaceId: true,
        unitId: true,
        targetDepartmentId: true,
        operationalTypeKey: true,
        assetId: true,
        timingMode: true,
        calendarCadence: true,
        calendarDaysOfWeek: true,
        calendarDayOfMonth: true,
        calendarDueTimeLocal: true,
        allowAdHoc: true,
        dailyWindows: { select: { label: true, startLocal: true, endLocal: true } },
        cycleSelections: { select: { cycleStableKey: true } },
        catalogDefinition: { select: { name: true } },
        asset: { select: { name: true, spaceId: true } },
      },
    }),
    spaceIds.length
      ? prisma.asset.findMany({
          where: {
            spaceId: { in: spaceIds },
            retiredAt: null,
            unit: { facilityId: input.facilityId },
          },
          select: { id: true, name: true, assetCode: true, spaceId: true },
        })
      : Promise.resolve([]),
    loadPublishedWorkPlansForResolve(input.facilityId, input.department.id),
    loadCoverageTemplateRows({
      facilityId: input.facilityId,
      departmentId: input.department.id,
    }),
  ]);

  const byKey = buildCyclesByStableKey(cycles);
  const cycleLabelByKey = new Map(cycles.map((cycle) => [cycle.stableKey, cycle.label]));
  const logRows: LocationLogAttachmentRow[] = attachments.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    catalogStableKey: row.catalogStableKey,
    catalogVersion: row.catalogVersion,
    label: row.localDisplayLabel?.trim() || row.catalogDefinition.name,
    targetKind: row.targetKind,
    spaceId: row.spaceId,
    unitId: row.unitId,
    targetDepartmentId: row.targetDepartmentId,
    operationalTypeKey: row.operationalTypeKey,
    assetId: row.assetId,
    assetName: row.asset?.name ?? null,
    status: "ACTIVE",
  }));
  const timingByAttachmentId = new Map(
    attachments.map((row) => [row.id, logTimingDetail({ ...row, cycleLabelByKey })]),
  );
  const programs: Record<string, EffectiveLocationProgram> = {};
  const archetypeById = new Map((input.profile?.archetypes ?? []).map((row) => [row.id, row]));

  for (const location of rooms) {
    const binding = input.bindings.find((row) => row.unitSpaceId === location.id) ?? null;
    const archetype = binding ? archetypeById.get(binding.archetypeId) ?? null : null;
    const overlays: EffectiveLocationOverlays = {
      cycles: cycles
        .map((cycle) => {
          const match = matchCycleApplicability({
            cycle,
            allCyclesByStableKey: byKey,
            context: {
              spaceId: location.id,
              unitId: location.parentUnitId,
              operationalTypeKey: archetype?.key ?? null,
              operationalTypeName: archetype?.name ?? null,
              physicalRoomTypeKey: location.roomTypeKey,
              unitType: location.unitType,
            },
          });
          return match ? cycleOverlay(cycle, match) : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      teams: teamOverlays({
        teams: teamApplicabilityRows(teamRows),
        departmentId: input.department.id,
        spaceId: location.id,
        operationalTypeKey: archetype?.key ?? null,
        operationalTypeName: archetype?.name ?? null,
      }),
      logAttachments: locationLogOverlays({
        attachments: logRows,
        context: {
          facilityId: input.facilityId,
          departmentId: input.department.id,
          spaceId: location.id,
          unitId: location.parentUnitId,
          operationalTypeKey: archetype?.key ?? null,
          operationalTypeName: archetype?.name ?? null,
        },
        assetLogs: attachments
          .filter((row) => row.targetKind === "ASSET" && row.asset?.spaceId === location.id)
          .map((row) => ({
            attachment: logRows.find((item) => item.id === row.id)!,
            source: "ASSET" as const,
            detail: describeLogApplicability({
              source: "ASSET",
              assetName: row.asset?.name ?? null,
            }),
          })),
        timingByAttachmentId,
      }),
      assets: assets
        .filter((row) => row.spaceId === location.id)
        .map((row) =>
          overlay(
            row.id,
            row.assetCode ? `${row.name} (${row.assetCode})` : row.name,
            "ASSET_PLACEMENT",
            "Asset.spaceId",
          ),
        ),
      workPlans: workPlans
        .filter((plan) =>
          workPlanAppliesToScope(plan.applicabilities, {
            unitId: location.parentUnitId,
            spaceId: location.id,
            spaceType: null,
          }),
        )
        .map((plan) =>
          overlay(
            plan.id,
            plan.name,
            "WORK_PLAN_APPLICABILITY",
            "Published work-plan applicability",
          ),
        ),
      coverageExpectations: coverageExpectationOverlays({
        templates: coverageTemplates,
        departmentId: input.department.id,
        spaceId: location.id,
        unitId: location.parentUnitId,
        operationalTypeKey: archetype?.key ?? null,
        operationalTypeName: archetype?.name ?? null,
        cycles: cycles.map((cycle) => ({ stableKey: cycle.stableKey, label: cycle.label })),
      }),
    };

    programs[location.id] = resolveEffectiveLocationProgram({
      asOf: asOf.toISOString(),
      department: input.department,
      location: {
        kind: "SPACE",
        id: location.id,
        name: location.name,
        displayName: location.displayName,
        floorName: location.floorName,
        neighborhoodName: location.parentNeighborhoodName,
        unitId: location.parentUnitId,
        spaceId: location.id,
      },
      responsibility: { assigned: true, source: location.source },
      physical: {
        roomTypeKey: location.roomTypeKey,
        roomTypeLabel: location.roomTypeLabel,
      },
      profile: input.profile,
      roomContext: {
        id: location.id,
        facilityId: input.facilityId,
        isActive: location.isActive,
        unitId: location.parentUnitId,
        parentHierarchyRole: "NEIGHBORHOOD",
        assignedDepartmentIds: [input.department.id],
      },
      archetypeBinding: binding,
      exceptions: input.exceptions,
      overlays,
    });
  }

  return programs;
}
