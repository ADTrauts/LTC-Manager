/**
 * Runtime Location State → Locations landing rows.
 *
 * Labels, counts, truncation. Does not query, resolve applicability,
 * evaluate coverage, or infer asset impact.
 */

import { locationProgramIsAttached } from "@/lib/department-administration/location-program";
import type {
  RuntimeCoverageState,
  RuntimeCurrentOperation,
  RuntimeException,
  RuntimeLocationState,
  RuntimeNextEvent,
} from "@/lib/runtime-location-state";

import type {
  LocationLandingRowState,
  LocationLandingSpaceAncestry,
  LocationsLandingPresentation,
} from "./types";
import {
  LANDING_COVERAGE_UNAVAILABLE_LABEL,
  LANDING_NO_ACTIVE_OPERATION_LABEL,
  LANDING_UNTYPED_LABEL,
} from "./types";

const MAX_EXCEPTION_LABELS = 2;

export function departmentLocationsConfigureHref(departmentId: string): string {
  return `/admin/departments/${departmentId}?tab=locations`;
}

function operationLine(operation: RuntimeCurrentOperation): string {
  if (operation.state === "ACTIVE" && operation.current) {
    const label = operation.current.hierarchyLabel ?? operation.current.label;
    return `${label} · Active`;
  }
  return LANDING_NO_ACTIVE_OPERATION_LABEL;
}

function formatNext(next: RuntimeNextEvent, timezone: string): string {
  const time = next.at.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
  return `Next: ${next.label} · ${time}`;
}

function exceptionPreview(exceptions: readonly RuntimeException[]): {
  labels: string[];
  moreCount: number;
} {
  const labels = exceptions.map((row) => row.label);
  return {
    labels: labels.slice(0, MAX_EXCEPTION_LABELS),
    moreCount: Math.max(0, labels.length - MAX_EXCEPTION_LABELS),
  };
}

function spaceCoverageLabel(coverage: RuntimeCoverageState): string | null {
  if (coverage.availability === "feature_disabled") {
    return LANDING_COVERAGE_UNAVAILABLE_LABEL;
  }
  return null;
}

export function presentLandingSpace(
  state: RuntimeLocationState,
  options: { canConfigureLocations?: boolean } = {},
): LocationLandingRowState {
  const unprogrammed = !locationProgramIsAttached(state.program.locationProgram);
  const preview = exceptionPreview(state.exceptions);
  const configureHref =
    unprogrammed && options.canConfigureLocations
      ? departmentLocationsConfigureHref(state.identity.location.departmentId)
      : null;

  return {
    grain: "SPACE",
    operationLabel: operationLine(state.operation),
    configurationLabel: unprogrammed ? LANDING_UNTYPED_LABEL : null,
    exceptionLabels: preview.labels,
    moreExceptionCount: preview.moreCount,
    nextLabel: state.next ? formatNext(state.next, state.asOf.timezone) : null,
    coverageLabel: spaceCoverageLabel(state.coverage),
    summaryFacts: [],
    needsAttention: state.exceptions.length > 0,
    configureHref,
  };
}

function uniqueActiveOperationKeys(states: readonly RuntimeLocationState[]): string[] {
  return [
    ...new Set(
      states
        .filter((state) => state.operation.state === "ACTIVE")
        .map((state) => state.operation.current?.cycleStableKey)
        .filter((key): key is string => Boolean(key)),
    ),
  ];
}

function uniqueActiveOperationLabels(states: readonly RuntimeLocationState[]): string[] {
  return [
    ...new Set(
      states
        .filter((state) => state.operation.state === "ACTIVE")
        .map((state) => state.operation.current?.hierarchyLabel ?? state.operation.current?.label)
        .filter((label): label is string => Boolean(label)),
    ),
  ];
}

