/**
 * Pure Runtime Location State composer.
 * Orchestrates domain services. Does not query Prisma.
 */

import { normalizeAssetStatus } from "@/lib/asset-operations/types";
import {
  emptyLocationProgram,
  type LocationProgram,
  type LocationProgramCycle,
} from "@/lib/department-administration/location-program";
import type { LogRequirement } from "@/lib/logs-architecture/types";
import {
  describeKeyTimeStatus,
  expectedKeyTimeToday,
  type KeyTimeDayTiming,
} from "@/lib/operational-cycles/key-time-day-expectation";
import {
  presentLocationRunOperation,
  type RunModelProvenance,
} from "@/lib/operational-cycles/present-run-operation";
import {
  formatCycleHierarchyLabel,
  resolveOperationalCycle,
} from "@/lib/operational-cycles/resolve-operational-cycle";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import {
  assignmentCoversLocation,
  assignmentOverlapsCycle,
  evaluateCoverageSlotState,
  evaluateCoverageSlots,
  flattenCoverageTemplateItems,
  planLifecycleFromStatus,
  resolveCoverageExpectationsForLocation,
  selectRuntimeCoverageTemplates,
  type CoverageAssignmentActual,
  type CoverageCycleRef,
  type CoverageTemplateVersionRow,
} from "@/lib/scheduling/coverage-expectations";

import { deriveRuntimeLocationAnswers } from "./answers";
import { summarizeRuntimeEvidence } from "./evidence";
import { deriveRuntimeExceptions } from "./exceptions";
import { deriveRuntimeNextEvent } from "./next-event";
import {
  DEFERRED_READINESS,
  type RuntimeAdjustment,
  type RuntimeAssetFact,
  type RuntimeAssetIssueFact,
  type RuntimeCoverageState,
  type RuntimeCurrentOperation,
  type RuntimeEffectiveProgramRef,
  type RuntimeLocationSpaceRef,
  type RuntimeLocationState,
  type RuntimeMilestoneItem,
} from "./types";

export type RuntimeSpaceIdentityRow = {
  spaceId: string;
  name: string;
  unitId: string | null;
  unitName: string | null;
  departmentId: string;
  departmentLabel: string | null;
  floorName: string | null;
  neighborhoodName: string | null;
  roomTypeKey: string | null;
  roomTypeLabel: string | null;
  facilityRoomTypeId: string | null;
};

export type RuntimeActiveProfileRef = {
  id: string;
  version: number;
  status: "ACTIVE";
};

export type RuntimeOperationalTypeRow = {
  key: string;
  name: string;
  id: string | null;
};

export type RuntimePublishedRunModel = {
  cycles: OperationalCycleDefinition[];
  timings: KeyTimeDayTiming[];
  provenance: RunModelProvenance;
  timezone: string;
  operationalDateKey: string;
  now: Date;
  nowLocalHhMm: string;
};

export type RuntimeServeryEventRow = {
  id: string;
  unitId: string;
  mealType: string;
  mealServiceReadyAt: Date | null;
  mealServiceStartedAt: Date | null;
  readyRecordedAt: Date | null;
  startedRecordedAt: Date | null;
};

export type RuntimeLocationComposeInput = {
  facilityId: string;
  facilityName: string;
  now: Date;
  operationalDateKey: string;
  timezone: string;
  nowLocalHhMm: string;
  operationalAssignmentsEnabled: boolean;
  spaces: readonly RuntimeSpaceIdentityRow[];
  spaceRefs?: readonly RuntimeLocationSpaceRef[];
  profilesByDepartmentId: ReadonlyMap<string, RuntimeActiveProfileRef | null>;
  operationalTypesBySpaceId: ReadonlyMap<string, RuntimeOperationalTypeRow | null>;
  runModelsByDepartmentId: ReadonlyMap<string, RuntimePublishedRunModel>;
  coverageTemplatesByDepartmentId: ReadonlyMap<string, CoverageTemplateVersionRow[]>;
  coveragePlanByDepartmentId: ReadonlyMap<string, string | null>;
  assignmentsByDepartmentId: ReadonlyMap<string, CoverageAssignmentActual[]>;
  evidenceBySpaceId: ReadonlyMap<string, readonly LogRequirement[]>;
  assetsBySpaceId: ReadonlyMap<string, readonly RuntimeAssetFact[]>;
  issuesBySpaceId: ReadonlyMap<string, readonly RuntimeAssetIssueFact[]>;
  serveryEventsByUnitId: ReadonlyMap<string, readonly RuntimeServeryEventRow[]>;
  programsBySpaceId: ReadonlyMap<string, LocationProgram>;
};

