/**
 * Plan today's Key Time Runtime expectations from published KEY_TIME groups.
 * One planned row per (cycle version, room). Does not touch meal expectations.
 */

import { projectCycleHierarchy } from "./cycle-hierarchy";
import type { OperationalCycleDefinition } from "./types";

export type PlannedKeyTimeDayExpectation = {
  cycleId: string;
  cycleStableKey: string;
  cycleVersion: number;
  cycleLabel: string;
  parentCycleLabel: string | null;
  displayPath: string;
  keyTimeGroupId: string;
  spaceId: string;
  configuredDueLocal: string;
};

export type ExistingKeyTimeExpectationKey = {
  cycleId: string;
  spaceId: string;
};

/**
 * Plan room-level Key Time expectations for one operational date's published set.
 * Skips rows that already exist (idempotent materialization).
 */
export function planKeyTimeDayExpectations(input: {
  cycles: readonly OperationalCycleDefinition[];
  existing?: readonly ExistingKeyTimeExpectationKey[];
}): PlannedKeyTimeDayExpectation[] {
  const existing = new Set(
    (input.existing ?? []).map((row) => `${row.cycleId}:${row.spaceId}`),
  );
  const hierarchy = projectCycleHierarchy(input.cycles);
  const planned: PlannedKeyTimeDayExpectation[] = [];
  const seenRoom = new Set<string>();

  for (const cycle of input.cycles) {
    if (cycle.nodeKind !== "KEY_TIME") continue;
    if (cycle.status !== "PUBLISHED" && cycle.status !== "RETIRED") continue;

    const node = hierarchy.byStableKey.get(cycle.stableKey);
    const displayPath = node?.displayPath ?? cycle.label;
    const parentCycleLabel = node?.path.slice(0, -1)[0] ?? null;

    for (const group of cycle.keyTimeGroups) {
      if (!group.id) continue;
      const due = group.dueLocal?.trim();
      if (!due) continue;
      for (const spaceId of group.spaceIds) {
        if (!spaceId) continue;
        const roomKey = `${cycle.id}:${spaceId}`;
        if (seenRoom.has(roomKey) || existing.has(roomKey)) continue;
        seenRoom.add(roomKey);
        planned.push({
          cycleId: cycle.id,
          cycleStableKey: cycle.stableKey,
          cycleVersion: cycle.version,
          cycleLabel: cycle.label,
          parentCycleLabel,
          displayPath,
          keyTimeGroupId: group.id,
          spaceId,
          configuredDueLocal: due,
        });
      }
    }
  }

  return planned;
}
