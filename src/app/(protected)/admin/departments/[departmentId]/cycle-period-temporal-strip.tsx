"use client";

import { TemporalStrip } from "@/components/design-system/TemporalStrip";
import {
  cycleRootToTemporalStrip,
  type CycleTemporalInputRow,
} from "@/lib/operational-cycles/cycle-temporal-strip";
import type { CycleHierarchyTreeNode } from "@/lib/operational-cycles/cycle-hierarchy";

type RowLike = CycleTemporalInputRow & { id: string };

type HierarchySource = { stableKey: string; label: string; id?: string };

/**
 * TemporalStrip for one root Period — explains configured rhythm.
 * Empty periods (no Phase / Key Time) show an empty state instead of a blank rail.
 */
export function CyclePeriodTemporalStrip({
  root,
  descendants,
  selectedId,
  readOnly,
  interactive,
  onSelectId,
  onAddPhase,
  onAddKeyTime,
  showEmptyActions = false,
}: {
  root: RowLike;
  descendants: readonly RowLike[];
  selectedId?: string | null;
  readOnly?: boolean;
  interactive?: boolean;
  onSelectId?: (id: string) => void;
  onAddPhase?: () => void;
  onAddKeyTime?: () => void;
  showEmptyActions?: boolean;
}) {
  const hasTimelineContent = descendants.some(
    (row) => row.nodeKind === "PERIOD" || row.nodeKind === "KEY_TIME",
  );

  if (!hasTimelineContent) {
    return (
      <div
        className="border-b border-zinc-100 bg-white px-3 py-4"
        data-testid="cycle-temporal-strip-empty"
      >
        <p className="text-sm text-zinc-700">No phases or key times yet.</p>
        {showEmptyActions && (onAddPhase || onAddKeyTime) ? (
          <div className="mt-2 flex flex-wrap gap-3">
            {onAddPhase ? (
              <button
                type="button"
                className="min-h-9 text-xs font-medium text-zinc-700 hover:text-zinc-900"
                data-testid="add-phase-cycle"
                onClick={onAddPhase}
              >
                + Add phase
              </button>
            ) : null}
            {onAddKeyTime ? (
              <button
                type="button"
                className="min-h-9 text-xs font-medium text-zinc-700 hover:text-zinc-900"
                data-testid="add-key-time-cycle"
                onClick={onAddKeyTime}
              >
                + Add key time
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const model = cycleRootToTemporalStrip({
    root,
    descendants,
    selectedId,
    readOnly,
  });
  if (!model) return null;

  return (
    <div
      className="border-b border-zinc-100 bg-white px-2 py-2 sm:px-3"
      data-testid="cycle-temporal-strip"
    >
      <TemporalStrip
        model={model}
        density="compact"
        interactive={Boolean(interactive && onSelectId)}
        onSelect={onSelectId}
        listFallback="sr-only"
      />
    </div>
  );
}

/** Collect descendant cycle rows under a hierarchy node. */
export function collectDescendantRows(
  node: CycleHierarchyTreeNode<HierarchySource>,
  byId: Map<string, RowLike>,
): RowLike[] {
  const out: RowLike[] = [];
  function walk(n: CycleHierarchyTreeNode<HierarchySource>) {
    for (const child of n.children) {
      const id = child.source.id;
      if (id) {
        const row = byId.get(id);
        if (row) out.push(row);
      }
      walk(child);
    }
  }
  walk(node);
  return out;
}