function emptyCoverage(availability: RuntimeCoverageState["availability"]): RuntimeCoverageState {
  return { availability, planLifecycle: null, slots: [] };
}

function periodCycleRefs(cycles: readonly OperationalCycleDefinition[]): CoverageCycleRef[] {
  return cycles
    .filter((cycle) => cycle.nodeKind === "PERIOD" && cycle.status === "PUBLISHED")
    .map((cycle) => ({ stableKey: cycle.stableKey, label: cycle.label }));
}

function cycleWindows(
  cycles: readonly OperationalCycleDefinition[],
  operationalDateKey: string,
  timezone: string,
): Map<string, { startsAt: Date | null; endsAt: Date | null }> {
  const windows = new Map<string, { startsAt: Date | null; endsAt: Date | null }>();
  for (const cycle of cycles) {
    if (cycle.nodeKind !== "PERIOD" || !cycle.startLocal || !cycle.endLocal) continue;
    const window = resolveCycleWindowInstants({
      operationalDateKey,
      startLocal: cycle.startLocal,
      endLocal: cycle.endLocal,
      overnight: cycle.overnight,
      facilityTimezone: timezone,
    });
    windows.set(cycle.stableKey, window ?? { startsAt: null, endsAt: null });
  }
  return windows;
}

function applyProgramCycleApplicability(
  cycles: readonly OperationalCycleDefinition[],
  spaceId: string,
  program: LocationProgram | null,
): OperationalCycleDefinition[] {
  if (!program) return [...cycles];
  const keys = new Set(program.cycles.map((cycle) => cycle.cycleStableKey));
  return cycles.map((cycle) => {
    if (!keys.has(cycle.stableKey)) return cycle;
    const spaceIds = cycle.spaceIds.includes(spaceId)
      ? cycle.spaceIds
      : [...cycle.spaceIds, spaceId];
    return {
      ...cycle,
      spaceIds,
      locationMode: "EXPLICIT_UNITS",
    };
  });
}

