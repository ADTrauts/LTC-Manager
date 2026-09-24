/**
 * Cycle location applicability — including Operational Type targeting.
 *
 * OPERATIONAL_TYPES is the canonical reusable path:
 *   cycle → DepartmentRoomArchetype.key → rooms currently bound to that type.
 *
 * ROOM_TYPE / UNIT_TYPES remain compatibility modes and must not be labeled
 * as Operational Type. They do not infer an Operational Type.
 */

import type { OperationalCycleLocationMode, UnitType } from "@prisma/client";

import { buildCyclesByStableKey, effectiveCycleSpaceIds } from "./effective-cycle-spaces";
import type { OperationalCycleDefinition } from "./types";

export type CycleApplicabilitySource =
  | "DEPARTMENT_WIDE"
  | "OPERATIONAL_TYPE_DEFAULT"
  | "EXPLICIT_LOCATION"
  | "LEGACY_PHYSICAL_ROOM_TYPE"
  | "LEGACY_UNIT_TYPE";

export type CycleApplicabilityContext = {
  spaceId?: string | null;
  unitId?: string | null;
  /** Current DepartmentRoomArchetype.key for this room, if assigned. */
  operationalTypeKey?: string | null;
  operationalTypeName?: string | null;
  /** Physical Facility Room Type key — never treated as Operational Type. */
  physicalRoomTypeKey?: string | null;
  unitType?: UnitType | null;
};

export type CycleApplicabilityMatch = {
  sources: readonly CycleApplicabilitySource[];
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
};

function inheritedCycle(
  cycle: Pick<OperationalCycleDefinition, "locationInheritFromParent" | "parentStableKey">,
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>,
): OperationalCycleDefinition | null {
  if (!cycle.locationInheritFromParent || !cycle.parentStableKey) return null;
  return allCyclesByStableKey.get(cycle.parentStableKey) ?? null;
}

export function effectiveOperationalTypeKeys(
  cycle: Pick<
    OperationalCycleDefinition,
    "locationMode" | "locationInheritFromParent" | "parentStableKey" | "applicableOperationalTypeKeys"
  >,
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>,
): readonly string[] {
  const parent = inheritedCycle(cycle, allCyclesByStableKey);
  if (parent) return effectiveOperationalTypeKeys(parent, allCyclesByStableKey);
  if (cycle.locationMode !== "OPERATIONAL_TYPES") return [];
  return (cycle.applicableOperationalTypeKeys ?? []).filter(Boolean);
}

function resolvedMode(
  cycle: Pick<OperationalCycleDefinition, "locationMode" | "locationInheritFromParent" | "parentStableKey">,
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>,
): OperationalCycleLocationMode {
  const parent = inheritedCycle(cycle, allCyclesByStableKey);
  if (parent) return resolvedMode(parent, allCyclesByStableKey);
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
 * All applicability sources that currently match this location.
 * Duplicate sources are unique. Order is display-stable, not override precedence.
 * Explicit location is additive — never labeled LOCATION_OVERRIDE.
 */
export function matchCycleApplicability(input: {
  cycle: OperationalCycleDefinition;
  allCyclesByStableKey: ReadonlyMap<string, OperationalCycleDefinition>;
  context: CycleApplicabilityContext;
}): CycleApplicabilityMatch | null {
  const { cycle, allCyclesByStableKey, context } = input;
  const sources: CycleApplicabilitySource[] = [];
  const mode = resolvedMode(cycle, allCyclesByStableKey);
  const otKeys = effectiveOperationalTypeKeys(cycle, allCyclesByStableKey);
  const otKey = context.operationalTypeKey?.trim() || null;

  if (mode === "ALL_DEPARTMENT_UNITS") {
    sources.push("DEPARTMENT_WIDE");
  }

  if (otKeys.length > 0 && otKey && otKeys.includes(otKey)) {
    sources.push("OPERATIONAL_TYPE_DEFAULT");
  }

  if (explicitHitsLocation(cycle, allCyclesByStableKey, context)) {
    sources.push("EXPLICIT_LOCATION");
  } else if (
    mode === "EXPLICIT_UNITS" &&
    !cycle.locationInheritFromParent &&
    (cycle.spaceIds.length > 0 || cycle.unitIds.length > 0)
  ) {
    // explicit mode with a non-matching selection — do not add
  }

  if (mode === "ROOM_TYPE" && cycle.roomTypeKey && context.physicalRoomTypeKey) {
    if (cycle.roomTypeKey === context.physicalRoomTypeKey) {
      sources.push("LEGACY_PHYSICAL_ROOM_TYPE");
    }
  }

  if (mode === "UNIT_TYPES" && context.unitType) {
    if (cycle.applicableUnitTypes.includes(context.unitType)) {
      sources.push("LEGACY_UNIT_TYPE");
    }
  }

  if (sources.length === 0) return null;
  return {
    sources,
    operationalTypeKey: sources.includes("OPERATIONAL_TYPE_DEFAULT") ? otKey : null,
    operationalTypeName: sources.includes("OPERATIONAL_TYPE_DEFAULT")
      ? context.operationalTypeName ?? null
      : null,
  };
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
    if (source === "OPERATIONAL_TYPE_DEFAULT") {
      return match.operationalTypeName
        ? `Inherited from Operational Type: ${match.operationalTypeName}`
        : "Inherited from Operational Type";
    }
    if (source === "EXPLICIT_LOCATION") return "Applied directly to this location";
    if (source === "DEPARTMENT_WIDE") return "Applies to the entire department";
    if (source === "LEGACY_PHYSICAL_ROOM_TYPE") {
      return "Legacy applicability: Physical Room Type";
    }
    return "Legacy applicability: Unit type";
  });
  return parts.join(" · ");
}

export function primaryCycleApplicabilitySource(
  sources: readonly CycleApplicabilitySource[],
): CycleApplicabilitySource {
  if (sources.includes("OPERATIONAL_TYPE_DEFAULT")) return "OPERATIONAL_TYPE_DEFAULT";
  if (sources.includes("EXPLICIT_LOCATION")) return "EXPLICIT_LOCATION";
  if (sources.includes("DEPARTMENT_WIDE")) return "DEPARTMENT_WIDE";
  if (sources.includes("LEGACY_PHYSICAL_ROOM_TYPE")) return "LEGACY_PHYSICAL_ROOM_TYPE";
  return sources[0] ?? "EXPLICIT_LOCATION";
}

export { buildCyclesByStableKey };
