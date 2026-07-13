import { hashOperationalSnapshot } from "./sanitize-snapshot";
import type {
  DiffOperationalSnapshotsInput,
  OperationalSnapshotDiff,
  SnapshotDiffDirection,
  SnapshotDiffItem,
} from "./snapshot-diff-types";
import type {
  OperationalSnapshot,
  OperationalSnapshotHandoff,
  OperationalSnapshotPriorityLocation,
  SnapshotReadinessState,
} from "./types";

const STATE_RANK: Record<SnapshotReadinessState, number> = {
  ready: 0,
  in_progress: 1,
  needs_attention: 2,
};

function directionForStateChange(
  from: SnapshotReadinessState,
  to: SnapshotReadinessState,
): SnapshotDiffDirection {
  if (from === to) return "unchanged";
  return STATE_RANK[to] > STATE_RANK[from] ? "worsened" : "improved";
}

function handoffKey(h: OperationalSnapshotHandoff): string {
  return `${h.type}|${h.location}|${h.sourcePath}`;
}

function locationMap(snapshot: OperationalSnapshot): Map<string, OperationalSnapshotPriorityLocation> {
  return new Map(snapshot.priorityLocations.map((loc) => [loc.unitId, loc]));
}

function handoffMap(snapshot: OperationalSnapshot): Map<string, OperationalSnapshotHandoff> {
  return new Map(snapshot.handoffs.map((h) => [handoffKey(h), h]));
}

function pushItem(
  items: SnapshotDiffItem[],
  item: Omit<SnapshotDiffItem, "sortKey"> & { sortKey?: string },
): void {
  items.push({
    ...item,
    sortKey: item.sortKey ?? `${item.category}:${item.direction}:${item.text}`,
  });
}

function compareCounts(
  items: SnapshotDiffItem[],
  category: SnapshotDiffItem["category"],
  label: string,
  before: number,
  after: number,
  sourcePath: string | null,
  worsenIsNew = true,
): void {
  if (before === after) return;
  const delta = after - before;
  const direction: SnapshotDiffDirection =
    delta > 0 ? (worsenIsNew ? "new" : "worsened") : "improved";
  const verb =
    delta > 0
      ? `${Math.abs(delta)} new ${label}`
      : `${Math.abs(delta)} ${label} resolved`;
  pushItem(items, {
    category,
    text: verb,
    direction: delta > 0 && !worsenIsNew ? "worsened" : direction,
    sourcePath,
  });
}

/**
 * Deterministic, provider-independent comparison of two sanitized snapshots.
 * When baseline is null, returns baselineAvailable=false with empty change items.
 */
