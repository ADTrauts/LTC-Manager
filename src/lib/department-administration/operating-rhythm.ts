/**
 * Department-level operating rhythm presentation for Teams.
 * Cycles belong to the department. Teams may link them.
 */

import { formatCycleWindow } from "@/lib/operational-cycles/cycle-display";
import {
  isCycleEffectiveOnDate,
  partitionCyclesForLifecycle,
  type CycleLifecycleRow,
} from "@/lib/operational-cycles/cycle-lifecycle";
import { toServiceDateKey } from "@/lib/operational-time";

export type OperatingRhythmChildView = {
  label: string;
  window: string;
  status: "DRAFT" | "PUBLISHED";
};

export type OperatingRhythmRootView = {
  stableKey: string;
  label: string;
  liveWindow: string | null;
  draftWindow: string | null;
  draftStartLocal: string | null;
  draftEndLocal: string | null;
  draftCycleId: string | null;
  draftEffectiveFrom: string | null;
  draftDays: number[];
  draftLocationMode: "ALL_DEPARTMENT_UNITS" | "UNIT_TYPES" | "EXPLICIT_UNITS" | "ROOM_TYPE" | "OPERATIONAL_TYPES";
  draftSpaceIds: string[];
  mealType: string | null;
  scheduledEffectiveFrom: string | null;
  children: OperatingRhythmChildView[];
};

export function presentOperatingRhythmRoots(
  rows: readonly CycleLifecycleRow[],
  todayKey: string,
): OperatingRhythmRootView[] {
  const { current, drafts, scheduled } = partitionCyclesForLifecycle(rows, todayKey);
  const rootDrafts = drafts.filter((row) => row.parentStableKey == null && row.nodeKind === "PERIOD");
  const rootCurrent = current.filter((row) => row.parentStableKey == null && row.nodeKind === "PERIOD");
  const rootScheduled = scheduled.filter(
    (row) => row.parentStableKey == null && row.nodeKind === "PERIOD",
  );

  const byKeyOrder = [...rootCurrent, ...rootDrafts, ...rootScheduled];
  const orderedKeys: string[] = [];
  for (const row of byKeyOrder) {
    if (!orderedKeys.includes(row.stableKey)) orderedKeys.push(row.stableKey);
  }

  return orderedKeys.map((stableKey) => {
    const draft = rootDrafts.find((row) => row.stableKey === stableKey) ?? null;
    const live = rootCurrent.find((row) => row.stableKey === stableKey) ?? null;
    const upcoming = rootScheduled.find((row) => row.stableKey === stableKey) ?? null;
    const children = rows
      .filter(
        (row) =>
          row.parentStableKey === stableKey &&
          (row.status === "DRAFT" ||
            (row.status === "PUBLISHED" && isCycleEffectiveOnDate(row, todayKey))),
      )
      .sort((a, b) => a.displaySequence - b.displaySequence || a.label.localeCompare(b.label))
      .map((row) => ({
        label: row.label,
        window: formatCycleWindow(row.startLocal, row.endLocal),
        status: row.status === "DRAFT" ? ("DRAFT" as const) : ("PUBLISHED" as const),
      }));

    return {
      stableKey,
      label: draft?.label ?? live?.label ?? upcoming?.label ?? stableKey,
      liveWindow: live ? formatCycleWindow(live.startLocal, live.endLocal) : null,
      draftWindow: draft ? formatCycleWindow(draft.startLocal, draft.endLocal) : null,
      draftStartLocal: draft?.startLocal ?? null,
      draftEndLocal: draft?.endLocal ?? null,
      draftCycleId: draft?.id ?? null,
      draftEffectiveFrom: draft ? toServiceDateKey(draft.effectiveFrom) : null,
      draftDays: draft?.applicableDaysOfWeek ?? [],
      draftLocationMode: draft?.locationMode ?? "ALL_DEPARTMENT_UNITS",
      draftSpaceIds: draft?.spaceIds ?? [],
      mealType: draft?.mealType ?? live?.mealType ?? null,
      scheduledEffectiveFrom: upcoming ? toServiceDateKey(upcoming.effectiveFrom) : null,
      children,
    };
  });
}

export function currentOperatingRhythmLabels(
  rows: readonly CycleLifecycleRow[],
  todayKey: string,
): string[] {
  return presentOperatingRhythmRoots(rows, todayKey)
    .filter((root) => root.liveWindow)
    .map((root) => root.label);
}

export function draftOperatingRhythmRootCount(roots: readonly OperatingRhythmRootView[]): number {
  return roots.filter((root) => root.draftCycleId).length;
}
