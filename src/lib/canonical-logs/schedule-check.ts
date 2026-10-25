/**
 * A check with no repair work is a scheduled Record on a room or asset.
 * Mechanical room inspections, boiler and gauge readings, restroom rounds,
 * and dry-storage temperatures use ordinary Catalog attachments.
 */

export const MECHANICAL_ROOM_INSPECTION = "plant_mechanical_room_inspection";
export const EQUIPMENT_READING = "plant_basic_equipment_reading";
export const RESTROOM_ROUND = "evs_restroom_sanitation_round";
export const DRY_STORAGE_AMBIENT = "dietary_dry_storage_ambient";

export function isMechanicalRoom(input: { roomTypeKey: string | null; name: string }): boolean {
  return `${input.roomTypeKey ?? ""} ${input.name}`.toLowerCase().includes("mechanical");
}

export function isRestroom(input: { roomTypeKey: string | null; name: string }): boolean {
  const haystack = `${input.roomTypeKey ?? ""} ${input.name}`.toLowerCase();
  return haystack.includes("restroom") || haystack.includes("bathroom");
}

export function isDryStorage(input: { roomTypeKey: string | null; name: string }): boolean {
  const haystack = `${input.roomTypeKey ?? ""} ${input.name}`.toLowerCase();
  return haystack.includes("dry_storage") || haystack.includes("dry storage");
}

export function isGaugeEquipment(input: { name: string; equipmentType: string }): boolean {
  const haystack = `${input.name} ${input.equipmentType}`.toLowerCase();
  return haystack.includes("boiler") || haystack.includes("gauge");
}
