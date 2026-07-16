/**
 * Facility Builder Stage 2C — setup efficiency helpers.
 * Pure functions for bulk rooms, search, sibling order, and move destinations.
 * No Prisma / no schema changes.
 */

import {
  resolveBuilderNodeDisplayKind,
  type BuilderNodeDisplayKind,
  type HierarchyRoleValue,
} from "./builder-display";

export const BULK_ROOM_MAX = 100;

export type BulkRoomParseResult = {
  /** Deduplicated names in entry order (first occurrence wins). */
  names: string[];
  /** Names that appeared more than once in the input (after expand). */
  duplicateInBatch: string[];
  /** Lines that were blank and ignored. */
  blankLinesIgnored: number;
  /** Expanded range labels that were produced (for diagnostics). */
  expandedFromRanges: number;
};

/**
 * Expand a simple contiguous range: "Patient Room 32A–40A" or "Room 1-5".
 * Requires identical letter suffix (or none) on both ends. Deterministic only.
 * Returns null if the line is not a supported range.
 */
export function expandRoomNameRange(line: string): string[] | null {
  const trimmed = line.trim();
  // en-dash or hyphen between trailing number(+optional letters)
  const match = trimmed.match(
    /^(.+?)(\d+)([A-Za-z]*)\s*[–\-]\s*(\d+)([A-Za-z]*)$/,
  );
  if (!match) return null;

  const [, prefix, startStr, startSuffix, endStr, endSuffix] = match;
  if (startSuffix !== endSuffix) return null;

  const start = Number(startStr);
  const end = Number(endStr);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) return null;
  if (end - start + 1 > BULK_ROOM_MAX) return null;

  const names: string[] = [];
  for (let n = start; n <= end; n++) {
    names.push(`${prefix}${n}${startSuffix}`);
  }
  return names;
}

/**
 * Parse multiline bulk room input: trim, skip blanks, expand ranges, preserve order,
 * collect in-batch duplicates (first occurrence kept in names).
 */
export function parseBulkRoomLines(raw: string): BulkRoomParseResult {
  const lines = raw.split(/\r?\n/);
  const names: string[] = [];
  const seen = new Set<string>();
  const duplicateInBatch: string[] = [];
  let blankLinesIgnored = 0;
  let expandedFromRanges = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blankLinesIgnored += 1;
      continue;
    }

    const expanded = expandRoomNameRange(trimmed);
    const chunk = expanded ?? [trimmed];
    if (expanded) expandedFromRanges += 1;

    for (const name of chunk) {
      if (name.length > 120) continue;
      if (seen.has(name)) {
        if (!duplicateInBatch.includes(name)) duplicateInBatch.push(name);
        continue;
      }
      seen.add(name);
      names.push(name);
    }
  }

  return { names, duplicateInBatch, blankLinesIgnored, expandedFromRanges };
}

/** Normalize sibling order values to sequential multiples of `step` (capped at 9999). */
export function normalizeSiblingOrders(
  orderedIds: readonly string[],
  step = 10,
): { id: string; order: number }[] {
  return orderedIds.map((id, index) => ({
    id,
    order: Math.min(9999, (index + 1) * step),
  }));
}

/** Next append order after existing siblings (stable +10 increments). */
export function nextAppendOrder(
  siblings: readonly { order: number }[],
  step = 10,
): number {
  if (siblings.length === 0) return step === 10 ? 100 : step;
  const max = Math.max(...siblings.map((s) => s.order));
  return Math.min(9999, max + step);
}

export function nextAppendDisplayOrder(
  siblings: readonly { displayOrder: number }[],
): number {
  return nextAppendOrder(siblings.map((s) => ({ order: s.displayOrder })));
}

export function nextAppendSortOrder(
  siblings: readonly { sortOrder: number }[],
): number {
  return nextAppendOrder(siblings.map((s) => ({ order: s.sortOrder })));
}

/**
 * Reorder sibling id list: move `activeId` to the position of `overId`.
 * Returns null if either id is missing.
 */
