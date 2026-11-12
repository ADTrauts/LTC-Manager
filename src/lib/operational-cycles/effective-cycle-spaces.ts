import type { OperationalCycleDefinition } from "./types";

export const CANONICAL_CYCLE_LOCATION_MODES = ["ALL_DEPARTMENT_UNITS", "EXPLICIT_UNITS"] as const;

export function isCanonicalCycleLocationMode(
  value: string,
): value is (typeof CANONICAL_CYCLE_LOCATION_MODES)[number] {
  return value === "ALL_DEPARTMENT_UNITS" || value === "EXPLICIT_UNITS";
}

export function cycleLocationOwner<T extends Pick<OperationalCycleDefinition, "nodeKind" | "locationInheritFromParent" | "parentStableKey">>(
  cycle: T,
  allCyclesByStableKey?: ReadonlyMap<string, T>,
): T | undefined {
  if (cycle.nodeKind === "KEY_TIME" || !cycle.locationInheritFromParent) return cycle;
  const parent = cycle.parentStableKey ? allCyclesByStableKey?.get(cycle.parentStableKey) : undefined;
  return parent?.nodeKind === "PERIOD" && !parent.parentStableKey && !parent.locationInheritFromParent
    ? parent
    : undefined;
}

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

  const owner = cycleLocationOwner(cycle, allCyclesByStableKey);
  return owner?.locationMode === "EXPLICIT_UNITS" ? [...owner.spaceIds] : [];
}

export function buildCyclesByStableKey<T extends { stableKey: string }>(
  cycles: readonly T[],
): Map<string, T> {
  return new Map(cycles.map((cycle) => [cycle.stableKey, cycle]));
}
