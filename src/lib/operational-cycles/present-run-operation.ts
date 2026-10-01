/**
 * Pure Run presentation for published PERIOD / KEY_TIME configuration.
 * Does not invent meal-service copy. Legacy meal banners stay on the legacy path.
 */

import { resolveWorkCycleRoomParticipation } from "./cycle-applicability";
import { formatCycleWindow } from "./cycle-display";
import {
  buildCyclesByStableKey,
  effectiveCycleSpaceIds,
} from "./effective-cycle-spaces";
import {
  describeKeyTimeStatus,
  formatClock12,
  type KeyTimeDayTiming,
  type KeyTimeStatusKey,
} from "./key-time-day-expectation";
import {
  activePhaseLabelsForCycle,
  resolveCycleAndPhaseLabels,
  selectNextKeyPointSummary,
} from "./cycle-timeline";
import {
  formatCycleHierarchyLabel,
  resolveOperationalCycle,
} from "./resolve-operational-cycle";
import type { OperationalCycleDefinition } from "./types";

/**
 * `NEW_PERIOD_KEY_TIME` is the current PERIOD model. The name is kept for
 * compatibility — Key Times are optional and do not define the model.
 */
export type RunModelProvenance = "NEW_PERIOD_KEY_TIME" | "LEGACY_MEAL_SERVICE";

export function isCurrentPeriodModel(
  provenance: RunModelProvenance | null | undefined,
): boolean {
  return provenance === "NEW_PERIOD_KEY_TIME";
}

const LEGACY_MEAL_MILESTONES = new Set(["READY", "SERVICE_STARTED"]);

function isLegacyMealServiceCycle(
  cycle: Pick<OperationalCycleDefinition, "expectedMilestones">,
): boolean {
  return cycle.expectedMilestones.some((milestone) => LEGACY_MEAL_MILESTONES.has(milestone));
}

export type RunDepartmentConfiguration =
  | "not_configured"
  | "missing_participation"
  | "configured";

export type RunDepartmentNextOperation = {
  label: string;
  windowLabel: string | null;
  minutesUntil: number | null;
  cycleStableKey: string | null;
};

export type RunLocationIdentity = {
  title: string;
  roomTypeLabel: string | null;
  contextLabel: string | null;
  spaceId: string | null;
  unitId: string | null;
};

export type RunLocationKeyTimeView = {
  expectationId: string;
  label: string;
  dueLabel: string;
  configuredLabel: string;
  expectedTodayLabel: string;
  actualLabel: string | null;
  statusKey: KeyTimeStatusKey;
  statusLabel: string;
  canAdjust: boolean;
  canComplete: boolean;
};

export type RunLocationAttention = {
  kind: "upcoming" | "needs_attention" | "all_caught_up" | "none";
  title: string;
  description: string;
};

export type RunLocationCurrentOperation = {
  state: "ACTIVE" | "NONE";
  /** Compatibility path label (Cycle → Phase). Prefer cycleLabel + phaseLabel. */
  hierarchyLabel: string | null;
  windowLabel: string | null;
  /** @deprecated Prefer cycleLabel — Operational Cycle display name. */
  parentLabel: string | null;
  /** Active Phase label, or null when the Cycle is active with no Phase covering now. */
  phaseLabel: string | null;
  /** Operational Cycle (root PERIOD) display name. */
  cycleLabel: string | null;
  /** All concurrently active Phase labels under this Cycle (overlap allowed). */
  activePhaseLabels: string[];
};

export type RunLocationNextKeyPoint = {
  label: string;
  dueLabel: string;
};

export type RunLocationOperationPresentation = {
  provenance: RunModelProvenance;
  location: RunLocationIdentity;
  currentOperation: RunLocationCurrentOperation;
  keyTimes: RunLocationKeyTimeView[];
  /** Next/relevant incomplete Key Point from existing Key Time facts only. */
  nextKeyPoint: RunLocationNextKeyPoint | null;
  attention: RunLocationAttention;
};

export type RunDepartmentPhaseView = {
  label: string;
  windowLabel: string;
  roomCount: number;
};

export type RunDepartmentCurrentOperation = {
  /** Operational Cycle (root) display name. */
  parentLabel: string;
  /** Alias of parentLabel for Cycle → Phase vocabulary. */
  cycleLabel: string;
  windowLabel: string | null;
  /** Primary Phase when exactly one child Phase is active; otherwise null. */
  phaseLabel: string | null;
  phases: RunDepartmentPhaseView[];
  /** PERIOD keys in this current group — used to join expected Work, not a second resolver. */
  cycleStableKeys: string[];
};

