/**
 * Wave 15E — adapt legacy eligibility → ShadowEligibilityView.
 *
 * Legacy = assignments plus experience keys already on the room,
 * sidebar unit visibility, and optional Plant coverage notes.
 * Does not invent Projection rules.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type { ShadowEligibilityView } from "./types";

export type LegacyShadowRoom = {
  roomId: string;
  /** Physical location id used for parity with Projection location ids. */
  locationId: string;
  unitId: string | null;
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  isActive: boolean;
  isPlaced: boolean;
};

export type LegacyShadowInput = {
  facilityId: string;
  lensKey: string;
  departmentKeys: readonly OperationalDepartmentKey[];
  /** Sidebar / Locations visible unit ids (legacy flat list). */
  sidebarUnitIds: readonly string[];
  rooms: readonly LegacyShadowRoom[];
  /** Usually empty today — Plant facility-wide is policy, not assignments. */
  plantCoveredLocationIds?: readonly string[];
  plantApplied?: boolean;
  allowedUnitIds?: readonly string[] | "ALL";
  lockedUnitId?: string;
  revisionTokens?: readonly string[];
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function unitAllowed(
  unitId: string | null,
  allowedUnitIds: readonly string[] | "ALL" | undefined,
  lockedUnitId: string | undefined,
): boolean {
  if (!unitId) return false;
  if (lockedUnitId && lockedUnitId !== unitId) return false;
  if (!allowedUnitIds || allowedUnitIds === "ALL") return true;
  return allowedUnitIds.includes(unitId);
}

export function adaptLegacyEligibilityToShadowView(
  input: LegacyShadowInput,
): ShadowEligibilityView {
  const eligibleRooms = input.rooms.filter(
    (room) =>
      room.isActive &&
      room.isPlaced &&
      unitAllowed(room.unitId, input.allowedUnitIds, input.lockedUnitId) &&
      input.departmentKeys.includes(room.departmentKey),
  );
  const actionableLocationIds = sortedUnique(
    eligibleRooms.map((room) => room.locationId),
  );
  const roomIds = sortedUnique(eligibleRooms.map((room) => room.roomId));
  const locationIds = sortedUnique([
    ...input.sidebarUnitIds.map((id) => `unit:${id}`),
    ...actionableLocationIds,
  ]);

  return {
    source: "LEGACY",
    facilityId: input.facilityId,
    lensKey: input.lensKey,
    departmentKeys: [...input.departmentKeys].sort((a, b) =>
      a.localeCompare(b),
    ),
    locationIds,
    actionableLocationIds,
    roomIds,
    plantApplied: input.plantApplied ?? false,
    plantCoveredLocationIds: sortedUnique(input.plantCoveredLocationIds ?? []),
    revisionTokens: [...(input.revisionTokens ?? [])].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}
