/**
 * Cycle location applicability.
 *
 * A Cycle applies in one of two ways:
 *
 * 1. ALL_DEPARTMENT_UNITS — department-wide.
 *    A place participates when Facility Builder says this Department is
 *    responsible for it. That set is dynamic on purpose: a newly responsible
 *    room joins because the manager chose every responsible place.
 *
 * 2. EXPLICIT_UNITS — canonical Unit and UnitSpace ids on
 *    DepartmentOperationalCycleLocation, plus Key Point room-group space ids.
 *    A Unit id is that Unit. It does not mean every current or future room
 *    under it. Rooms participate only when their UnitSpace ids are stored.
 *    Floor, neighborhood, and Facility Room Type may filter the picker.
 *    They are not saved as rules.
 *
 * OPERATIONAL_TYPES, UNIT_TYPES, and ROOM_TYPE do not match. Persisted enum
 * values may remain until a later schema pass. They are not forward behavior.
 *
 * A child that inherits location uses the parent's mode and ids.
 *
 * Callers that already limited the question to this Department's responsible
 * places may omit `responsible`. Pass responsible: false when the place is
 * outside that responsibility so a department-wide Cycle does not include it.
 */

import type { OperationalCycleLocationMode } from "@prisma/client";

import { effectiveCycleSpaceIds } from "./effective-cycle-spaces";
import type { OperationalCycleDefinition } from "./types";

export type CycleApplicabilitySource = "DEPARTMENT_WIDE" | "EXPLICIT_LOCATION";

export type CycleApplicabilityContext = {
  spaceId?: string | null;
  unitId?: string | null;
  /**
   * False when this place is not a responsibility of the Cycle's Department.
   * Omitted means the caller already limited the question to responsible places.
   */
  responsible?: boolean;
  /**
   * Ignored. Location Function, Operational Type, Facility Room Type, and
   * unit type do not choose Cycle membership.
   */
  operationalTypeKey?: string | null;
  operationalTypeName?: string | null;
  physicalRoomTypeKey?: string | null;
  unitType?: string | null;
};

export type CycleApplicabilityMatch = {
  sources: readonly CycleApplicabilitySource[];
};

function inheritedCycle(
  cycle: Pick<OperationalCycleDefinition, "locationInheritFromParent" | "parentStableKey">,
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>,
): OperationalCycleDefinition | null {
  if (!cycle.locationInheritFromParent || !cycle.parentStableKey) return null;
  return allCyclesByStableKey.get(cycle.parentStableKey) ?? null;
}

/** Location mode after walking parent inheritance. Retired modes stay visible so callers can reject them. */
export function resolvedCycleLocationMode(
  cycle: Pick<OperationalCycleDefinition, "locationMode" | "locationInheritFromParent" | "parentStableKey">,
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>,
): OperationalCycleLocationMode {
  const parent = inheritedCycle(cycle, allCyclesByStableKey);
  if (parent) return resolvedCycleLocationMode(parent, allCyclesByStableKey);
  return cycle.locationMode;
}

function explicitHitsLocation(
  cycle: OperationalCycleDefinition,
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>,
  context: CycleApplicabilityContext,
): boolean {
  const spaces = effectiveCycleSpaceIds(cycle, allCyclesByStableKey);
  if (context.spaceId && spaces.includes(context.spaceId)) return true;
  if (context.unitId && cycle.unitIds.includes(context.unitId)) return true;
  if (context.spaceId && cycle.spaceIds.includes(context.spaceId)) return true;
  return false;
}

/**
 * Sources that match this location.
 * Department-wide does not also require an explicit id.
 * Explicit membership does not expand a room type or function key.
 */
export function matchCycleApplicability(input: {
  cycle: OperationalCycleDefinition;
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>;
  context: CycleApplicabilityContext;
}): CycleApplicabilityMatch | null {
  const { cycle, allCyclesByStableKey, context } = input;
  const sources: CycleApplicabilitySource[] = [];
  const mode = resolvedCycleLocationMode(cycle, allCyclesByStableKey);

  if (mode === "ALL_DEPARTMENT_UNITS" && context.responsible !== false) {
    sources.push("DEPARTMENT_WIDE");
  }

  if (explicitHitsLocation(cycle, allCyclesByStableKey, context)) {
    sources.push("EXPLICIT_LOCATION");
  }

  if (sources.length === 0) return null;
  return { sources };
}

export function cycleMatchesLocation(input: {
  cycle: OperationalCycleDefinition;
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>;
  context: CycleApplicabilityContext;
}): boolean {
  return matchCycleApplicability(input) != null;
}

export function describeCycleApplicability(match: CycleApplicabilityMatch): string {
  const parts = match.sources.map((source) => {
    if (source === "EXPLICIT_LOCATION") return "Applied directly to this location";
    return "Applies to every location this department is responsible for";
  });
  return parts.join(" · ");
}

export function primaryCycleApplicabilitySource(
  sources: readonly CycleApplicabilitySource[],
): CycleApplicabilitySource {
  if (sources.includes("EXPLICIT_LOCATION")) return "EXPLICIT_LOCATION";
  if (sources.includes("DEPARTMENT_WIDE")) return "DEPARTMENT_WIDE";
  return sources[0] ?? "EXPLICIT_LOCATION";
}

/**
 * Rooms a Cycle contributes when another engine asks which places it covers.
 * Department-wide uses the places the caller already decided are this
 * Department's. Explicit uses stored ids. A function key on the space is ignored.
 * Retired modes contribute no rooms.
 */
export function resolveWorkCycleRoomParticipation(
  cycle: OperationalCycleDefinition,
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>,
  spaces: readonly { id: string; operationalTypeKey?: string | null }[],
): { spaceIds: string[]; roomSetClosed: boolean } {
  const mode = resolvedCycleLocationMode(cycle, allCyclesByStableKey);
  if (mode === "ALL_DEPARTMENT_UNITS") {
    return {
      spaceIds: spaces.map((space) => space.id),
      roomSetClosed: false,
    };
  }
  const explicit = effectiveCycleSpaceIds(cycle, allCyclesByStableKey);
  if (spaces.length === 0) {
    return { spaceIds: [...explicit], roomSetClosed: true };
  }
  const allowed = new Set(explicit);
  return {
    spaceIds: spaces.filter((space) => allowed.has(space.id)).map((space) => space.id),
    roomSetClosed: true,
  };
}