export function reorderSiblingIds(
  siblingIds: readonly string[],
  activeId: string,
  overId: string,
): string[] | null {
  const from = siblingIds.indexOf(activeId);
  const to = siblingIds.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = siblingIds.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Apply a reordered subset (e.g. Floors only) onto the full sibling list,
 * preserving positions of ids not in the subset (e.g. legacy locations).
 */
export function mergeOrderedSubsetIntoSiblings(
  currentIds: readonly string[],
  orderedSubset: readonly string[],
): string[] {
  const subsetSet = new Set(orderedSubset);
  let i = 0;
  return currentIds.map((id) => {
    if (subsetSet.has(id)) {
      return orderedSubset[i++]!;
    }
    return id;
  });
}

export type SearchableUnit = {
  id: string;
  name: string;
  parentUnitId: string | null;
  hierarchyRole?: HierarchyRoleValue;
  childUnits: SearchableUnit[];
  childSpaces: { id: string; name: string; roomNumber?: string | null; code: string | null }[];
};

export type HierarchySearchResult<T extends SearchableUnit> = {
  units: T[];
  /** Unit ids that should be expanded so matches are visible. */
  expandedIds: Set<string>;
  matchCount: number;
};

function matchesQuery(
  haystack: string | null | undefined,
  queryLower: string,
): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(queryLower);
}

/**
 * Filter hierarchy in memory. Matching nodes keep ancestors for context.
 * Case-insensitive name/code match. Empty query returns original tree.
 */
export function filterHierarchyForSearch<T extends SearchableUnit>(
  units: T[],
  query: string,
): HierarchySearchResult<T> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      units,
      expandedIds: new Set(),
      matchCount: 0,
    };
  }

  const q = trimmed.toLowerCase();
  const expandedIds = new Set<string>();
  let matchCount = 0;

  function visit(unit: T): T | null {
    const nameMatch = matchesQuery(unit.name, q);
    const spaces = unit.childSpaces.filter(
      (s) =>
        matchesQuery(s.name, q) ||
        matchesQuery(s.roomNumber, q) ||
        matchesQuery(s.code, q),
    );
    const children: T[] = [];
    for (const child of unit.childUnits) {
      const kept = visit(child as T);
      if (kept) children.push(kept);
    }

    if (nameMatch) matchCount += 1;
    matchCount += spaces.length;

    if (!nameMatch && spaces.length === 0 && children.length === 0) {
      return null;
    }

    expandedIds.add(unit.id);
    return {
      ...unit,
      childUnits: children,
      childSpaces: spaces,
    } as T;
  }

  const filtered: T[] = [];
  for (const root of units) {
    const kept = visit(root);
    if (kept) filtered.push(kept);
  }

  return { units: filtered, expandedIds, matchCount };
}

/** Highlight case-insensitive substring matches for search emphasis. */
export function splitHighlightParts(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  let idx = lower.indexOf(qLower, cursor);
  while (idx >= 0) {
    if (idx > cursor) {
      parts.push({ text: text.slice(cursor, idx), match: false });
    }
    parts.push({ text: text.slice(idx, idx + q.length), match: true });
    cursor = idx + q.length;
    idx = lower.indexOf(qLower, cursor);
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }
  return parts.length > 0 ? parts : [{ text, match: false }];
}

export type MoveDestination = {
  id: string;
  name: string;
  kind: BuilderNodeDisplayKind;
  /** Optional parent label for nested destinations (e.g. floor name). */
  groupLabel?: string;
};

type DestUnit = {
  id: string;
  name: string;
  parentUnitId: string | null;
  hierarchyRole?: HierarchyRoleValue;
  childUnits: DestUnit[];
};

function flattenDestUnits(units: DestUnit[]): DestUnit[] {
  const out: DestUnit[] = [];
  function walk(list: DestUnit[]) {
    for (const u of list) {
      out.push(u);
      walk(u.childUnits);
    }
  }
  walk(units);
  return out;
}

/** Floors in this facility (valid move targets for neighborhoods / legacy). */
export function listFloorMoveDestinations(
  units: DestUnit[],
  options?: { excludeUnitId?: string; excludeParentId?: string | null },
): MoveDestination[] {
  return flattenDestUnits(units)
    .filter((u) => resolveBuilderNodeDisplayKind(u) === "floor")
    .filter((u) => u.id !== options?.excludeUnitId)
    .filter((u) => u.id !== options?.excludeParentId)
    .map((u) => ({
      id: u.id,
      name: u.name,
      kind: "floor" as const,
    }));
}

/** Neighborhoods / legacy locations that can receive rooms. */
export function listNeighborhoodMoveDestinations(
  units: DestUnit[],
  options?: { excludeUnitId?: string },
): MoveDestination[] {
  const flat = flattenDestUnits(units);
  const byId = new Map(flat.map((u) => [u.id, u]));

  return flat
    .filter((u) => {
      const kind = resolveBuilderNodeDisplayKind(u);
      return kind === "neighborhood" || kind === "legacy_location";
    })
    .filter((u) => u.id !== options?.excludeUnitId)
    .map((u) => {
      const parent = u.parentUnitId ? byId.get(u.parentUnitId) : null;
      return {
        id: u.id,
        name: u.name,
        kind: resolveBuilderNodeDisplayKind(u),
        groupLabel: parent?.name,
      };
    });
}