function composeOperation(
  model: RuntimePublishedRunModel | undefined,
  space: RuntimeSpaceIdentityRow,
  program: LocationProgram | null,
): RuntimeCurrentOperation {
  const cycles = applyProgramCycleApplicability(model?.cycles ?? [], space.spaceId, program);
  const provenance = model?.provenance ?? "NEW_PERIOD_KEY_TIME";
  if (!model || cycles.length === 0) {
    return {
      state: "NONE",
      current: null,
      upcoming: null,
      provenance,
    };
  }

  const context = resolveOperationalCycle({
    cycles,
    now: model.now,
    facilityTimezone: model.timezone,
    operationalDateKey: model.operationalDateKey,
    spaceId: space.spaceId,
    operationalTypeKey: null,
  });

  const presented = presentLocationRunOperation({
    cycles,
    timings: model.timings,
    now: model.now,
    facilityTimezone: model.timezone,
    operationalDateKey: model.operationalDateKey,
    spaceId: space.spaceId,
    operationalTypeKey: null,
    nowLocalHhMm: model.nowLocalHhMm,
    location: {
      title: space.name,
      roomTypeLabel: space.roomTypeLabel,
      contextLabel: space.neighborhoodName ?? space.unitName,
      spaceId: space.spaceId,
      unitId: space.unitId,
    },
  });

  const upcomingOcc =
    context.state === "ACTIVE" || context.state === "UPCOMING" || context.state === "BETWEEN"
      ? context.next
      : null;

  const upcoming = upcomingOcc
    ? {
        cycleStableKey: upcomingOcc.stableKey,
        label: upcomingOcc.label,
        startsAt: upcomingOcc.startsAt.toISOString(),
        minutesUntil:
          context.state === "NOT_APPLICABLE" || context.state === "NOT_CONFIGURED"
            ? null
            : "minutesUntilNext" in context
              ? context.minutesUntilNext
              : null,
      }
    : null;

  if (context.state !== "ACTIVE") {
    return {
      state: "NONE",
      current: null,
      upcoming,
      provenance: presented.provenance,
    };
  }

  const primary = context.primary;
  return {
    state: "ACTIVE",
    current: {
      cycleStableKey: primary.stableKey,
      cycleVersion: primary.version,
      label: formatCycleHierarchyLabel(primary) ?? primary.label,
      hierarchyLabel: formatCycleHierarchyLabel(primary),
      window: { start: primary.startLocal, end: primary.endLocal },
      timing: {
        configured: primary.startLocal,
        adjusted: null,
        expectedToday: primary.startLocal,
        actual: null,
        recordedAt: null,
      },
    },
    upcoming,
    provenance: presented.provenance,
  };
}

function programCycleWindows(
  program: LocationProgram,
  cycles: readonly OperationalCycleDefinition[],
  operationalDateKey: string,
  timezone: string,
): Map<string, { startsAt: Date | null; endsAt: Date | null }> {
  const windows = cycleWindows(cycles, operationalDateKey, timezone);
  for (const cycle of program.cycles) {
    if (windows.has(cycle.cycleStableKey) || !cycle.startLocal || !cycle.endLocal) continue;
    const window = resolveCycleWindowInstants({
      operationalDateKey,
      startLocal: cycle.startLocal,
      endLocal: cycle.endLocal,
      overnight: false,
      facilityTimezone: timezone,
    });
    windows.set(cycle.cycleStableKey, window ?? { startsAt: null, endsAt: null });
  }
  return windows;
}

function matchingAssignmentsForTeamNeed(input: {
  assignments: readonly CoverageAssignmentActual[];
  spaceId: string;
  unitId: string | null;
  cycleStartsAt: Date | null;
  cycleEndsAt: Date | null;
}): CoverageAssignmentActual[] {
  const seen = new Set<string>();
  const matches: CoverageAssignmentActual[] = [];
  for (const assignment of input.assignments) {
    if (seen.has(assignment.id)) continue;
    if (assignment.status !== "PLANNED" && assignment.status !== "ACTIVE") continue;
    if (!assignmentCoversLocation(assignment, input.spaceId, input.unitId)) continue;
    if (
      !assignmentOverlapsCycle({
        assignment,
        cycleStartsAt: input.cycleStartsAt,
        cycleEndsAt: input.cycleEndsAt,
      })
    ) {
      continue;
    }
    seen.add(assignment.id);
    matches.push(assignment);
  }
  return matches;
}