export type RunDepartmentKeyTimeSummary = {
  label: string;
  dueLabel: string;
  completed: number;
  total: number;
  overdue: number;
};

export type RunDepartmentOperationPresentation = {
  provenance: RunModelProvenance;
  configuration: RunDepartmentConfiguration;
  currentOperations: RunDepartmentCurrentOperation[];
  nextOperation: RunDepartmentNextOperation | null;
  keyTimeSummaries: RunDepartmentKeyTimeSummary[];
  overdueIncompleteCount: number;
};

const LEGACY_COPY = [
  "scheduled service times not configured",
  "this meal period",
  "servery milestones",
  "lunch service",
  "breakfast service",
  "dinner service",
  "service_started",
] as const;

export function publishedKeyTimeCycleIds(
  cycles: readonly OperationalCycleDefinition[],
): Set<string> {
  return new Set(
    cycles
      .filter(
        (cycle) =>
          cycle.nodeKind === "KEY_TIME" &&
          (cycle.status === "PUBLISHED" || cycle.status === "RETIRED"),
      )
      .map((cycle) => cycle.id),
  );
}

export function timingsForPublishedKeyTimeCycles(
  timings: readonly KeyTimeDayTiming[],
  cycles: readonly OperationalCycleDefinition[],
): KeyTimeDayTiming[] {
  const byId = new Map(
    cycles
      .filter(
        (cycle) =>
          cycle.nodeKind === "KEY_TIME" &&
          (cycle.status === "PUBLISHED" || cycle.status === "RETIRED"),
      )
      .map((cycle) => [cycle.id, cycle] as const),
  );
  return timings.filter((row) => {
    const cycle = byId.get(row.cycleId);
    if (!cycle) return false;
    const group = cycle.keyTimeGroups.find((item) => item.id === row.keyTimeGroupId);
    if (!group) return false;
    return group.spaceIds.includes(row.spaceId);
  });
}

/** Current-day Key Time rows for governing PUBLISHED versions only (excludes superseded RETIRED). */
export function currentPublishedKeyTimeTimings(
  cycles: readonly OperationalCycleDefinition[],
  timings: readonly KeyTimeDayTiming[],
): KeyTimeDayTiming[] {
  const publishedIds = new Set(
    cycles
      .filter((cycle) => cycle.nodeKind === "KEY_TIME" && cycle.status === "PUBLISHED")
      .map((cycle) => cycle.id),
  );
  return timingsForPublishedKeyTimeCycles(timings, cycles).filter((row) =>
    publishedIds.has(row.cycleId),
  );
}

export type CurrentDayKeyTimeGroupSummary = {
  cycleId: string;
  keyTimeGroupId: string;
  label: string;
  configuredDueLocal: string;
  dueLabel: string;
  completed: number;
  total: number;
  overdue: number;
  missingSpaceIds: string[];
};

/**
 * Canonical Today’s Work Key Time group truth:
 * published group Room membership ∩ current-day expectation rows
 * (stale cycle versions excluded). Total is membership, not found-row count.
 * Completion is actual timestamp; overdue is incomplete past expectedToday.
 */
function filterSpaceIds(
  spaceIds: readonly string[],
  spaceIdFilter?: ReadonlySet<string>,
): string[] {
  if (!spaceIdFilter) return [...spaceIds];
  return spaceIds.filter((spaceId) => spaceIdFilter.has(spaceId));
}

