/**
 * Pure helpers for Facility Builder department-responsibility checkbox sync.
 *
 * Canonical stores (unchanged):
 * - Neighborhoods / legacy / staged Units → UnitDepartmentResponsibility
 * - Rooms (UnitSpace) → UnitSpaceResponsibility
 *
 * Floors are STRUCTURAL organizers. Facility Builder does not treat them as
 * department-responsible locations. Bulk “Apply departments to locations below”
 * from a floor writes only to actionable descendants (neighborhoods + rooms).
 *
 * Room responsibility remains explicit (no inheritance). Apply-to-descendants
 * is an intentional one-shot copy that mutates descendant rows to match a set.
 */

export type ResponsibilityDeptRef = { department: { id: string } };

/** Department IDs currently assigned on a location (order-stable unique). */
export function assignedDepartmentIds(
  responsibilities: readonly ResponsibilityDeptRef[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of responsibilities) {
    const id = row.department.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export type ResponsibilitySyncPlan = {
  /** Department IDs to create (not currently present). */
  toCreate: string[];
  /** Existing responsibility row IDs to delete (department no longer selected). */
  toDeleteIds: string[];
  /** Department IDs already present — leave capabilities / kind untouched. */
  toKeep: string[];
};

/**
 * Diff desired department checkboxes against existing responsibility rows.
 * Preserves existing rows for still-selected departments (capabilities stay intact).
 */
export function planResponsibilitySync(input: {
  desiredDepartmentIds: readonly string[];
  existing: readonly { id: string; department: { id: string } }[];
}): ResponsibilitySyncPlan {
  const desired = [...new Set(input.desiredDepartmentIds)];
  const desiredSet = new Set(desired);
  const existingByDept = new Map(
    input.existing.map((row) => [row.department.id, row.id] as const),
  );

  const toCreate = desired.filter((id) => !existingByDept.has(id));
  const toDeleteIds: string[] = [];
  const toKeep: string[] = [];

  for (const row of input.existing) {
    if (desiredSet.has(row.department.id)) {
      toKeep.push(row.department.id);
    } else {
      toDeleteIds.push(row.id);
    }
  }

  return { toCreate, toDeleteIds, toKeep };
}

export type DescendantApplyTargets = {
  /** Child / nested neighborhood Unit IDs (UnitDepartmentResponsibility targets). */
  neighborhoodUnitIds: string[];
  /** All descendant UnitSpace IDs including rooms under nested neighborhoods. */
  spaceIds: string[];
};

type HierarchyUnitLike = {
  id: string;
  /** When present, FLOOR children are skipped as responsibility targets (structural). */
  hierarchyRole?: string | null;
  parentUnitId?: string | null;
  childUnits: HierarchyUnitLike[];
  childSpaces: { id: string }[];
};

function isStructuralFloorUnit(node: HierarchyUnitLike): boolean {
  return node.hierarchyRole === "FLOOR" || node.hierarchyRole === "BUILDING";
}

/**
 * Collect actionable descendant neighborhoods + rooms under a unit (depth-first).
 * Structural floor descendants are never responsibility targets; their rooms
 * under them are still collected when walking continues past nested floors.
 */
export function collectDescendantResponsibilityTargets(
  unit: HierarchyUnitLike,
): DescendantApplyTargets {
  const neighborhoodUnitIds: string[] = [];
  const spaceIds: string[] = [];

  function walk(node: HierarchyUnitLike) {
    for (const space of node.childSpaces) {
      spaceIds.push(space.id);
    }
    for (const child of node.childUnits) {
      if (!isStructuralFloorUnit(child)) {
        neighborhoodUnitIds.push(child.id);
      }
      walk(child);
    }
  }

  walk(unit);
  return { neighborhoodUnitIds, spaceIds };
}

export function formatApplyToDescendantsConfirm(input: {
  locationName: string;
  /** e.g. "2 neighborhoods and 14 rooms" or "5 rooms" */
  scopeSummary: string;
}): string {
  return (
    `Apply these department assignments to ${input.scopeSummary} under ${input.locationName}?\n\n` +
    "This overwrites existing department assignments on those locations. " +
    "Capabilities already set on matching departments are kept."
  );
}

/** Floor (structural) bulk apply — never implies the floor itself is responsible. */
export function formatStructuralBulkApplyConfirm(input: {
  locationName: string;
  scopeSummary: string;
}): string {
  return (
    `Apply these departments to ${input.scopeSummary} under ${input.locationName}?\n\n` +
    `This does not assign departments to ${input.locationName} itself. ` +
    "It overwrites department assignments on the locations below. " +
    "Capabilities already set on matching departments are kept."
  );
}

export function summarizeApplyScope(input: {
  neighborhoodCount: number;
  roomCount: number;
  level2Singular: string;
  level2Plural: string;
  level3Singular: string;
  level3Plural: string;
}): string {
  const parts: string[] = [];
  if (input.neighborhoodCount > 0) {
    const label =
      input.neighborhoodCount === 1 ? input.level2Singular : input.level2Plural;
    parts.push(`${input.neighborhoodCount} ${label.toLowerCase()}`);
  }
  if (input.roomCount > 0) {
    const label = input.roomCount === 1 ? input.level3Singular : input.level3Plural;
    parts.push(`${input.roomCount} ${label.toLowerCase()}`);
  }
  if (parts.length === 0) return "all locations below";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} and ${parts[1]}`;
}
