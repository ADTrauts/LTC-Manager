import { type UnitType, type WorkStation } from "@prisma/client";

const unitTypeEligibleStations: Record<UnitType, WorkStation[]> = {
  SERVERY: ["SERVER", "DIET"],
  KITCHEN: ["COOK", "DISHWASHER", "UTILITY", "PORTER"],
  RETAIL: ["RETAIL"],
  OFFICE: ["OFFICE"],
  STORAGE: ["UTILITY", "PORTER"],
  RESIDENT_AREA: [],
  COMMON_AREA: [],
  MECHANICAL: ["UTILITY"],
  RESTROOM_CLUSTER: [],
  EVS_ZONE: ["PORTER", "UTILITY"],
  GROUND: ["PORTER"],
  OTHER: [],
};

function getAllowedStationsForUnitType(unitType: UnitType) {
  return new Set(unitTypeEligibleStations[unitType]);
}

export function isEmployeeEligibleForUnitType(args: {
  unitType: UnitType;
  workStations: WorkStation[];
}) {
  const allowedStations = getAllowedStationsForUnitType(args.unitType);
  if (allowedStations.size === 0) return true;
  return args.workStations.some((station) => allowedStations.has(station));
}

export function isEmployeeEligibleForUnit(args: {
  unitId: string;
  unitType: UnitType;
  workStations: WorkStation[];
  allowedUnitIds: Set<string> | null;
}) {
  if (args.allowedUnitIds && !args.allowedUnitIds.has(args.unitId)) {
    return false;
  }
  return isEmployeeEligibleForUnitType({ unitType: args.unitType, workStations: args.workStations });
}