export function selectCurrentDayKeyTimeGroups(
  cycles: readonly OperationalCycleDefinition[],
  timings: readonly KeyTimeDayTiming[],
  nowLocalHhMm: string,
  spaceIdFilter?: ReadonlySet<string>,
): CurrentDayKeyTimeGroupSummary[] {
  const currentTimings = currentPublishedKeyTimeTimings(cycles, timings);
  const published = cycles.filter((cycle) => cycle.status === "PUBLISHED");
  const summaries: CurrentDayKeyTimeGroupSummary[] = [];

  for (const cycle of published) {
    if (cycle.nodeKind !== "KEY_TIME") continue;
    for (const group of cycle.keyTimeGroups) {
      if (!group.id) continue;
      const configuredDueLocal = group.dueLocal?.trim() ?? "";
      if (!configuredDueLocal || group.spaceIds.length === 0) continue;
      const membership = [
        ...new Set(filterSpaceIds(group.spaceIds.filter(Boolean), spaceIdFilter)),
      ];
      if (membership.length === 0) continue;
      const bySpace = new Map<string, KeyTimeDayTiming>();
      for (const row of currentTimings) {
        if (row.cycleId !== cycle.id || row.keyTimeGroupId !== group.id) continue;
        if (!membership.includes(row.spaceId)) continue;
        const existing = bySpace.get(row.spaceId);
        if (!existing || (row.actualDueLocal && !existing.actualDueLocal)) {
          bySpace.set(row.spaceId, row);
        }
      }

      let completed = 0;
      let overdue = 0;
      const missingSpaceIds: string[] = [];
      for (const spaceId of membership) {
        const row = bySpace.get(spaceId);
        if (!row) {
          missingSpaceIds.push(spaceId);
          const missingStatus = describeKeyTimeStatus({
            configuredDueLocal,
            adjustedDueLocal: null,
            actualDueLocal: null,
            nowLocalHhMm,
          });
          if (missingStatus.key === "overdue") overdue += 1;
          continue;
        }
        if (row.actualDueLocal) {
          completed += 1;
          continue;
        }
        const status = describeKeyTimeStatus({
          configuredDueLocal: row.configuredDueLocal,
          adjustedDueLocal: row.adjustedDueLocal,
          actualDueLocal: row.actualDueLocal,
          nowLocalHhMm,
        });
        if (status.key === "overdue") overdue += 1;
      }

      summaries.push({
        cycleId: cycle.id,
        keyTimeGroupId: group.id,
        label: cycle.label,
        configuredDueLocal,
        dueLabel: formatClock12(configuredDueLocal) ?? configuredDueLocal,
        completed,
        total: membership.length,
        overdue,
        missingSpaceIds,
      });
    }
  }

  return summaries.sort(
    (a, b) =>
      a.configuredDueLocal.localeCompare(b.configuredDueLocal) ||
      a.label.localeCompare(b.label),
  );
}

function publishedEffectiveCycles(
  cycles: readonly OperationalCycleDefinition[],
): OperationalCycleDefinition[] {
  return cycles.filter((cycle) => cycle.status === "PUBLISHED" || cycle.status === "RETIRED");
}

function hasPublishedPeriodWindow(cycle: OperationalCycleDefinition): boolean {
  return (
    cycle.nodeKind === "PERIOD" &&
    Boolean(cycle.startLocal?.trim()) &&
    Boolean(cycle.endLocal?.trim())
  );
}

/**
 * Current PERIOD model when a published PERIOD window exists and is not a
 * leftover SERVICE / READY / SERVICE_STARTED meal-service row.
 * KEY_TIME groups are optional.
 */
export function detectRunModelProvenance(
  cycles: readonly OperationalCycleDefinition[],
  timings: readonly KeyTimeDayTiming[] = [],
): RunModelProvenance {
  const published = publishedEffectiveCycles(cycles);
  const hasCurrentPeriod = published.some(
    (cycle) => hasPublishedPeriodWindow(cycle) && !isLegacyMealServiceCycle(cycle),
  );
  const hasKeyTimeNode = published.some(
    (cycle) =>
      cycle.nodeKind === "KEY_TIME" &&
      cycle.keyTimeGroups.some(
        (group) => Boolean(group.dueLocal?.trim()) && group.spaceIds.length > 0,
      ),
  );
  const ids = publishedKeyTimeCycleIds(published);
  const hasMaterialized = timings.some((row) => ids.has(row.cycleId));
  if (hasCurrentPeriod || hasKeyTimeNode || hasMaterialized) {
    return "NEW_PERIOD_KEY_TIME";
  }
  const hasLegacyMeal = published.some(
    (cycle) => hasPublishedPeriodWindow(cycle) && isLegacyMealServiceCycle(cycle),
  );
  return hasLegacyMeal ? "LEGACY_MEAL_SERVICE" : "NEW_PERIOD_KEY_TIME";
}

