import type { Prisma, UnitHierarchyRole } from "@prisma/client";

/** Hierarchy roles that must never appear on operational surfaces. */
export const BUILDER_ONLY_HIERARCHY_ROLES: readonly UnitHierarchyRole[] = [
  "STAGED",
];

/**
 * Prisma where-clause fragment: Units visible outside Facility Builder.
 * Excludes STAGED (undesignated) neighborhoods.
 */
export function operationalUnitWhere(
  facilityId: string,
  extra?: Prisma.UnitWhereInput,
): Prisma.UnitWhereInput {
  return {
    facilityId,
    NOT: { hierarchyRole: { in: [...BUILDER_ONLY_HIERARCHY_ROLES] } },
    ...extra,
  };
}

/** True when a Unit is builder-only staging (Undesignated). */
export function isStagedUnit(unit: {
  hierarchyRole?: UnitHierarchyRole | string | null;
}): boolean {
  return unit.hierarchyRole === "STAGED";
}

/** True when a room has not been placed under a Floor or Neighborhood. */
export function isUndesignatedSpace(space: {
  unitId?: string | null;
}): boolean {
  return space.unitId == null;
}