export function presentLandingNeighborhood(
  states: readonly RuntimeLocationState[],
): LocationLandingRowState {
  const keys = uniqueActiveOperationKeys(states);
  const labels = uniqueActiveOperationLabels(states);
  let operationLabel: string | null = LANDING_NO_ACTIVE_OPERATION_LABEL;
  if (keys.length === 1 && labels.length === 1) {
    operationLabel = `${labels[0]} · Active`;
  } else if (keys.length > 1 || labels.length > 1) {
    const count = Math.max(keys.length, labels.length);
    operationLabel = `${count} active operations`;
  } else if (states.length === 0) {
    operationLabel = null;
  }

  const needsAttentionCount = states.filter((state) => state.exceptions.length > 0).length;
  const overdueEvidenceCount = states.reduce(
    (sum, state) => sum + state.evidence.overdue.length,
    0,
  );

  const summaryFacts: string[] = [];
  if (states.length > 0) {
    summaryFacts.push(
      states.length === 1
        ? "1 operational space"
        : `${states.length} operational spaces`,
    );
  }
  if (needsAttentionCount > 0) {
    summaryFacts.push(
      needsAttentionCount === 1
        ? "1 needs attention"
        : `${needsAttentionCount} need attention`,
    );
  }
  if (overdueEvidenceCount > 0) {
    summaryFacts.push(
      overdueEvidenceCount === 1
        ? "1 overdue log"
        : `${overdueEvidenceCount} overdue logs`,
    );
  }

  return {
    grain: "NEIGHBORHOOD",
    operationLabel,
    configurationLabel: null,
    exceptionLabels: [],
    moreExceptionCount: 0,
    nextLabel: null,
    coverageLabel: neighborhoodCoverageLabel(states),
    summaryFacts,
    needsAttention: needsAttentionCount > 0,
    configureHref: null,
  };
}

export function neighborhoodCoverageLabel(
  states: readonly RuntimeLocationState[],
): string | null {
  if (states.length === 0) return null;
  if (states.every((state) => state.coverage.availability === "feature_disabled")) {
    return LANDING_COVERAGE_UNAVAILABLE_LABEL;
  }

  const evaluated = states.filter((state) => state.coverage.availability === "evaluated");
  const required = evaluated.filter((state) =>
    state.coverage.slots.some((slot) => slot.state !== "NOT_APPLICABLE"),
  );
  if (required.length === 0) return null;

  const covered = required.filter((state) => {
    const relevant = state.coverage.slots.filter((slot) => slot.state !== "NOT_APPLICABLE");
    return relevant.length > 0 && relevant.every((slot) => slot.state === "COVERED");
  }).length;

  if (covered === required.length) return null;
  return `${covered} of ${required.length} location responsibilities covered`;
}

export function presentLandingFloor(
  states: readonly RuntimeLocationState[],
): LocationLandingRowState {
  const attentionCount = states.filter((state) => state.exceptions.length > 0).length;
  return {
    grain: "FLOOR",
    operationLabel: null,
    configurationLabel: null,
    exceptionLabels: [],
    moreExceptionCount: 0,
    nextLabel: null,
    coverageLabel: null,
    summaryFacts: [
      attentionCount === 0
        ? "All current"
        : attentionCount === 1
          ? "1 location needs attention"
          : `${attentionCount} locations need attention`,
    ],
    needsAttention: attentionCount > 0,
    configureHref: null,
  };
}

export function buildLocationsLandingPresentation(input: {
  ancestry: readonly LocationLandingSpaceAncestry[];
  states: readonly RuntimeLocationState[];
  canConfigureLocations?: boolean;
}): LocationsLandingPresentation {
  const bySpaceId = new Map(
    input.states.map((state) => [state.identity.location.spaceId, state]),
  );
  const byNodeId: Record<string, LocationLandingRowState> = {};
  const neighborhoodBuckets = new Map<string, RuntimeLocationState[]>();
  const floorBuckets = new Map<string, RuntimeLocationState[]>();

  for (const row of input.ancestry) {
    const state = bySpaceId.get(row.spaceId);
    if (!state) continue;
    byNodeId[row.spaceNodeId] = presentLandingSpace(state, {
      canConfigureLocations: input.canConfigureLocations,
    });
    if (row.neighborhoodNodeId) {
      const list = neighborhoodBuckets.get(row.neighborhoodNodeId) ?? [];
      list.push(state);
      neighborhoodBuckets.set(row.neighborhoodNodeId, list);
    }
    if (row.floorNodeId) {
      const list = floorBuckets.get(row.floorNodeId) ?? [];
      list.push(state);
      floorBuckets.set(row.floorNodeId, list);
    }
  }

  for (const [nodeId, states] of neighborhoodBuckets) {
    byNodeId[nodeId] = presentLandingNeighborhood(states);
  }
  for (const [nodeId, states] of floorBuckets) {
    byNodeId[nodeId] = presentLandingFloor(states);
  }

  return {
    byNodeId,
    spaceCount: input.ancestry.length,
  };
}
