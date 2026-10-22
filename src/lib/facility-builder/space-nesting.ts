/** One extra level only: bathroom inside a resident room, not room → room → room. */
export const MAX_SPACE_NESTING_DEPTH = 1;

export type SpaceNestRow = {
  id: string;
  unitId: string | null;
  parentSpaceId: string | null;
};

export function siblingSpacesOf<T extends { parentSpaceId?: string | null }>(
  spaces: readonly T[],
  parentSpaceId: string | null,
): T[] {
  return spaces.filter((space) => (space.parentSpaceId ?? null) === parentSpaceId);
}

export function nestedSpacesOf<T extends { parentSpaceId?: string | null }>(
  spaces: readonly T[],
  parentId: string,
): T[] {
  return spaces.filter((space) => space.parentSpaceId === parentId);
}

export function collectDescendantSpaceIds(
  spaces: readonly SpaceNestRow[],
  rootId: string,
): string[] {
  const byParent = new Map<string, string[]>();
  for (const space of spaces) {
    if (!space.parentSpaceId) continue;
    const list = byParent.get(space.parentSpaceId) ?? [];
    list.push(space.id);
    byParent.set(space.parentSpaceId, list);
  }

  const out: string[] = [];
  const stack = [...(byParent.get(rootId) ?? [])];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    out.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return out;
}

/**
 * Validate nesting `space` under `parent` (null = place directly in the neighborhood).
 * Nested rooms stay first-class operational rooms; this is physical containment only.
 */
export function spaceNestError(
  space: SpaceNestRow,
  parent: SpaceNestRow | null,
  all: readonly SpaceNestRow[],
): string | null {
  if (!parent) return null;
  if (parent.id === space.id) return "A room cannot be inside itself.";
  if (parent.parentSpaceId) {
    return `Rooms can only be nested ${MAX_SPACE_NESTING_DEPTH === 1 ? "one level" : `${MAX_SPACE_NESTING_DEPTH} levels`} (for example a bathroom inside a resident room).`;
  }
  const descendants = new Set(collectDescendantSpaceIds(all, space.id));
  if (descendants.has(parent.id)) {
    return "A room cannot be moved inside one of its own rooms.";
  }
  if (descendants.size > 0) {
    return "Move or remove the rooms inside this room before placing it inside another room.";
  }
  if ((parent.unitId ?? null) !== (space.unitId ?? null)) {
    return "Nested rooms must stay in the same location as the room they belong to.";
  }
  return null;
}

export function nestParentCandidates<T extends SpaceNestRow>(
  space: T,
  all: readonly T[],
): T[] {
  return all.filter((candidate) => spaceNestError(space, candidate, all) === null);
}

export function formatRoomDisplayName(room: {
  name: string;
  roomNumber?: string | null;
}): string {
  const name = room.name.trim();
  const roomNumber = room.roomNumber?.trim();
  if (!roomNumber) return name;
  if (!name) return roomNumber;
  return `${roomNumber} • ${name}`;
}
