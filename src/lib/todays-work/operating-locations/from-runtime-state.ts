/**
 * Today's Work presentation adapter.
 *
 * RuntimeLocationState[] → existing SupervisorOperatingLocation cards.
 * Labels, counts, groups, sorts. Does not query Prisma or re-resolve domain truth.
 *
 * Neighborhood rows aggregate already-composed SPACE states.
 */

import type { OperationContext } from "@/lib/operations-center";
import type { RunLocationKeyTimeView } from "@/lib/operational-cycles/present-run-operation";
import {
  exceptionSortRank,
  type RuntimeCoverageState,
  type RuntimeException,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";

import {
  selectPrimaryKeyTime,
  sortOperatingLocationsForWalk,
  summarizeOperatingLocationBoard,
  type RoomOperationView,
} from "./build";
import type {
  OperatingLocationBoard,
  OperatingLocationCurrentOperation,
  OperatingLocationIssue,
  OperatingLocationKeyTime,
  OperatingLocationStaffing,
  OperatingLocationStatus,
  OperatingLocationStatusKey,
  SupervisorOperatingLocation,
} from "./types";

export const COVERAGE_UNAVAILABLE_LABEL = "Coverage unavailable";

function contextLabelFor(
  location: SupervisorOperatingLocation,
  lensMode: "DEPARTMENT" | "FACILITY",
): string | null {
  const parts: string[] = [];
  if (lensMode === "FACILITY" && location.departmentLabel) {
    parts.push(location.departmentLabel);
  }
  if (location.kind === "NEIGHBORHOOD") {
    if (location.rooms.length === 1) {
      const room = location.rooms[0]!;
      parts.push(...[room.name, room.roomTypeLabel].filter((value): value is string => Boolean(value)));
    } else if (location.rooms.length > 1) {
      parts.push(`${location.rooms.length} rooms`);
    } else if (location.floorLabel) {
      parts.push(location.floorLabel);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  const room = location.rooms[0];
  if (room?.roomTypeLabel) parts.push(room.roomTypeLabel);
  else if (location.floorLabel) parts.push(location.floorLabel);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function hrefFor(location: SupervisorOperatingLocation): string {
  if (location.rooms.length === 1) return location.rooms[0]!.href;
  return `/unit/${location.unitId}`;
}

function issueSummary(issues: readonly OperatingLocationIssue[]): string | null {
  if (issues.length === 0) return null;
  return [...new Set(issues.map((issue) => issue.label))].slice(0, 3).join(" · ");
}

export function presentCoverageFromRuntime(
  coverages: readonly RuntimeCoverageState[],
  spaceCount: number,
): OperatingLocationStaffing {
  if (coverages.every((row) => row.availability === "feature_disabled")) {
    return {
      kind: "unknown",
      label: COVERAGE_UNAVAILABLE_LABEL,
      assignedCount: null,
      expectedCount: null,
    };
  }
  if (
    coverages.every(
      (row) =>
        row.availability === "no_published_expectations" ||
        row.availability === "not_applicable" ||
        (row.availability === "evaluated" && row.slots.length === 0),
    )
  ) {
    return {
      kind: "unknown",
      label: COVERAGE_UNAVAILABLE_LABEL,
      assignedCount: null,
      expectedCount: null,
    };
  }

  const evaluated = coverages.filter((row) => row.availability === "evaluated");
  const slots = evaluated.flatMap((row) =>
    row.slots.filter((slot) => slot.state !== "NOT_APPLICABLE"),
  );
  const assignedCount = slots.reduce((sum, slot) => sum + slot.filledCount, 0);
  const expectedCount = slots.reduce((sum, slot) => sum + slot.requiredCount, 0);
  const hasUncovered = slots.some((slot) => slot.state === "UNCOVERED");
  const hasAtRisk = slots.some((slot) => slot.state === "AT_RISK");
  const notYet = slots.every(
    (slot) => slot.state === "NOT_YET_ASSIGNED" || slot.state === "NOT_CONFIRMED",
  );

  if (spaceCount > 1) {
    const requiredLocations = evaluated.filter((row) =>
      row.slots.some((slot) => slot.state !== "NOT_APPLICABLE"),
    ).length;
    const coveredLocations = evaluated.filter((row) => {
      const relevant = row.slots.filter((slot) => slot.state !== "NOT_APPLICABLE");
      return (
        relevant.length > 0 &&
        relevant.every((slot) => slot.state === "COVERED")
      );
    }).length;
    if (requiredLocations > 0) {
      if (hasUncovered) {
        return {
          kind: "uncovered",
          label: `${coveredLocations} of ${requiredLocations} location responsibilities covered`,
          assignedCount,
          expectedCount,
        };
      }
      if (hasAtRisk) {
        return {
          kind: "short",
          label: `${coveredLocations} of ${requiredLocations} location responsibilities covered`,
          assignedCount,
          expectedCount,
        };
      }
      return {
        kind: "covered",
        label: `${coveredLocations} of ${requiredLocations} location responsibilities covered`,
        assignedCount,
        expectedCount,
      };
    }
  }

  if (notYet && expectedCount > 0) {
    const confirmed = slots.some((slot) => slot.state === "NOT_CONFIRMED");
    return {
      kind: "unknown",
      label: confirmed ? "Not confirmed" : "Not yet assigned",
      assignedCount,
      expectedCount,
    };
  }
  if (hasUncovered) {
    return {
      kind: "uncovered",
      label: "Uncovered",
      assignedCount,
      expectedCount,
    };
  }
  if (hasAtRisk) {
    return {
      kind: "short",
      label: "At risk",
      assignedCount,
      expectedCount,
    };
  }
  if (expectedCount > 0 && assignedCount >= expectedCount) {
    return {
      kind: "covered",
      label: `Covered · ${assignedCount} assigned`,
      assignedCount,
      expectedCount,
    };
  }
  return {
    kind: "unknown",
    label: COVERAGE_UNAVAILABLE_LABEL,
    assignedCount: assignedCount || null,
    expectedCount: expectedCount || null,
  };
}

export function aggregateOperationFromRuntime(
  states: readonly RuntimeLocationState[],
): OperatingLocationCurrentOperation {
  const active = states.filter((state) => state.operation.state === "ACTIVE");
  const keys = [
    ...new Set(
      active
        .map((state) => state.operation.current?.cycleStableKey)
        .filter((key): key is string => Boolean(key)),
    ),
  ];
  const labels = [
    ...new Set(
      active
        .map((state) => state.operation.current?.hierarchyLabel ?? state.operation.current?.label)
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  if (labels.length === 0) {
    return { label: null, detail: null, phaseCount: 0 };
  }
  if (keys.length <= 1 && labels.length === 1) {
    return { label: labels[0]!, detail: null, phaseCount: 1 };
  }
  return {
    label: `${labels.length} active phases`,
    detail: labels.join(" · "),
    phaseCount: labels.length,
  };
}

function keyTimeViewFromState(state: RuntimeLocationState): RunLocationKeyTimeView[] {
  return state.milestones.items
    .filter((item) => item.canonical && item.kind === "KEY_TIME")
    .map((item) => ({
      expectationId: item.label,
      label: item.label,
      dueLabel: item.timing.expectedToday ?? item.timing.configured ?? "",
      configuredLabel: item.timing.configured ?? "",
      expectedTodayLabel: item.timing.expectedToday ?? item.timing.configured ?? "",
      actualLabel: item.timing.actual,
      statusKey: item.statusKey === "not_recorded" ? "upcoming" : item.statusKey,
      statusLabel: item.statusKey,
      canAdjust: false,
      canComplete: false,
    }));
}

function issuesFromRuntime(
  states: readonly RuntimeLocationState[],
): OperatingLocationIssue[] {
  const issues: OperatingLocationIssue[] = [];
  for (const state of states) {
    const spaceId = state.identity.location.spaceId;
    const spaceName = state.identity.displayName;
    for (const exception of state.exceptions) {
      if (exception.source === "coverage") {
        issues.push({
          kind: "staffing",
          label: exception.label,
          spaceId,
          spaceName,
        });
      } else if (exception.source === "evidence" || exception.source === "corrective_action") {
        issues.push({
          kind: "log",
          label: exception.label,
          spaceId,
          spaceName,
        });
      } else if (exception.source === "milestone") {
        issues.push({
          kind: "key_time",
          label: exception.label,
          spaceId,
          spaceName,
        });
      } else if (exception.source === "asset_issue") {
        issues.push({
          kind: "repair",
          label: exception.label,
          spaceId,
          spaceName,
        });
      }
    }
  }
  return issues;
}

function derivedStatusFromRuntime(
  states: readonly RuntimeLocationState[],
  exceptions: readonly RuntimeException[],
  keyTime: OperatingLocationKeyTime | null,
): OperatingLocationStatusKey {
  if (exceptions.length > 0) return "needs_attention";
  const dueNow =
    keyTime?.statusKey === "due" ||
    states.some((state) => state.evidence.dueNow.length > 0);
  if (dueNow) return "in_progress";
  return "on_track";
}

function earliestNext(states: readonly RuntimeLocationState[]): Date | null {
  const times = states
    .map((state) => state.next?.at.getTime())
    .filter((value): value is number => typeof value === "number");
  if (times.length === 0) return null;
  return new Date(Math.min(...times));
}

export function projectOperatingLocationFromRuntime(input: {
  location: SupervisorOperatingLocation;
  states: readonly RuntimeLocationState[];
  lensMode?: "DEPARTMENT" | "FACILITY";
}): OperatingLocationStatus {
  const rooms = input.location.rooms.map((room) => {
    const state = input.states.find((row) => row.identity.location.spaceId === room.spaceId);
    return state?.identity.physical.roomTypeLabel
      ? { ...room, roomTypeLabel: state.identity.physical.roomTypeLabel }
      : room;
  });
  const location = { ...input.location, rooms };
  const staffing = presentCoverageFromRuntime(
    input.states.map((state) => state.coverage),
    input.states.length,
  );
  const currentOperation = aggregateOperationFromRuntime(input.states);
  const views: RoomOperationView[] = input.states.map((state) => ({
    spaceId: state.identity.location.spaceId,
    presentation: {
      provenance: state.operation.provenance,
      location: {
        title: state.identity.displayName,
        roomTypeLabel: state.identity.physical.roomTypeLabel,
        contextLabel: location.displayName,
        spaceId: state.identity.location.spaceId,
        unitId: state.identity.location.unitId,
      },
      currentOperation: {
        state: state.operation.state,
        hierarchyLabel: state.operation.current?.hierarchyLabel ?? null,
        windowLabel:
          state.operation.current?.window.start && state.operation.current.window.end
            ? `${state.operation.current.window.start}–${state.operation.current.window.end}`
            : null,
        parentLabel: null,
        phaseLabel: null,
      },
      keyTimes: keyTimeViewFromState(state),
      attention: { kind: "none", title: "", description: "" },
    },
  }));
  const keyTime = selectPrimaryKeyTime(views);
  const issues = issuesFromRuntime(input.states);
  const exceptions = input.states.flatMap((state) => state.exceptions);
  const derivedStatus = derivedStatusFromRuntime(input.states, exceptions, keyTime);

  return {
    location,
    displayName: location.displayName,
    contextLabel: contextLabelFor(location, input.lensMode ?? "DEPARTMENT"),
    href: hrefFor(location),
    staffing,
    currentOperation,
    keyTime,
    issues,
    derivedStatus,
    issueSummary: issueSummary(issues),
    facilityOrder: location.facilityOrder,
    riskPriority: 40 - exceptionSortRank(exceptions) * 10,
    floorLabel: location.floorLabel,
  };
}

export function sortOperatingLocationsByRuntimeExceptions(
  locations: readonly OperatingLocationStatus[],
  statesBySpaceId: ReadonlyMap<string, RuntimeLocationState>,
): OperatingLocationStatus[] {
  return [...locations].sort((a, b) => {
    const aExceptions = a.location.rooms.flatMap(
      (room) => statesBySpaceId.get(room.spaceId)?.exceptions ?? [],
    );
    const bExceptions = b.location.rooms.flatMap(
      (room) => statesBySpaceId.get(room.spaceId)?.exceptions ?? [],
    );
    const rankDiff = exceptionSortRank(aExceptions) - exceptionSortRank(bExceptions);
    if (rankDiff !== 0) return rankDiff;
    return a.facilityOrder - b.facilityOrder;
  });
}

export function projectOperatingLocationBoardFromRuntime(input: {
  locations: readonly SupervisorOperatingLocation[];
  states: readonly RuntimeLocationState[];
  lensMode?: "DEPARTMENT" | "FACILITY";
  sort?: "board" | "walk";
}): OperatingLocationBoard {
  const statesBySpaceId = new Map(
    input.states.map((state) => [state.identity.location.spaceId, state] as const),
  );
  const rows = input.locations.map((location) =>
    projectOperatingLocationFromRuntime({
      location,
      states: location.rooms
        .map((room) => statesBySpaceId.get(room.spaceId))
        .filter((state): state is RuntimeLocationState => state != null),
      lensMode: input.lensMode,
    }),
  );
  const sorted =
    input.sort === "walk"
      ? sortOperatingLocationsForWalk(rows)
      : sortOperatingLocationsByRuntimeExceptions(rows, statesBySpaceId);

  return {
    locations: sorted,
    summary: summarizeOperatingLocationBoard(sorted),
    lensMode: input.lensMode ?? "DEPARTMENT",
  };
}

export function operationContextFromRuntimeStates(
  states: readonly RuntimeLocationState[],
  fallback: OperationContext,
): OperationContext {
  const active = states.filter((state) => state.operation.state === "ACTIVE");
  const labels = [
    ...new Set(
      active
        .map((state) => state.operation.current?.label)
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  const nextTimes = states
    .map((state) => state.next)
    .filter((event): event is NonNullable<typeof event> => event != null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const earliest = nextTimes[0] ?? null;
  const now = states[0]?.asOf.now.getTime() ?? Date.now();

  return {
    mealType: fallback.mealType,
    mealLabel: labels[0] ?? fallback.mealLabel,
    serviceLabel: labels[0] ?? fallback.serviceLabel,
    phase: active.length > 0 ? "Execution" : "Preparation",
    scheduledTimeLabel: active[0]?.operation.current?.window.start ?? fallback.scheduledTimeLabel,
    minutesUntilService: earliest
      ? Math.round((earliest.at.getTime() - now) / 60_000)
      : fallback.minutesUntilService,
  };
}

export { earliestNext };