function composeProgramNeedCoverage(input: {
  program: LocationProgram;
  space: RuntimeSpaceIdentityRow;
  operation: RuntimeCurrentOperation;
  assignments: readonly CoverageAssignmentActual[];
  cycles: readonly OperationalCycleDefinition[];
  planStatus: string | null;
  operationalDateKey: string;
  timezone: string;
  now: Date;
}): RuntimeCoverageState | null {
  const needs: Array<{ cycle: LocationProgramCycle; teamId: string; teamName: string; requiredCount: number }> =
    [];
  for (const cycle of input.program.cycles) {
    for (const team of cycle.teams) {
      if (team.requiredCount == null) continue;
      needs.push({
        cycle,
        teamId: team.teamId,
        teamName: team.teamName,
        requiredCount: team.requiredCount,
      });
    }
  }
  if (needs.length === 0) return null;

  const plan = planLifecycleFromStatus(input.planStatus);
  const windows = programCycleWindows(
    input.program,
    input.cycles,
    input.operationalDateKey,
    input.timezone,
  );
  const activeKey = input.operation.current?.cycleStableKey ?? null;
  const relevant = activeKey
    ? needs.filter((need) => need.cycle.cycleStableKey === activeKey)
    : needs.filter((need) => {
        const window = windows.get(need.cycle.cycleStableKey);
        if (!window?.startsAt || !window.endsAt) return false;
        return input.now >= window.startsAt && input.now < window.endsAt;
      });

  const assignmentById = new Map(input.assignments.map((row) => [row.id, row]));
  return {
    availability: "evaluated",
    planLifecycle: plan,
    slots: relevant.map((need) => {
      const window = windows.get(need.cycle.cycleStableKey);
      const matches = matchingAssignmentsForTeamNeed({
        assignments: input.assignments,
        spaceId: input.space.spaceId,
        unitId: input.space.unitId,
        cycleStartsAt: window?.startsAt ?? null,
        cycleEndsAt: window?.endsAt ?? null,
      });
      const filledCount = matches.length;
      return {
        expectationId: `team-need:${need.teamId}:${need.cycle.cycleStableKey}`,
        templateStableKey: `location-program:${need.teamId}`,
        templateVersion: 1,
        roleKey: `TEAM:${need.teamId}`,
        roleLabel: need.teamName,
        requiredCount: need.requiredCount,
        filledCount,
        state: evaluateCoverageSlotState({
          plan,
          requiredCount: need.requiredCount,
          filledCount,
          hasCallDownRisk: matches.some((row) => row.hasCallDown === true),
        }),
        cycleStableKey: need.cycle.cycleStableKey,
        assignmentIds: matches.map((row) => row.id),
        assignmentRefs: matches.map((assignment) => ({
          assignmentId: assignment.id,
          employeeId: assignmentById.get(assignment.id)?.employeeId ?? assignment.employeeId ?? null,
          employeeDisplayName:
            assignmentById.get(assignment.id)?.employeeDisplayName ??
            assignment.employeeDisplayName ??
            null,
        })),
      };
    }),
  };
}

function composeTemplateCoverage(input: {
  space: RuntimeSpaceIdentityRow;
  operationalType: RuntimeOperationalTypeRow | null;
  operation: RuntimeCurrentOperation;
  templates: readonly CoverageTemplateVersionRow[];
  planStatus: string | null;
  assignments: readonly CoverageAssignmentActual[];
  cycles: readonly OperationalCycleDefinition[];
  operationalDateKey: string;
  timezone: string;
}): RuntimeCoverageState {
  const runtimeTemplates = selectRuntimeCoverageTemplates(
    input.templates,
    input.operationalDateKey,
  );
  const items = flattenCoverageTemplateItems(runtimeTemplates);
  if (items.length === 0) return emptyCoverage("no_published_expectations");

  const plan = planLifecycleFromStatus(input.planStatus);
  if (input.operation.state !== "ACTIVE" || !input.operation.current) {
    return {
      availability: "evaluated",
      planLifecycle: plan,
      slots: [],
    };
  }

  const cycleRefs = periodCycleRefs(input.cycles).filter(
    (cycle) => cycle.stableKey === input.operation.current?.cycleStableKey,
  );
  const expectations = resolveCoverageExpectationsForLocation({
    items,
    context: {
      departmentId: input.space.departmentId,
      spaceId: input.space.spaceId,
      unitId: input.space.unitId,
      operationalTypeKey: input.operationalType?.key ?? null,
      operationalTypeName: input.operationalType?.name ?? null,
    },
    cycles: cycleRefs,
    cycleStableKey: input.operation.current.cycleStableKey,
  });

  if (expectations.length === 0) {
    return {
      availability: "evaluated",
      planLifecycle: plan,
      slots: [],
    };
  }

  const evaluated = evaluateCoverageSlots({
    expectations,
    assignments: input.assignments,
    spaceId: input.space.spaceId,
    unitId: input.space.unitId,
    plan,
    cycleWindows: cycleWindows(input.cycles, input.operationalDateKey, input.timezone),
  });

  const assignmentById = new Map(input.assignments.map((row) => [row.id, row]));
  return {
    availability: "evaluated",
    planLifecycle: plan,
    slots: evaluated.map((slot) => ({
      expectationId: slot.expectation.id,
      templateStableKey: slot.expectation.templateStableKey,
      templateVersion: slot.expectation.templateVersion,
      roleKey: slot.expectation.roleKey,
      roleLabel: slot.expectation.roleLabel,
      requiredCount: slot.expectation.requiredCount,
      filledCount: slot.filledCount,
      state: slot.state,
      cycleStableKey: slot.expectation.cycleStableKey,
      assignmentIds: slot.fillingAssignmentIds,
      assignmentRefs: slot.fillingAssignmentIds.map((assignmentId) => {
        const assignment = assignmentById.get(assignmentId);
        return {
          assignmentId,
          employeeId: assignment?.employeeId ?? null,
          employeeDisplayName: assignment?.employeeDisplayName ?? null,
        };
      }),
    })),
  };
}