function cycleHasParticipatingLocations(
  cycle: OperationalCycleDefinition,
  allByKey: ReadonlyMap<string, OperationalCycleDefinition>,
): boolean {
  if (cycle.locationMode === "ALL_DEPARTMENT_UNITS") return true;
  if (cycle.locationMode === "UNIT_TYPES" && cycle.applicableUnitTypes.length > 0) return true;
  if (
    cycle.locationMode === "OPERATIONAL_TYPES" &&
    (cycle.applicableOperationalTypeKeys?.length ?? 0) > 0
  ) {
    return true;
  }
  if (cycle.locationMode === "ROOM_TYPE" && Boolean(cycle.roomTypeKey?.trim())) return true;
  if (cycle.unitIds.length > 0) return true;
  return effectiveCycleSpaceIds(cycle, allByKey).length > 0;
}

/** True when any published current-model PERIOD has usable location targeting. */
export function publishedPeriodHasParticipatingLocations(
  cycles: readonly OperationalCycleDefinition[],
): boolean {
  const published = publishedEffectiveCycles(cycles);
  const allByKey = buildCyclesByStableKey(published);
  return published.some(
    (cycle) =>
      hasPublishedPeriodWindow(cycle) &&
      !isLegacyMealServiceCycle(cycle) &&
      cycleHasParticipatingLocations(cycle, allByKey),
  );
}

export function describeDepartmentCycleConfiguration(
  cycles: readonly OperationalCycleDefinition[],
): RunDepartmentConfiguration {
  const published = publishedEffectiveCycles(cycles);
  const hasCurrentPeriod = published.some(
    (cycle) => hasPublishedPeriodWindow(cycle) && !isLegacyMealServiceCycle(cycle),
  );
  if (!hasCurrentPeriod) return "not_configured";
  if (!publishedPeriodHasParticipatingLocations(published)) return "missing_participation";
  return "configured";
}

export function presentationContainsLegacyMealCopy(text: string): boolean {
  const lower = text.toLowerCase();
  return LEGACY_COPY.some((fragment) => lower.includes(fragment));
}

function keyTimeLabel(timing: KeyTimeDayTiming): string {
  return timing.cycleLabel;
}

function presentKeyTimeView(
  timing: KeyTimeDayTiming,
  nowLocalHhMm: string,
  canAdjust: boolean,
  canComplete: boolean,
): RunLocationKeyTimeView {
  const status = describeKeyTimeStatus({
    configuredDueLocal: timing.configuredDueLocal,
    adjustedDueLocal: timing.adjustedDueLocal,
    actualDueLocal: timing.actualDueLocal,
    nowLocalHhMm,
  });
  return {
    expectationId: timing.expectationId,
    label: keyTimeLabel(timing),
    dueLabel: formatClock12(timing.expectedToday) ?? timing.expectedToday,
    configuredLabel: formatClock12(timing.configuredDueLocal) ?? timing.configuredDueLocal,
    expectedTodayLabel: formatClock12(timing.expectedToday) ?? timing.expectedToday,
    actualLabel: timing.actualDueLocal
      ? (formatClock12(timing.actualDueLocal) ?? timing.actualDueLocal)
      : null,
    statusKey: status.key,
    statusLabel: status.label,
    canAdjust: canAdjust && !timing.actualDueLocal,
    canComplete: canComplete && !timing.actualDueLocal,
  };
}

function presentAttention(
  keyTimes: readonly RunLocationKeyTimeView[],
  hasAnyConfig: boolean,
): RunLocationAttention {
  if (!hasAnyConfig && keyTimes.length === 0) {
    return {
      kind: "none",
      title: "No current operational items",
      description: "Nothing configured for this Room needs attention right now.",
    };
  }

  const incomplete = keyTimes.filter((row) => !row.actualLabel);
  const overdue = incomplete.filter((row) => row.statusKey === "overdue");
  const dueNow = incomplete.filter((row) => row.statusKey === "due");
  const upcoming = incomplete.filter(
    (row) => row.statusKey === "upcoming" || row.statusKey === "adjusted",
  );

  if (overdue.length > 0) {
    const first = overdue[0]!;
    return {
      kind: "needs_attention",
      title: "Needs attention",
      description: `${first.label} · ${first.statusLabel.toLowerCase()}`,
    };
  }
  if (dueNow.length > 0) {
    const first = dueNow[0]!;
    return {
      kind: "needs_attention",
      title: "Needs attention",
      description: `${first.label} · Due ${first.dueLabel}`,
    };
  }
  if (upcoming.length > 0) {
    const first = upcoming[0]!;
    return {
      kind: "upcoming",
      title: "Upcoming",
      description: `${first.label} · ${first.dueLabel}`,
    };
  }

  return {
    kind: "all_caught_up",
    title: "All caught up",
    description: "No overdue Key Points or other open operational items need attention right now.",
  };
}

