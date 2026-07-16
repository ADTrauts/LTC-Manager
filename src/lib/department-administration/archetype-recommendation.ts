/**
 * Physical room classification → archetype recommendation.
 *
 * Reuses Facility Builder space-type preset keys as suggestions only.
 * A recommendation is advisory: it never persists a binding. The department
 * director remains in control of room-to-archetype assignment.
 */

import type { BaselineDepartmentKey } from "./baseline";

/**
 * Space-type preset key (Facility Builder) → baseline archetype key.
 * Only confident mappings are listed; unknown types return undefined.
 */
const RECOMMENDATIONS: Record<
  BaselineDepartmentKey,
  Readonly<Record<string, string>>
> = {
  DIETARY: {
    servery: "servery",
    dining_room: "dining_room",
    production_area: "production_kitchen",
    storage: "storage_supply",
    office: "office_support",
    resident_room: "tray_delivery_point",
    patient_room: "tray_delivery_point",
  },
  EVS: {
    resident_room: "occupied_resident_room",
    patient_room: "occupied_resident_room",
    public_area: "public_area",
    hallway: "public_area",
    restroom: "restroom",
    utility_room: "utility_soiled_area",
    office: "office_support",
  },
  PLANT: {
    mechanical_room: "mechanical_room",
    utility_room: "utility_area",
    production_area: "equipment_area",
    storage: "serviceable_space",
    office: "serviceable_space",
    public_area: "serviceable_space",
  },
};

/**
 * Recommend an archetype key for a department + physical space-type preset.
 * Advisory only — callers must confirm before creating a binding.
 */
export function recommendArchetypeKey(
  departmentKey: string,
  spaceTypePresetKey: string | null | undefined,
): string | undefined {
  const map = RECOMMENDATIONS[departmentKey as BaselineDepartmentKey];
  if (!map) return undefined;
  const key = spaceTypePresetKey?.trim();
  if (!key) return undefined;
  return map[key];
}
