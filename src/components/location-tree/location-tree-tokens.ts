/**
 * Shared Facility Structure tree presentation tokens.
 * Matches Facility Builder Structure pane indent / density.
 */

export type LocationTreeKind = "floor" | "neighborhood" | "room";

/** Row left padding — same formula as Facility Builder TreeUnitNode / TreeSpaceNode. */
export function locationTreePaddingLeft(depth: number): number {
  return depth * 16 + 6;
}

export const LOCATION_TREE_ROW_GAP_CLASS = "space-y-0.5";

export const LOCATION_TREE_COUNT_PILL_CLASS =
  "shrink-0 mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums bg-zinc-100 text-zinc-500";
