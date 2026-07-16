import type { UnitType } from "@prisma/client";

/**
 * Unit types that collect scheduled breakfast/lunch/dinner times (e.g. servery line service).
 * Kitchen / office / storage typically do not use these fields.
 */
export function unitTypeUsesServingTimes(unitType: UnitType): boolean {
  return unitType === "SERVERY";
}

/**
 * Shared user-facing labels for UnitType.
 * RESTROOM_CLUSTER always displays as "Restroom" (never "Restroom Cluster").
 */
export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  SERVERY: "Servery",
  KITCHEN: "Kitchen",
  RETAIL: "Retail",
  OFFICE: "Office",
  STORAGE: "Storage",
  OTHER: "General",
  RESIDENT_AREA: "Resident area",
  COMMON_AREA: "Common area",
  MECHANICAL: "Mechanical / MEP",
  RESTROOM_CLUSTER: "Restroom",
  EVS_ZONE: "EVS zone",
  GROUND: "Grounds / exterior",
};

/** @deprecated Prefer UNIT_TYPE_LABELS / unitTypeLabel */
export const extendedUnitTypeLabels: Partial<Record<UnitType, string>> = {
  RESIDENT_AREA: UNIT_TYPE_LABELS.RESIDENT_AREA,
  COMMON_AREA: UNIT_TYPE_LABELS.COMMON_AREA,
  MECHANICAL: UNIT_TYPE_LABELS.MECHANICAL,
  RESTROOM_CLUSTER: UNIT_TYPE_LABELS.RESTROOM_CLUSTER,
  EVS_ZONE: UNIT_TYPE_LABELS.EVS_ZONE,
  GROUND: UNIT_TYPE_LABELS.GROUND,
};

export function unitTypeLabel(unitType: UnitType): string {
  return UNIT_TYPE_LABELS[unitType] ?? "General";
}
