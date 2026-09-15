/**
 * Operational Cycle hierarchy — depth, path, ancestors, loop checks.
 * Labels are never used to infer parent/child relationships.
 */

import type { MealType } from "@prisma/client";

export type CycleHierarchyNodeInput = {
  stableKey: string;
  label: string;
  parentStableKey?: string | null;
  displaySequence?: number;
  nodeKind?: "PERIOD" | "KEY_TIME";
  id?: string;
};

export type CycleHierarchyTreeNode<T extends CycleHierarchyNodeInput = CycleHierarchyNodeInput> = {
  stableKey: string;
  label: string;
  parentStableKey: string | null;
  depth: number;
  hasChildren: boolean;
  ancestorStableKeys: string[];
  displayPath: string;
  path: string[];
  children: CycleHierarchyTreeNode<T>[];
  /** Source row when provided. */
  source: T;
};

export type CycleHierarchyProjection<T extends CycleHierarchyNodeInput = CycleHierarchyNodeInput> = {
  roots: CycleHierarchyTreeNode<T>[];
  byStableKey: Map<string, CycleHierarchyTreeNode<T>>;
  flatDepthFirst: CycleHierarchyTreeNode<T>[];
};

function compareSiblings<T extends CycleHierarchyNodeInput>(a: T, b: T): number {
  const seq = (a.displaySequence ?? 100) - (b.displaySequence ?? 100);
  if (seq !== 0) return seq;
  const label = a.label.localeCompare(b.label);
  if (label !== 0) return label;
  return a.stableKey.localeCompare(b.stableKey);
}

/**
 * Build a deterministic forest from a flat cycle list.
 * Orphaned parentStableKey values (missing parent) are treated as roots.
 */
export function projectCycleHierarchy<T extends CycleHierarchyNodeInput>(
  rows: readonly T[],
): CycleHierarchyProjection<T> {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const prior = unique.get(row.stableKey);
    if (!prior) {
      unique.set(row.stableKey, row);
      continue;
    }
    // Prefer higher displaySequence tie-break already handled; keep first unless id newer.
    if ((row.displaySequence ?? 100) < (prior.displaySequence ?? 100)) {
      unique.set(row.stableKey, row);
    }
  }

  const keys = new Set(unique.keys());
  const childrenByParent = new Map<string | null, T[]>();
  for (const row of unique.values()) {
    const parent =
      row.parentStableKey &&
      row.parentStableKey !== row.stableKey &&
      keys.has(row.parentStableKey)
        ? row.parentStableKey
        : null;
    const list = childrenByParent.get(parent) ?? [];
    list.push(row);
    childrenByParent.set(parent, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort(compareSiblings);
  }

  const byStableKey = new Map<string, CycleHierarchyTreeNode<T>>();
  const flatDepthFirst: CycleHierarchyTreeNode<T>[] = [];

  function build(
    row: T,
    depth: number,
    ancestors: string[],
    pathLabels: string[],
  ): CycleHierarchyTreeNode<T> {
    const kids = childrenByParent.get(row.stableKey) ?? [];
    const path = [...pathLabels, row.label];
    const node: CycleHierarchyTreeNode<T> = {
      stableKey: row.stableKey,
      label: row.label,
      parentStableKey:
        row.parentStableKey && keys.has(row.parentStableKey) && row.parentStableKey !== row.stableKey
          ? row.parentStableKey
          : null,
      depth,
      hasChildren: kids.length > 0,
      ancestorStableKeys: ancestors,
      displayPath: path.join(" → "),
      path,
      children: [],
      source: row,
    };
    byStableKey.set(row.stableKey, node);
    flatDepthFirst.push(node);
    node.children = kids.map((child) =>
      build(child, depth + 1, [...ancestors, row.stableKey], path),
    );
    return node;
  }

  const roots = (childrenByParent.get(null) ?? []).map((row) => build(row, 0, [], []));

  return { roots, byStableKey, flatDepthFirst };
}

export function wouldCreateHierarchyCycle(input: {
  stableKey: string;
  parentStableKey: string | null | undefined;
  rows: readonly CycleHierarchyNodeInput[];
}): { ok: true } | { ok: false; reason: string } {
  const parent = input.parentStableKey?.trim() || null;
  if (!parent) return { ok: true };
  if (parent === input.stableKey) {
    return { ok: false, reason: "An operational cycle cannot be its own parent." };
  }

  const byKey = new Map(input.rows.map((row) => [row.stableKey, row]));
  if (!byKey.has(parent)) {
    return { ok: false, reason: "Parent cycle was not found." };
  }

  // Walk ancestors of the proposed parent; if we hit the child, it's a loop.
  const seen = new Set<string>();
  let cursor: string | null = parent;
  while (cursor) {
    if (cursor === input.stableKey) {
      return {
        ok: false,
        reason: "Cannot move a cycle under one of its own descendants.",
      };
    }
    if (seen.has(cursor)) {
      return { ok: false, reason: "Hierarchy loop detected." };
    }
    seen.add(cursor);
    const row = byKey.get(cursor);
    cursor = row?.parentStableKey?.trim() || null;
  }
  return { ok: true };
}

export function ancestorStableKeysFor(
  stableKey: string,
  rows: readonly CycleHierarchyNodeInput[],
): string[] {
  const byKey = new Map(rows.map((row) => [row.stableKey, row]));
  const ancestors: string[] = [];
  const seen = new Set<string>();
  let cursor = byKey.get(stableKey)?.parentStableKey?.trim() || null;
  while (cursor) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    ancestors.push(cursor);
    cursor = byKey.get(cursor)?.parentStableKey?.trim() || null;
  }
  return ancestors;
}

export function effectiveMealType(input: {
  mealType: MealType | null | undefined;
  stableKey: string;
  rows: ReadonlyArray<CycleHierarchyNodeInput & { mealType?: MealType | null }>;
}): MealType | null {
  if (input.mealType) return input.mealType;
  const byKey = new Map(input.rows.map((row) => [row.stableKey, row]));
  for (const ancestorKey of ancestorStableKeysFor(input.stableKey, input.rows)) {
    const meal = byKey.get(ancestorKey)?.mealType;
    if (meal) return meal;
  }
  return null;
}

export function parentOptionsForCycle(input: {
  stableKey: string;
  rows: readonly CycleHierarchyNodeInput[];
}): Array<{ stableKey: string; label: string; depth: number; displayPath: string }> {
  const tree = projectCycleHierarchy(input.rows);
  return tree.flatDepthFirst
    .filter((node) => {
      if (node.stableKey === input.stableKey) return false;
      if (node.ancestorStableKeys.includes(input.stableKey)) return false;
      if (node.source.nodeKind === "KEY_TIME") return false;
      return true;
    })
    .map((node) => ({
      stableKey: node.stableKey,
      label: node.label,
      depth: node.depth,
      displayPath: node.displayPath,
    }));
}

export function labelForStableKey(
  stableKey: string | null | undefined,
  rows: readonly CycleHierarchyNodeInput[],
): string | null {
  if (!stableKey) return null;
  return rows.find((row) => row.stableKey === stableKey)?.label ?? null;
}
