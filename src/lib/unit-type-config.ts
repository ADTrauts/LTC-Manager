import type { UnitType } from "@prisma/client";

/**
 * Unit types that collect scheduled breakfast/lunch/dinner times (e.g. servery line service).
 * Kitchen / office / storage typically do not use these fields.
 */
export function unitTypeUsesServingTimes(unitType: UnitType): boolean {
  return unitType === "SERVERY";
}
