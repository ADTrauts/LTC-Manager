/**
 * Pure Run presentation for published PERIOD / KEY_TIME configuration.
 * Does not invent meal-service copy. Legacy meal banners stay on the legacy path.
 */

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
  formatCycleHierarchyLabel,
  resolveOperationalCycle,
} from "./resolve-operational-cycle";
import type { OperationalCycleDefinition } from "./types";

export type RunModelProvenance = "NEW_PERIOD_KEY_TIME" | "LEGACY_MEAL_SERVICE";

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
  hierarchyLabel: string | null;
  windowLabel: string | null;
  parentLabel: string | null;
  phaseLabel: string | null;
};

export type RunLocationOperationPresentation = {
  provenance: RunModelProvenance;
  location: RunLocationIdentity;
  currentOperation: RunLocationCurrentOperation;
  keyTimes: RunLocationKeyTimeView[];
  attention: RunLocationAttention;
};

export type RunDepartmentPhaseView = {
  label: string;
  windowLabel: string;
  roomCount: number;
};

export type RunDepartmentCurrentOperation = {
  parentLabel: string;
  windowLabel: string | null;
  phases: RunDepartmentPhaseView[];
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
  currentOperations: RunDepartmentCurrentOperation[];
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

/**
 * New-model when the effective published set has PERIOD windows plus KEY_TIME
 * nodes (or already-materialized expectations for those nodes).
 * Never uses meal labels or department key.
 */
export function detectRunModelProvenance(
  cycles: readonly OperationalCycleDefinition[],
  timings: readonly KeyTimeDayTiming[] = [],
): RunModelProvenance {
  const published = cycles.filter(
    (cycle) => cycle.status === "PUBLISHED" || cycle.status === "RETIRED",
  );
  const hasPeriod = published.some(
    (cycle) =>
      cycle.nodeKind === "PERIOD" &&
      Boolean(cycle.startLocal?.trim()) &&
      Boolean(cycle.endLocal?.trim()),
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
  if (hasPeriod && (hasKeyTimeNode || hasMaterialized)) {
    return "NEW_PERIOD_KEY_TIME";
  }
  return "LEGACY_MEAL_SERVICE";
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
    description: "No overdue Key Times or other open operational items need attention right now.",
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
  };

  if (context.state === "ACTIVE") {
    const primary = context.primary;
    currentOperation = {
      state: "ACTIVE",
      hierarchyLabel: formatCycleHierarchyLabel(primary),
      windowLabel: formatCycleWindow(primary.startLocal, primary.endLocal),
      parentLabel: primary.ancestorLabels[0] ?? null,
      phaseLabel: primary.depth > 0 ? primary.label : null,
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
    attention: presentAttention(keyTimes, hasAnyConfig),
  };
}

function roomCountSpaceIds(
  cycle: OperationalCycleDefinition | undefined,
  allByKey: ReadonlyMap<string, OperationalCycleDefinition>,
): string[] {
  if (!cycle) return [];
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
            roomCountSpaceIds(defsByKey.get(occ.stableKey), defsByKey),
            input.spaceIdFilter,
          ).length,
        }))
        .filter((phase) => !input.spaceIdFilter || phase.roomCount > 0);
      if (input.spaceIdFilter && phaseViews.length === 0) continue;
      currentOperations.push({
        parentLabel,
        windowLabel: parentOcc
          ? formatCycleWindow(parentOcc.startLocal, parentOcc.endLocal)
          : (occs[0] ? formatCycleWindow(occs[0].startLocal, occs[0].endLocal) : null),
        phases: phaseViews,
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

  return {
    provenance,
    currentOperations,
    keyTimeSummaries,
    overdueIncompleteCount,
  };
}

export function serializeLocationRunProof(view: RunLocationOperationPresentation): {
  provenance: RunModelProvenance;
  title: string;
  roomTypeLabel: string | null;
  current: string | null;
  window: string | null;
  keyTimes: Array<{ label: string; due: string; status: string }>;
  attentionKind: RunLocationAttention["kind"];
} {
  return {
    provenance: view.provenance,
    title: view.location.title,
    roomTypeLabel: view.location.roomTypeLabel,
    current:
      view.currentOperation.state === "ACTIVE" ? view.currentOperation.hierarchyLabel : null,
    window: view.currentOperation.windowLabel,
    keyTimes: view.keyTimes.map((row) => ({
      label: row.label,
      due: row.dueLabel,
      status: row.statusKey,
    })),
    attentionKind: view.attention.kind,
  };
}
