import type { OperationalCycleDefinition } from "./types";

type CycleSpaceSource = Pick<
  OperationalCycleDefinition,
  | "stableKey"
  | "parentStableKey"
  | "nodeKind"
  | "locationMode"
  | "locationInheritFromParent"
  | "spaceIds"
  | "keyTimeGroups"
>;

/**
 * Resolve explicit room space ids for a cycle version.
 * KEY_TIME nodes union group rooms; nested PERIOD may inherit from parent.
 */
export function effectiveCycleSpaceIds(
  cycle: CycleSpaceSource,
  allCyclesByStableKey: ReadonlyMap<string, CycleSpaceSource>,
): string[] {
  if (cycle.nodeKind === "KEY_TIME") {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const group of cycle.keyTimeGroups) {
      for (const spaceId of group.spaceIds) {
        if (!spaceId || seen.has(spaceId)) continue;
        seen.add(spaceId);
        ids.push(spaceId);
      }
    }
    return ids;
  }

  if (cycle.locationInheritFromParent && cycle.parentStableKey) {
    const parent = allCyclesByStableKey.get(cycle.parentStableKey);
    if (parent) {
      return effectiveCycleSpaceIds(parent, allCyclesByStableKey);
    }
  }

  if (cycle.locationMode === "EXPLICIT_UNITS") {
    return [...cycle.spaceIds];
  }

  return [];
}

export function buildCyclesByStableKey<T extends { stableKey: string }>(
  cycles: readonly T[],
): Map<string, T> {
  return new Map(cycles.map((cycle) => [cycle.stableKey, cycle]));
}
