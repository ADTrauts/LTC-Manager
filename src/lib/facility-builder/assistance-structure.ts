import type { Prisma } from "@prisma/client";

const unitKinds = { BUILDING: "Building", FLOOR: "Floor", NEIGHBORHOOD: "Neighborhood" } as const;
const spaceTypes = {
  SERVICE_AREA: "Service area", PRODUCTION_AREA: "Production area", STORAGE: "Storage",
  UTILITY: "Utility", OFFICE: "Office", RESTROOM: "Restroom", MECHANICAL: "Mechanical",
  PUBLIC_AREA: "Public area",
} as const;

export type AssistanceSpace = { name: string; type: string; spaces: AssistanceSpace[] };
export type AssistanceUnit = { name: string; kind: string; units: AssistanceUnit[]; spaces: AssistanceSpace[] };
export type AssistanceStructure = { facilityName: string; units: AssistanceUnit[] };

export class AssistanceStructureTooLarge extends Error {}

/** A projection of the canonical physical tree. This client exposes only the three owning readers. */
export async function readAssistanceStructure(
  tx: Pick<Prisma.TransactionClient, "facility" | "unit" | "unitSpace">,
  facilityId: string,
): Promise<AssistanceStructure | null> {
  const facility = await tx.facility.findUnique({
    where: { id: facilityId }, select: { id: true, displayName: true },
  });
  if (!facility) return null;

  const units = await tx.unit.findMany({
    where: { facilityId: facility.id, isActive: true, hierarchyRole: { in: ["BUILDING", "FLOOR", "NEIGHBORHOOD"] } },
    select: { id: true, name: true, hierarchyRole: true, parentUnitId: true, displayOrder: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }], take: 251,
  });
  if (units.length > 250) throw new AssistanceStructureTooLarge();

  const unitChildren = new Map<string | null, typeof units>();
  for (const unit of units) {
    const siblings = unitChildren.get(unit.parentUnitId) ?? [];
    siblings.push(unit);
    unitChildren.set(unit.parentUnitId, siblings);
  }
  const included = new Set<string>();
  function buildUnits(parent: string | null, allowed: readonly string[]): AssistanceUnit[] {
    return (unitChildren.get(parent) ?? []).flatMap((unit) => {
      const kind = unit.hierarchyRole;
      if (!kind || kind === "STAGED" || !allowed.includes(kind) || included.has(unit.id)) return [];
      included.add(unit.id);
      const node = { name: unit.name, kind: unitKinds[kind], units: buildUnits(unit.id,
        kind === "BUILDING" ? ["FLOOR"] : kind === "FLOOR" ? ["NEIGHBORHOOD"] : []), spaces: [] };
      spacesByUnit.set(unit.id, node);
      return [node];
    });
  }
  const spacesByUnit = new Map<string, AssistanceUnit>();
  const roots = buildUnits(null, ["BUILDING", "FLOOR"]);
  const spaces = await tx.unitSpace.findMany({
    where: {
      facilityId: facility.id, unitId: { in: [...included] }, isActive: true,
      spaceType: { in: ["SERVICE_AREA", "PRODUCTION_AREA", "STORAGE", "UTILITY", "OFFICE", "RESTROOM", "MECHANICAL", "PUBLIC_AREA"] },
    },
    select: { id: true, name: true, spaceType: true, unitId: true, parentSpaceId: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1001,
  });
  if (spaces.length > 1000) throw new AssistanceStructureTooLarge();

  const spaceChildren = new Map<string | null, typeof spaces>();
  for (const space of spaces) {
    const siblings = spaceChildren.get(space.parentSpaceId) ?? [];
    siblings.push(space);
    spaceChildren.set(space.parentSpaceId, siblings);
  }
  function buildSpace(space: typeof spaces[number], visited: Set<string>): AssistanceSpace | null {
    if (visited.has(space.id) || space.spaceType === "PATIENT_ROOM" || space.spaceType === "OTHER") return null;
    visited.add(space.id);
    return { name: space.name, type: spaceTypes[space.spaceType],
      spaces: (spaceChildren.get(space.id) ?? []).flatMap((child) => {
        if (child.unitId !== space.unitId) return [];
        const node = buildSpace(child, visited);
        return node ? [node] : [];
      }) };
  }
  const visited = new Set<string>();
  for (const space of spaceChildren.get(null) ?? []) {
    const unit = space.unitId && spacesByUnit.get(space.unitId);
    const node = unit && buildSpace(space, visited);
    if (node) unit.spaces.push(node);
  }
  return { facilityName: facility.displayName, units: roots };
}
