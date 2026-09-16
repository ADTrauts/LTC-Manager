/**
 * Pure helpers for Operational Cycle tree drag moves (reorder / reparent).
 * Labels are never used to infer hierarchy.
 */

import { wouldCreateHierarchyCycle, type CycleHierarchyNodeInput } from "./cycle-hierarchy";

export type CycleTreeMovePlacement = "before" | "after" | "inside";

export type CycleTreeMoveInput = {
  rows: readonly (CycleHierarchyNodeInput & {
    id: string;
    displaySequence?: number;
    nodeKind?: "PERIOD" | "KEY_TIME";
  })[];
  activeId: string;
  overId: string;
  /** Drop onto a cycle as a child. */
  placement: CycleTreeMovePlacement;
};

export type CycleTreeMoveUpdate = {
  id: string;
  stableKey: string;
  parentStableKey: string | null;
  displaySequence: number;
};

export type CycleTreeMoveResult =
  | { ok: true; updates: CycleTreeMoveUpdate[]; summary: string }
  | { ok: false; reason: string };

function siblingList(
  rows: readonly (CycleHierarchyNodeInput & { id: string })[],
  parentStableKey: string | null,
): Array<CycleHierarchyNodeInput & { id: string }> {
  return rows
    .filter((row) => (row.parentStableKey ?? null) === parentStableKey)
    .slice()
    .sort((a, b) => {
      const seq = (a.displaySequence ?? 100) - (b.displaySequence ?? 100);
      if (seq !== 0) return seq;
      return a.stableKey.localeCompare(b.stableKey);
    });
}

function sequenceUpdates(
  ordered: readonly (CycleHierarchyNodeInput & { id: string })[],
  parentStableKey: string | null,
): CycleTreeMoveUpdate[] {
  return ordered.map((row, index) => ({
    id: row.id,
    stableKey: row.stableKey,
    parentStableKey,
    displaySequence: (index + 1) * 10,
  }));
}

/**
 * Compute draft hierarchy updates for a drag move.
 * Sibling displaySequence values are rewritten only within affected parent groups.
 */
export function computeCycleTreeMove(input: CycleTreeMoveInput): CycleTreeMoveResult {
  const byId = new Map(input.rows.map((row) => [row.id, row]));
  const active = byId.get(input.activeId);
  const over = byId.get(input.overId);
  if (!active || !over) {
    return { ok: false, reason: "Could not find the cycles to move." };
  }
  if (active.id === over.id) {
    return { ok: false, reason: "That move would create an invalid cycle hierarchy." };
  }

  let nextParent: string | null;
  let insertBeforeId: string | null = null;

  if (input.placement === "inside") {
    if (over.nodeKind === "KEY_TIME") {
      return { ok: false, reason: "Key Time nodes cannot contain child cycles." };
    }
    nextParent = over.stableKey;
  } else {
    nextParent = over.parentStableKey ?? null;
    insertBeforeId = input.placement === "before" ? over.id : null;
  }

  const loop = wouldCreateHierarchyCycle({
    stableKey: active.stableKey,
    parentStableKey: nextParent,
    rows: input.rows.map((row) =>
      row.id === active.id ? { ...row, parentStableKey: nextParent } : row,
    ),
  });
  if (!loop.ok) {
    return { ok: false, reason: "That move would create an invalid cycle hierarchy." };
  }

  const previousParent = active.parentStableKey ?? null;
  const moved = { ...active, parentStableKey: nextParent };

  const targetSiblings = siblingList(input.rows, nextParent).filter((row) => row.id !== active.id);
  let insertAt = targetSiblings.length;
  if (input.placement === "inside") {
    insertAt = targetSiblings.length;
  } else if (insertBeforeId) {
    const idx = targetSiblings.findIndex((row) => row.id === insertBeforeId);
    insertAt = idx >= 0 ? idx : targetSiblings.length;
  } else {
    const idx = targetSiblings.findIndex((row) => row.id === over.id);
    insertAt = idx >= 0 ? idx + 1 : targetSiblings.length;
  }
  targetSiblings.splice(insertAt, 0, moved);

  const updates = sequenceUpdates(targetSiblings, nextParent);

  if (previousParent !== nextParent) {
    const priorSiblings = siblingList(input.rows, previousParent).filter(
      (row) => row.id !== active.id,
    );
    updates.push(...sequenceUpdates(priorSiblings, previousParent));
  }

  const parentLabel =
    nextParent == null
      ? "top level"
      : input.rows.find((row) => row.stableKey === nextParent)?.label ?? "another cycle";
  const priorLabel =
    previousParent == null
      ? "top level"
      : input.rows.find((row) => row.stableKey === previousParent)?.label ?? "another cycle";

  let summary: string;
  if (previousParent === nextParent) {
    summary =
      nextParent == null
        ? `Reordered “${active.label}” among top-level cycles`
        : `Reordered phases in “${priorLabel}”`;
  } else if (nextParent == null) {
    summary = `Moved “${active.label}” to top level`;
  } else if (previousParent == null) {
    summary = `Moved “${active.label}” under “${parentLabel}”`;
  } else {
    summary = `Moved “${active.label}” from “${priorLabel}” to “${parentLabel}”`;
  }

  return { ok: true, updates, summary };
}