export function presentLocationRunOperation(input: {
  cycles: readonly OperationalCycleDefinition[];
  timings: readonly KeyTimeDayTiming[];
  now: Date;
  facilityTimezone: string;
  operationalDateKey: string;
  spaceId: string;
  location: RunLocationIdentity;
  nowLocalHhMm: string;
  canAdjust?: boolean;
  canComplete?: boolean;
  /** Current Operational Type key — required for OPERATIONAL_TYPES targeting. */
  operationalTypeKey?: string | null;
}): RunLocationOperationPresentation {
  const scopedTimings = timingsForPublishedKeyTimeCycles(input.timings, input.cycles).filter(
    (row) => row.spaceId === input.spaceId,
  );
  const provenance = detectRunModelProvenance(input.cycles, input.timings);
  const context = resolveOperationalCycle({
    cycles: input.cycles,
    now: input.now,
    facilityTimezone: input.facilityTimezone,
    operationalDateKey: input.operationalDateKey,
    spaceId: input.spaceId,
    operationalTypeKey: input.operationalTypeKey,
  });

  let currentOperation: RunLocationCurrentOperation = {
    state: "NONE",
    hierarchyLabel: null,
    windowLabel: null,
    parentLabel: null,
    phaseLabel: null,
    cycleLabel: null,
    activePhaseLabels: [],
  };

  if (context.state === "ACTIVE") {
    const primary = context.primary;
    const { cycleLabel, phaseLabel } = resolveCycleAndPhaseLabels(primary);
    currentOperation = {
      state: "ACTIVE",
      // Compatibility path; Cycle + Phase are authoritative via cycleLabel / phaseLabel.
      hierarchyLabel: formatCycleHierarchyLabel(primary),
      windowLabel: formatCycleWindow(primary.startLocal, primary.endLocal),
      parentLabel: cycleLabel,
      phaseLabel,
      cycleLabel,
      activePhaseLabels: activePhaseLabelsForCycle(primary, context.activeCycles),
    };
  }

  const keyTimes = scopedTimings.map((timing) =>
    presentKeyTimeView(
      timing,
      input.nowLocalHhMm,
      input.canAdjust === true,
      input.canComplete === true,
    ),
  );

  const hasAnyConfig =
    context.state === "ACTIVE" ||
    context.state === "UPCOMING" ||
    context.state === "BETWEEN" ||
    context.state === "DAY_COMPLETE" ||
    keyTimes.length > 0;

  return {
    provenance,
    location: {
      ...input.location,
      spaceId: input.spaceId,
    },
    currentOperation,
    keyTimes,
    nextKeyPoint: selectNextKeyPointSummary(keyTimes),
    attention: presentAttention(keyTimes, hasAnyConfig),
  };
}

function roomCountSpaceIds(
  cycle: OperationalCycleDefinition | undefined,
  allByKey: ReadonlyMap<string, OperationalCycleDefinition>,
  functionSpaces?: readonly { id: string; operationalTypeKey?: string | null }[],
): string[] {
  if (!cycle) return [];
  if (functionSpaces) {
    return resolveWorkCycleRoomParticipation(cycle, allByKey, functionSpaces).spaceIds;
  }
  return effectiveCycleSpaceIds(cycle, allByKey);
}