export function diffOperationalSnapshots(
  input: DiffOperationalSnapshotsInput,
): OperationalSnapshotDiff {
  const { current, baseline } = input;
  const currentHash = input.currentHash || hashOperationalSnapshot(current);
  const allowed = Array.from(
    new Set([
      ...current.allowedSourcePaths,
      ...(baseline?.allowedSourcePaths ?? []),
      ...current.priorityLocations.map((l) => l.sourcePath),
      ...current.handoffs.map((h) => h.sourcePath),
    ]),
  );

  if (!baseline) {
    return {
      baselineAvailable: false,
      baselineHash: null,
      currentHash,
      windowStart: input.windowStart ?? null,
      windowEnd: current.generatedAt,
      items: [],
      readinessMoves: { toReady: 0, toInProgress: 0, toNeedsAttention: 0 },
      allowedSourcePaths: allowed,
    };
  }

  const baselineHash = input.baselineHash ?? hashOperationalSnapshot(baseline);
  const items: SnapshotDiffItem[] = [];
  const readinessMoves = { toReady: 0, toInProgress: 0, toNeedsAttention: 0 };

  const beforeLocs = locationMap(baseline);
  const afterLocs = locationMap(current);
  const allUnitIds = new Set([...beforeLocs.keys(), ...afterLocs.keys()]);

  for (const unitId of Array.from(allUnitIds).sort()) {
    const before = beforeLocs.get(unitId);
    const after = afterLocs.get(unitId);

    if (!before && after) {
      if (after.state === "needs_attention") readinessMoves.toNeedsAttention += 1;
      if (after.state === "in_progress") readinessMoves.toInProgress += 1;
      pushItem(items, {
        category: "location",
        text: `${after.name} moved to ${labelState(after.state)}: ${after.primaryReason}`,
        direction: after.state === "ready" ? "improved" : "new",
        sourcePath: after.sourcePath,
        sortKey: `location:new:${after.name}`,
      });
      continue;
    }

    if (before && !after) {
      readinessMoves.toReady += 1;
      pushItem(items, {
        category: "location",
        text: `${before.name} no longer needs attention`,
        direction: "improved",
        sourcePath: before.sourcePath,
        sortKey: `location:resolved:${before.name}`,
      });
      continue;
    }

    if (before && after) {
      if (before.state !== after.state) {
        if (after.state === "ready") readinessMoves.toReady += 1;
        if (after.state === "in_progress") readinessMoves.toInProgress += 1;
        if (after.state === "needs_attention") readinessMoves.toNeedsAttention += 1;
        pushItem(items, {
          category: "readiness",
          text: `${after.name} moved from ${labelState(before.state)} to ${labelState(after.state)}`,
          direction: directionForStateChange(before.state, after.state),
          sourcePath: after.sourcePath,
          sortKey: `readiness:${after.name}:${before.state}->${after.state}`,
        });
      } else if (before.primaryReason !== after.primaryReason) {
        pushItem(items, {
          category: "location",
          text: `${after.name} reason changed: ${after.primaryReason}`,
          direction: "unchanged",
          sourcePath: after.sourcePath,
          sortKey: `location:reason:${after.name}`,
        });
      }
    }
  }

  compareCounts(
    items,
    "staffing",
    "coverage gap(s)",
    baseline.staffing.gaps,
    current.staffing.gaps,
    "/today/coverage",
  );
  compareCounts(
    items,
    "staffing",
    "thin coverage location(s)",
    baseline.staffing.thinCoverage,
    current.staffing.thinCoverage,
    "/today/coverage",
  );
  compareCounts(
    items,
    "staffing",
    "open call-down(s)",
    baseline.staffing.openCallDowns,
    current.staffing.openCallDowns,
    "/staffing",
  );

  const urgentHighBefore = baseline.issues.urgent + baseline.issues.high;
  const urgentHighAfter = current.issues.urgent + current.issues.high;
  compareCounts(items, "issues", "urgent/high issue(s)", urgentHighBefore, urgentHighAfter, "/issues");
  compareCounts(
    items,
    "issues",
    "issue(s) in progress",
    baseline.issues.inProgress,
    current.issues.inProgress,
    "/issues",
    false,
  );
  compareCounts(
    items,
    "issues",
    "supply shortage(s)",
    baseline.issues.supplyShorts,
    current.issues.supplyShorts,
    "/issues",
  );

  compareCounts(
    items,
    "inspections",
    "overdue inspection(s)",
    baseline.inspections.overdue,
    current.inspections.overdue,
    "/admin/inspections",
  );
  compareCounts(
    items,
    "inspections",
    "due-now inspection(s)",
    baseline.inspections.dueNow,
    current.inspections.dueNow,
    "/admin/inspections",
  );
  compareCounts(
    items,
    "inspections",
    "open inspection finding(s)",
    baseline.inspections.openFindings,
    current.inspections.openFindings,
    "/admin/inspections",
  );

  const beforeHandoffs = handoffMap(baseline);
  const afterHandoffs = handoffMap(current);
  for (const key of Array.from(new Set([...beforeHandoffs.keys(), ...afterHandoffs.keys()])).sort()) {
    const before = beforeHandoffs.get(key);
    const after = afterHandoffs.get(key);
    if (!before && after) {
      pushItem(items, {
        category: "handoffs",
        text: `New handoff: ${after.summary}`,
        direction: "new",
        sourcePath: after.sourcePath,
        sortKey: `handoffs:new:${key}`,
      });
    } else if (before && !after) {
      pushItem(items, {
        category: "handoffs",
        text: `Resolved handoff: ${before.summary}`,
        direction: "improved",
        sourcePath: before.sourcePath,
        sortKey: `handoffs:resolved:${key}`,
      });
    }
  }

  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return {
    baselineAvailable: true,
    baselineHash,
    currentHash,
    windowStart: input.windowStart ?? baseline.generatedAt,
    windowEnd: current.generatedAt,
    items,
    readinessMoves,
    allowedSourcePaths: allowed,
  };
}

function labelState(state: SnapshotReadinessState): string {
  if (state === "needs_attention") return "Needs Attention";
  if (state === "in_progress") return "In Progress";
  return "Ready";
}

export type { OperationalSnapshotDiff, SnapshotDiffItem, SnapshotDiffDirection };