function composeCoverage(input: {
  enabled: boolean;
  space: RuntimeSpaceIdentityRow;
  operationalType: RuntimeOperationalTypeRow | null;
  operation: RuntimeCurrentOperation;
  program: LocationProgram;
  templates: readonly CoverageTemplateVersionRow[];
  planStatus: string | null;
  assignments: readonly CoverageAssignmentActual[];
  cycles: readonly OperationalCycleDefinition[];
  operationalDateKey: string;
  timezone: string;
  now: Date;
}): RuntimeCoverageState {
  if (!input.enabled) return emptyCoverage("feature_disabled");

  const fromProgram = composeProgramNeedCoverage({
    program: input.program,
    space: input.space,
    operation: input.operation,
    assignments: input.assignments,
    cycles: input.cycles,
    planStatus: input.planStatus,
    operationalDateKey: input.operationalDateKey,
    timezone: input.timezone,
    now: input.now,
  });
  if (fromProgram) return fromProgram;

  return composeTemplateCoverage(input);
}

function isServeryPlace(space: RuntimeSpaceIdentityRow, program: LocationProgram): boolean {
  const haystack = [
    space.roomTypeKey,
    space.roomTypeLabel,
    program.location.facilityTypeLabel,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  return haystack.includes("servery");
}

function composeMilestones(input: {
  model: RuntimePublishedRunModel | undefined;
  spaceId: string;
  includeServeryMilestones: boolean;
    unitId: string | null;
  serveryEvents: readonly RuntimeServeryEventRow[];
}): RuntimeMilestoneItem[] {
  const items: RuntimeMilestoneItem[] = [];
  const timings = (input.model?.timings ?? []).filter((row) => row.spaceId === input.spaceId);
  const nowLocal = input.model?.nowLocalHhMm ?? "00:00";

  for (const timing of timings) {
    const status = describeKeyTimeStatus({
      configuredDueLocal: timing.configuredDueLocal,
      adjustedDueLocal: timing.adjustedDueLocal,
      actualDueLocal: timing.actualDueLocal,
      nowLocalHhMm: nowLocal,
    });
    items.push({
      kind: "KEY_TIME",
      label: timing.cycleLabel,
      cycleStableKey: timing.cycleStableKey,
      timing: {
        configured: timing.configuredDueLocal,
        adjusted: timing.adjustedDueLocal,
        expectedToday: expectedKeyTimeToday(timing),
        actual: timing.actualDueLocal,
        recordedAt: timing.completedAt,
      },
      statusKey: status.key,
      canonical: true,
    });
  }

  if (!input.includeServeryMilestones) {
    return items;
  }

  for (const event of input.serveryEvents) {
    items.push({
      kind: "SERVERY_READY",
      label: "Servery Ready",
      cycleStableKey: null,
      timing: {
        configured: null,
        adjusted: null,
        expectedToday: null,
        actual: event.mealServiceReadyAt?.toISOString() ?? null,
        recordedAt: event.readyRecordedAt,
      },
      statusKey: event.mealServiceReadyAt ? "completed_on_time" : "not_recorded",
      canonical: false,
    });
    items.push({
      kind: "MEAL_SERVICE_STARTED",
      label: "Meal Service Started",
      cycleStableKey: null,
      timing: {
        configured: null,
        adjusted: null,
        expectedToday: null,
        actual: event.mealServiceStartedAt?.toISOString() ?? null,
        recordedAt: event.startedRecordedAt,
      },
      statusKey: event.mealServiceStartedAt ? "completed_on_time" : "not_recorded",
      canonical: false,
    });
  }

  return items;
}

function composeChanges(input: {
  milestones: readonly RuntimeMilestoneItem[];
  issues: readonly RuntimeAssetIssueFact[];
  assignments: readonly CoverageAssignmentActual[];
  evidence: RuntimeLocationState["evidence"];
}): RuntimeAdjustment[] {
  const changes: RuntimeAdjustment[] = [];

  for (const milestone of input.milestones) {
    if (milestone.kind === "KEY_TIME" && milestone.timing.adjusted) {
      changes.push({
        kind: "KEY_TIME_ADJUSTED",
        sourceId: milestone.label,
        at: milestone.timing.recordedAt ?? new Date(0),
        detail: `${milestone.label} adjusted to ${milestone.timing.adjusted}`,
        doesNotRewriteBuild: true,
      });
    }
    if (milestone.kind === "KEY_TIME" && milestone.timing.actual) {
      changes.push({
        kind: "KEY_TIME_COMPLETED",
        sourceId: milestone.label,
        at: milestone.timing.recordedAt ?? new Date(0),
        detail: `${milestone.label} recorded ${milestone.timing.actual}`,
        doesNotRewriteBuild: true,
      });
    }
    if (milestone.kind === "SERVERY_READY" && milestone.timing.actual) {
      changes.push({
        kind: "SERVERY_READY",
        sourceId: milestone.label,
        at: milestone.timing.recordedAt ?? new Date(0),
        detail: "Servery Ready recorded",
        doesNotRewriteBuild: true,
      });
    }
    if (milestone.kind === "MEAL_SERVICE_STARTED" && milestone.timing.actual) {
      changes.push({
        kind: "MEAL_SERVICE_STARTED",
        sourceId: milestone.label,
        at: milestone.timing.recordedAt ?? new Date(0),
        detail: "Meal Service Started recorded",
        doesNotRewriteBuild: true,
      });
    }
  }

  for (const issue of input.issues) {
    changes.push({
      kind: "ISSUE_OPENED",
      sourceId: issue.issueId,
      at: new Date(0),
      detail: issue.summary,
      doesNotRewriteBuild: true,
    });
  }

  for (const assignment of input.assignments) {
    if (!assignment.hasCallDown) continue;
    changes.push({
      kind: "ASSIGNMENT_OVERRIDE",
      sourceId: assignment.id,
      at: assignment.startsAt ?? new Date(0),
      detail: `${assignment.roleKey} call-down`,
      doesNotRewriteBuild: true,
    });
  }

  for (const key of input.evidence.correctiveOpen) {
    const item = input.evidence.items.find((row) => row.requirementKey === key);
    changes.push({
      kind: "CORRECTIVE_ACTION",
      sourceId: key,
      at: new Date(0),
      detail: item?.displayName ?? key,
      doesNotRewriteBuild: true,
    });
  }

  return changes.filter((row) => row.at.getTime() !== 0 || row.kind === "CORRECTIVE_ACTION" || row.kind === "ISSUE_OPENED");
}

function programRefs(input: {
  space: RuntimeSpaceIdentityRow;
  program: LocationProgram;
  operationalType: RuntimeOperationalTypeRow | null;
  profile: RuntimeActiveProfileRef | null;
  model: RuntimePublishedRunModel | undefined;
  coverage: RuntimeCoverageState;
  evidence: RuntimeLocationState["evidence"];
}): RuntimeEffectiveProgramRef {
  const publishedCycleRefs =
    input.model?.cycles
      .filter((cycle) => cycle.status === "PUBLISHED")
      .map((cycle) => ({
        stableKey: cycle.stableKey,
        version: cycle.version,
        label: cycle.label,
      })) ?? [];
  const programCycleRefs = input.program.cycles.map((cycle) => ({
    stableKey: cycle.cycleStableKey,
    version: publishedCycleRefs.find((row) => row.stableKey === cycle.cycleStableKey)?.version ?? 1,
    label: cycle.label,
  }));
  const cycleRefs = programCycleRefs.length > 0 ? programCycleRefs : publishedCycleRefs;

  const coverageExpectationRefs = [
    ...new Map(
      input.coverage.slots.map((slot) => [
        `${slot.templateStableKey}:${slot.templateVersion}`,
        {
          templateStableKey: slot.templateStableKey,
          templateVersion: slot.templateVersion,
        },
      ]),
    ).values(),
  ];

  const logAttachmentRefs = [
    ...new Map(
      [
        ...input.evidence.items.map((item) => ({
          attachmentId: item.attachmentId,
          stableKey: item.catalogStableKey || item.attachmentId,
        })),
        ...input.program.logs
          .filter((log) => log.attachmentId)
          .map((log) => ({
            attachmentId: log.attachmentId!,
            stableKey: log.attachmentId!,
          })),
      ].map((row) => [row.attachmentId, row]),
    ).values(),
  ];

  return {
    locationProgram: input.program,
    operationalType: {
      state: input.operationalType ? "assigned" : "unassigned",
      key: input.operationalType?.key ?? null,
      name: input.operationalType?.name ?? null,
      id: input.operationalType?.id ?? null,
      profileId: input.profile?.id ?? null,
      profileVersion: input.profile?.version ?? null,
      profileStatus: input.profile?.status ?? null,
    },
    cycleSetRef:
      cycleRefs.length > 0
        ? {
            departmentId: input.space.departmentId,
            publishedOn: input.model?.operationalDateKey ?? "",
            cycleRefs,
          }
        : null,
    coverageExpectationRefs,
    logAttachmentRefs,
  };
}

function affectingIssues(
  issues: readonly RuntimeAssetIssueFact[],
): RuntimeAssetIssueFact[] {
  return issues.filter(
    (issue) => issue.impact === "SERVICE_AT_RISK" || issue.impact === "EQUIPMENT_UNAVAILABLE",
  );
}

export function composeRuntimeLocationStates(
  input: RuntimeLocationComposeInput,
): RuntimeLocationState[] {
  return input.spaces.map((space) => {
    const operationalType = input.operationalTypesBySpaceId.get(space.spaceId) ?? null;
    const profile = input.profilesByDepartmentId.get(space.departmentId) ?? null;
    const model = input.runModelsByDepartmentId.get(space.departmentId);
    const program =
      input.programsBySpaceId.get(space.spaceId) ??
      emptyLocationProgram({
        departmentId: space.departmentId,
        departmentName: space.departmentLabel ?? "",
        spaceId: space.spaceId,
        name: space.name,
        neighborhoodName: space.neighborhoodName,
        floorName: space.floorName,
        facilityTypeLabel: space.roomTypeLabel,
        facilityRoomTypeId: space.facilityRoomTypeId,
      });
    const operation = composeOperation(model, space, program);
    const coverage = composeCoverage({
      enabled: input.operationalAssignmentsEnabled,
      space,
      operationalType,
      operation,
      program,
      templates: input.coverageTemplatesByDepartmentId.get(space.departmentId) ?? [],
      planStatus: input.coveragePlanByDepartmentId.get(space.departmentId) ?? null,
      assignments: input.assignmentsByDepartmentId.get(space.departmentId) ?? [],
      cycles: applyProgramCycleApplicability(model?.cycles ?? [], space.spaceId, program),
      operationalDateKey: input.operationalDateKey,
      timezone: input.timezone,
      now: input.now,
    });
    const evidence = summarizeRuntimeEvidence(
      input.evidenceBySpaceId.get(space.spaceId) ?? [],
    );
    const assets = [...(input.assetsBySpaceId.get(space.spaceId) ?? [])].map((asset) => ({
      ...asset,
      status: normalizeAssetStatus(asset.status),
    }));
    const openIssues = [...(input.issuesBySpaceId.get(space.spaceId) ?? [])];
    const assetState = {
      assets,
      openIssues,
      issuesAffectingOperation: affectingIssues(openIssues),
    };
    const milestones = {
      items: composeMilestones({
        model,
        spaceId: space.spaceId,
        includeServeryMilestones: isServeryPlace(space, program),
        unitId: space.unitId,
        serveryEvents: space.unitId
          ? (input.serveryEventsByUnitId.get(space.unitId) ?? [])
          : [],
      }),
    };
    const programRef = programRefs({
      space,
      program,
      operationalType,
      profile,
      model,
      coverage,
      evidence,
    });
    const identity = {
      location: {
        kind: "SPACE" as const,
        spaceId: space.spaceId,
        unitId: space.unitId,
        departmentId: space.departmentId,
        facilityId: input.facilityId,
      },
      displayName: space.name,
      hierarchy: {
        facilityName: input.facilityName,
        departmentName: space.departmentLabel,
        floorName: space.floorName,
        neighborhoodName: space.neighborhoodName,
        unitName: space.unitName,
        spaceName: space.name,
      },
      physical: {
        roomTypeKey: space.roomTypeKey,
        roomTypeLabel: space.roomTypeLabel,
      },
    };

    const partial = {
      identity,
      program: programRef,
      operation,
      coverage,
      evidence,
      assets: assetState,
      milestones,
    };
    const exceptions = deriveRuntimeExceptions(partial);
    const asOf = {
      now: input.now,
      operationalDateKey: input.operationalDateKey,
      timezone: input.timezone,
    };
    const assignments = input.assignmentsByDepartmentId.get(space.departmentId) ?? [];
    const assignmentTransitions =
      input.operationalAssignmentsEnabled
        ? assignments.flatMap((assignment) => {
            const rows: Array<{ at: Date; label: string; sourceId: string }> = [];
            if (assignment.startsAt) {
              rows.push({
                at: assignment.startsAt,
                label: `${assignment.roleKey} starts`,
                sourceId: assignment.id,
              });
            }
            if (assignment.endsAt) {
              rows.push({
                at: assignment.endsAt,
                label: `${assignment.roleKey} ends`,
                sourceId: assignment.id,
              });
            }
            return rows;
          })
        : [];

    const next = deriveRuntimeNextEvent(
      { operation, evidence, milestones, coverage, asOf },
      { assignmentTransitions },
    );
    const changes = composeChanges({
      milestones: milestones.items,
      issues: openIssues,
      assignments,
      evidence,
    });

    const composed = {
      ...partial,
      readiness: DEFERRED_READINESS,
      changes,
      exceptions,
      next,
      asOf,
    };
    return {
      ...composed,
      answers: deriveRuntimeLocationAnswers(composed),
    };
  });
}

export function composeRuntimeLocationState(
  input: RuntimeLocationComposeInput,
  spaceId: string,
): RuntimeLocationState | null {
  return (
    composeRuntimeLocationStates({
      ...input,
      spaces: input.spaces.filter((space) => space.spaceId === spaceId),
    })[0] ?? null
  );
}