/**
 * Room move targets: Floors, Neighborhoods, legacy, staged, and Undesignated.
 * Undesignated uses sentinel id matching UNDESIGNATED_DROP_ID.
 */
export function listRoomMoveDestinations(
  placedUnits: DestUnit[],
  stagedUnits: DestUnit[] = [],
  options?: { excludeUnitId?: string | null; includeUndesignated?: boolean },
): MoveDestination[] {
  const exclude = options?.excludeUnitId ?? undefined;
  const floors = listFloorMoveDestinations(placedUnits, { excludeUnitId: exclude });
  const neighborhoods = listNeighborhoodMoveDestinations(placedUnits, {
    excludeUnitId: exclude,
  });
  const staged = stagedUnits
    .filter((u) => u.id !== exclude)
    .map((u) => ({
      id: u.id,
      name: u.name,
      kind: "staged" as const,
      groupLabel: "Undesignated",
    }));

  const out: MoveDestination[] = [...floors, ...neighborhoods, ...staged];
  if (options?.includeUndesignated !== false) {
    out.unshift({
      id: "__undesignated__",
      name: "Undesignated",
      kind: "staged",
      groupLabel: undefined,
    });
  }
  return out.filter((d) => d.id !== exclude);
}

/** True when two units share the same parent (including both top-level). */
export function areUnitSiblings(
  a: { id: string; parentUnitId: string | null },
  b: { id: string; parentUnitId: string | null },
): boolean {
  return a.id !== b.id && a.parentUnitId === b.parentUnitId;
}

/**
 * Whether dropping active onto over should reorder siblings (not reparent).
 * Floors reorder among floors; legacy among top-level legacy; neighborhoods among same floor.
 */
export function shouldReorderUnitsAsSiblings(
  active: {
    id: string;
    parentUnitId: string | null;
    hierarchyRole?: HierarchyRoleValue;
  },
  over: {
    id: string;
    parentUnitId: string | null;
    hierarchyRole?: HierarchyRoleValue;
  },
): boolean {
  if (!areUnitSiblings(active, over)) return false;
  const activeKind = resolveBuilderNodeDisplayKind(active);
  const overKind = resolveBuilderNodeDisplayKind(over);
  if (activeKind === "floor" && overKind === "floor") return true;
  if (activeKind === "neighborhood" && overKind === "neighborhood") return true;
  if (activeKind === "legacy_location" && overKind === "legacy_location") {
    return true;
  }
  return false;
}

/** Representative Terrace View fixture for Stage 2C validation (ids are stable test ids). */
export function terraceViewFixture(): SearchableUnit[] {
  return [
    {
      id: "floor-ground",
      name: "Ground Floor",
      parentUnitId: null,
      hierarchyRole: "FLOOR",
      childUnits: [
        {
          id: "nbh-kensington",
          name: "Ground – Kensington",
          parentUnitId: "floor-ground",
          hierarchyRole: "NEIGHBORHOOD",
          childUnits: [],
          childSpaces: [],
        },
      ],
      childSpaces: [],
    },
    {
      id: "floor-first",
      name: "First Floor",
      parentUnitId: null,
      hierarchyRole: "FLOOR",
      childUnits: [
        {
          id: "nbh-naval",
          name: "1A – Naval Park",
          parentUnitId: "floor-first",
          hierarchyRole: "NEIGHBORHOOD",
          childUnits: [],
          childSpaces: [
            { id: "sp-servery", name: "Servery", roomNumber: null, code: "SRV" },
            { id: "sp-32a", name: "Patient Room 32A", roomNumber: "32A", code: "32A" },
            { id: "sp-33a", name: "Patient Room 33A", roomNumber: "33A", code: "33A" },
            { id: "sp-soil", name: "Soil Hold", code: null },
            { id: "sp-clean", name: "Clean Hold", code: null },
          ],
        },
        {
          id: "nbh-lighthouse",
          name: "1B – Lighthouse",
          parentUnitId: "floor-first",
          hierarchyRole: "NEIGHBORHOOD",
          childUnits: [],
          childSpaces: [],
        },
      ],
      childSpaces: [],
    },
    {
      id: "floor-second",
      name: "Second Floor",
      parentUnitId: null,
      hierarchyRole: "FLOOR",
      childUnits: [
        {
          id: "nbh-mlk",
          name: "2A – MLK",
          parentUnitId: "floor-second",
          hierarchyRole: "NEIGHBORHOOD",
          childUnits: [],
          childSpaces: [],
        },
      ],
      childSpaces: [],
    },
  ];
}
