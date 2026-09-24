/**
 * Load department Operational Types and room assignments.
 *
 * Two perspectives:
 *   working — Build preview / Cycle Builder. Prefers the editable DRAFT.
 *   runtime — Run. Uses only the ACTIVE profile. Draft never leaks into Run.
 *
 * Bindings are version-scoped through DepartmentOperationalProfile.
 * Does not invent Operational Type from physical Room Type or Unit.unitType.
 *
 * Profile activation is immediate (CERTIFIED → ACTIVE). There is no scheduled
 * future activation in this phase.
 */

import { prisma } from "@/lib/prisma";

export type OperationalTypePerspective = "working" | "runtime";

export type DepartmentOperationalTypeOption = {
  key: string;
  name: string;
};

export type SpaceOperationalTypeAssignment = {
  key: string;
  name: string;
};

export type OperationalTypeProfileRow = {
  id: string;
  status: "DRAFT" | "CERTIFIED" | "ACTIVE" | "RETIRED";
};

/**
 * Choose which profile owns Operational Type assignments.
 * working: DRAFT → ACTIVE → CERTIFIED
 * runtime: ACTIVE only (never DRAFT / CERTIFIED / RETIRED)
 */
export function selectProfileIdForOperationalTypes(
  profiles: readonly OperationalTypeProfileRow[],
  perspective: OperationalTypePerspective,
): string | null {
  if (perspective === "runtime") {
    return profiles.find((profile) => profile.status === "ACTIVE")?.id ?? null;
  }
  const draft = profiles.find((profile) => profile.status === "DRAFT");
  if (draft) return draft.id;
  const active = profiles.find((profile) => profile.status === "ACTIVE");
  if (active) return active.id;
  const certified = profiles.find((profile) => profile.status === "CERTIFIED");
  if (certified) return certified.id;
  return null;
}

export type OperationalTypeBindingRow = {
  unitSpaceId: string;
  archetype: { key: string; name: string; isActive: boolean };
};

/** Skip inactive archetypes. No physical / Unit.unitType fallback. */
export function assignmentsFromBindings(
  bindings: readonly OperationalTypeBindingRow[],
): Map<string, SpaceOperationalTypeAssignment> {
  const assignments = new Map<string, SpaceOperationalTypeAssignment>();
  for (const row of bindings) {
    if (!row.archetype.isActive) continue;
    const key = row.archetype.key.trim();
    if (!key) continue;
    assignments.set(row.unitSpaceId, {
      key,
      name: row.archetype.name,
    });
  }
  return assignments;
}

export async function loadDepartmentOperationalTypeOptions(input: {
  facilityId: string;
  departmentId: string;
  perspective: OperationalTypePerspective;
}): Promise<DepartmentOperationalTypeOption[]> {
  const profileId = await resolveProfileId(input);
  if (!profileId) return [];

  const rows = await prisma.departmentRoomArchetype.findMany({
    where: { profileId, isActive: true },
    select: { key: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => ({ key: row.key, name: row.name }));
}

export async function loadSpaceOperationalTypeAssignments(input: {
  facilityId: string;
  departmentId: string;
  spaceIds?: readonly string[];
  perspective: OperationalTypePerspective;
}): Promise<Map<string, SpaceOperationalTypeAssignment>> {
  const profileId = await resolveProfileId(input);
  if (!profileId) return new Map();

  const bindings = await prisma.departmentRoomArchetypeBinding.findMany({
    where: {
      profileId,
      ...(input.spaceIds && input.spaceIds.length > 0
        ? { unitSpaceId: { in: [...input.spaceIds] } }
        : {}),
    },
    select: {
      unitSpaceId: true,
      archetype: { select: { key: true, name: true, isActive: true } },
    },
  });

  return assignmentsFromBindings(bindings);
}

async function resolveProfileId(input: {
  facilityId: string;
  departmentId: string;
  perspective: OperationalTypePerspective;
}): Promise<string | null> {
  const profiles = await prisma.departmentOperationalProfile.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: { in: ["DRAFT", "CERTIFIED", "ACTIVE"] },
    },
    select: { id: true, status: true },
    orderBy: { version: "desc" },
  });
  return selectProfileIdForOperationalTypes(profiles, input.perspective);
}