export function presentDepartmentRunOperation(input: {
  cycles: readonly OperationalCycleDefinition[];
  timings: readonly KeyTimeDayTiming[];
  now: Date;
  facilityTimezone: string;
  operationalDateKey: string;
  nowLocalHhMm: string;
  spaceIdFilter?: ReadonlySet<string>;
  /** Rooms and their adopted Location Function keys. Same binding set Work uses. */
  functionSpaces?: readonly { id: string; operationalTypeKey?: string | null }[];
}): RunDepartmentOperationPresentation {
  const provenance = detectRunModelProvenance(input.cycles, input.timings);
  const defsByKey = buildCyclesByStableKey(
    input.cycles.filter((cycle) => cycle.status === "PUBLISHED" || cycle.status === "RETIRED"),
  );
  const context = resolveOperationalCycle({
    cycles: input.cycles,
    now: input.now,
    facilityTimezone: input.facilityTimezone,
    operationalDateKey: input.operationalDateKey,
  });

  const currentOperations: RunDepartmentCurrentOperation[] = [];
  if (context.state === "ACTIVE") {
    const groups = new Map<string, typeof context.activeCycles>();
    for (const occ of context.activeCycles) {
      const root = occ.ancestorLabels[0] ?? occ.label;
      const list = groups.get(root) ?? [];
      list.push(occ);
      groups.set(root, list);
    }
    for (const [parentLabel, occs] of groups) {
      const parentOcc = occs.find((occ) => occ.label === parentLabel && occ.depth === 0) ?? null;
      const phases = occs.filter((occ) => occ.depth > 0 || !occ.hasChildren);
      const phaseViews: RunDepartmentPhaseView[] = phases
        .filter((occ) => !(parentOcc && occ.id === parentOcc.id && occ.hasChildren))
        .map((occ) => ({
          label: occ.label,
          windowLabel: formatCycleWindow(occ.startLocal, occ.endLocal),
          roomCount: filterSpaceIds(
            roomCountSpaceIds(defsByKey.get(occ.stableKey), defsByKey, input.functionSpaces),
            input.spaceIdFilter,
          ).length,
        }))
        .filter((phase) => !input.spaceIdFilter || phase.roomCount > 0);
      if (input.spaceIdFilter && phaseViews.length === 0) continue;
      const primaryPhase =
        phaseViews.length === 1 ? phaseViews[0]!.label : null;
      currentOperations.push({
        parentLabel,
        cycleLabel: parentLabel,
        phaseLabel: primaryPhase,
        windowLabel: parentOcc
          ? formatCycleWindow(parentOcc.startLocal, parentOcc.endLocal)
          : (occs[0] ? formatCycleWindow(occs[0].startLocal, occs[0].endLocal) : null),
        phases: phaseViews,
        cycleStableKeys: [...new Set(occs.map((occ) => occ.stableKey))],
      });
    }
  }

  const groups = selectCurrentDayKeyTimeGroups(
    input.cycles,
    input.timings,
    input.nowLocalHhMm,
    input.spaceIdFilter,
  );
  const keyTimeSummaries: RunDepartmentKeyTimeSummary[] = groups.map((group) => ({
    label: group.label,
    dueLabel: group.dueLabel,
    completed: group.completed,
    total: group.total,
    overdue: group.overdue,
  }));
  const overdueIncompleteCount = groups.reduce((sum, group) => sum + group.overdue, 0);

  let nextOperation: RunDepartmentNextOperation | null = null;
  if (context.state === "ACTIVE" || context.state === "UPCOMING" || context.state === "BETWEEN") {
    const next = context.next;
    if (next) {
      const roomCount = filterSpaceIds(
        roomCountSpaceIds(defsByKey.get(next.stableKey), defsByKey, input.functionSpaces),
        input.spaceIdFilter,
      ).length;
      if (!input.spaceIdFilter || roomCount > 0) {
        nextOperation = {
          label: formatCycleHierarchyLabel(next),
          windowLabel: formatCycleWindow(next.startLocal, next.endLocal),
          minutesUntil: context.minutesUntilNext,
          cycleStableKey: next.stableKey,
        };
      }
    }
  }

  return {
    provenance,
    configuration: describeDepartmentCycleConfiguration(input.cycles),
    currentOperations,
    nextOperation,
    keyTimeSummaries,
    overdueIncompleteCount,
  };
}

export function serializeLocationRunProof(view: RunLocationOperationPresentation): {
  provenance: RunModelProvenance;
  title: string;
  roomTypeLabel: string | null;
  current: string | null;
  cycle: string | null;
  phase: string | null;
  window: string | null;
  keyTimes: Array<{ label: string; due: string; status: string }>;
  nextKeyPoint: { label: string; due: string } | null;
  attentionKind: RunLocationAttention["kind"];
} {
  const active = view.currentOperation.state === "ACTIVE";
  return {
    provenance: view.provenance,
    title: view.location.title,
    roomTypeLabel: view.location.roomTypeLabel,
    current: active ? view.currentOperation.cycleLabel : null,
    cycle: active ? view.currentOperation.cycleLabel : null,
    phase: active ? view.currentOperation.phaseLabel : null,
    window: view.currentOperation.windowLabel,
    keyTimes: view.keyTimes.map((row) => ({
      label: row.label,
      due: row.dueLabel,
      status: row.statusKey,
    })),
    nextKeyPoint: view.nextKeyPoint
      ? { label: view.nextKeyPoint.label, due: view.nextKeyPoint.dueLabel }
      : null,
    attentionKind: view.attention.kind,
  };
}
