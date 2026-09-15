/**
 * User-facing Asset location labels (Unit + optional Room/Space).
 * Does not invent a second location model — formats existing Unit / UnitSpace names.
 */

export type AssetLocationLabelInput = {
  unitName: string;
  spaceName?: string | null;
  /** Facility vocabulary level-3 singular (default "Room"). */
  roomTerm?: string;
};

/**
 * Natural location string for lists and detail headers.
 *
 * Examples:
 * - Unit only → `Main Kitchen`
 * - Unit + Room → `Naval Park → Servery`
 */
export function formatAssetLocationLabel(input: AssetLocationLabelInput): string {
  const unit = input.unitName.trim();
  const space = input.spaceName?.trim() || "";
  if (!unit && !space) return "Location unset";
  if (!space) return unit || "Location unset";
  if (!unit) return space;
  return `${unit} → ${space}`;
}

/**
 * Accessible description when a Room is present.
 * Example: `Naval Park, Room Servery`
 */
export function formatAssetLocationAriaLabel(input: AssetLocationLabelInput): string {
  const unit = input.unitName.trim();
  const space = input.spaceName?.trim() || "";
  const roomTerm = (input.roomTerm ?? "Room").trim() || "Room";
  if (!unit && !space) return "Location unset";
  if (!space) return unit;
  if (!unit) return `${roomTerm} ${space}`;
  return `${unit}, ${roomTerm} ${space}`;
}

/**
 * When the Unit changes, a Room from the previous Unit must not be retained.
 * Returns null when the current space is missing or not in the eligible set.
 */
export function resolveSpaceIdForUnitChange(input: {
  nextUnitId: string;
  currentSpaceId: string | null | undefined;
  /** Spaces allowed for nextUnitId (typically unit-owned rooms). */
  eligibleSpaceIds: readonly string[];
}): string | null {
  const current = input.currentSpaceId?.trim() || null;
  if (!current) return null;
  return input.eligibleSpaceIds.includes(current) ? current : null;
}
