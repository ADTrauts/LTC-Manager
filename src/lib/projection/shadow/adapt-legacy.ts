/**
 * Wave 15E — adapt legacy eligibility → ShadowEligibilityView.
 *
 * Legacy = assignments + capability strings (via Experience compatibility),
 * sidebar unit visibility, and optional Plant coverage notes.
 * Does not invent Projection rules.
 */

import { experiencesFromCapabilities } from "@/lib/experiences";
import {
  findAreaForExperience,
  getExperience,
  listOperationalAreasForDepartment,
} from "@/lib/experiences";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type {
  ShadowAreaView,
  ShadowEligibilityView,
  ShadowExperienceView,
  ShadowQueryScopeView,
} from "./types";

export type LegacyShadowRoom = {
  roomId: string;
  /** Physical location id used for parity with Projection location ids. */
  locationId: string;
  unitId: string | null;
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  capabilities: readonly string[];
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
  const experienceLocations = new Map<string, Set<string>>();
  const experienceArea = new Map<string, string>();
  const experienceOrder = new Map<string, number>();

  for (const room of input.rooms) {
    if (!room.isActive || !room.isPlaced) continue;
    if (
      !unitAllowed(room.unitId, input.allowedUnitIds, input.lockedUnitId)
    ) {
      continue;
    }
    if (!input.departmentKeys.includes(room.departmentKey)) continue;

    const experienceKeys = experiencesFromCapabilities(room.capabilities);
    for (const experienceKey of experienceKeys) {
      const experience = getExperience(experienceKey);
      if (!experience) continue;
      if (!experience.departments.includes(room.departmentKey)) continue;

      const area = findAreaForExperience(room.departmentKey, experienceKey);
      if (!area || area.departmentKey !== room.departmentKey) continue;

      const locations = experienceLocations.get(experienceKey) ?? new Set();
      locations.add(room.locationId);
      experienceLocations.set(experienceKey, locations);
      experienceArea.set(experienceKey, area.key);
      experienceOrder.set(
        experienceKey,
        experienceOrder.get(experienceKey) ?? area.experienceKeys.indexOf(experienceKey),
      );
    }
  }

  const experiences: ShadowExperienceView[] = [...experienceLocations.entries()]
    .map(([experienceKey, locations]) => {
      const experience = getExperience(experienceKey)!;
      return {
        experienceKey,
        areaKey: experienceArea.get(experienceKey)!,
        order: (experienceOrder.get(experienceKey) ?? 0) * 10 || 10,
        locationIds: [...locations].sort((a, b) => a.localeCompare(b)),
        allowedActionKeys: experience.contracts.actions
          .map((action) => action.key)
          .sort((a, b) => a.localeCompare(b)),
        navigationHandles: experience.contracts.navigationContribution.entries
          .map((entry) => entry.id)
          .sort((a, b) => a.localeCompare(b)),
        workspaceHandles: [
          experience.contracts.workspaceContribution.density,
          experience.contracts.unitWorkspaceContribution.density,
          experience.contracts.businessWorkspaceContribution.density,
          experience.contracts.operationsCenterContribution.density,
        ],
      };
    })
    .sort(
      (a, b) =>
        a.areaKey.localeCompare(b.areaKey) ||
        a.order - b.order ||
        a.experienceKey.localeCompare(b.experienceKey),
    );

  const areas: ShadowAreaView[] = [];
  for (const departmentKey of input.departmentKeys) {
    for (const area of listOperationalAreasForDepartment(departmentKey)) {
      const experienceKeys = experiences
        .filter((experience) => experience.areaKey === area.key)
        .map((experience) => experience.experienceKey);
      if (experienceKeys.length === 0) continue;
      areas.push({
        areaKey: area.key,
        order: area.order,
        experienceKeys,
      });
    }
  }

  const actionableLocationIds = sortedUnique(
    experiences.flatMap((experience) => experience.locationIds),
  );
  const roomIds = sortedUnique(
    input.rooms
      .filter((room) => actionableLocationIds.includes(room.locationId))
      .map((room) => room.roomId),
  );

  const locationIds = sortedUnique([
    ...input.sidebarUnitIds.map((id) => `unit:${id}`),
    ...actionableLocationIds,
  ]);

  const queryScopes: ShadowQueryScopeView[] = experiences.map((experience) => {
    const rooms = input.rooms.filter((room) =>
      experience.locationIds.includes(room.locationId),
    );
    return {
      experienceKey: experience.experienceKey,
      unitIds: sortedUnique(
        rooms.map((room) => room.unitId).filter((id): id is string => Boolean(id)),
      ),
      spaceIds: sortedUnique(rooms.map((room) => room.roomId)),
      domains: [
        ...(getExperience(experience.experienceKey)?.contracts.queryScope
          .domains ?? []),
      ].sort((a, b) => a.localeCompare(b)),
    };
  });

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
    areas: areas.sort(
      (a, b) => a.order - b.order || a.areaKey.localeCompare(b.areaKey),
    ),
    experiences,
    queryScopes: queryScopes.sort((a, b) =>
      a.experienceKey.localeCompare(b.experienceKey),
    ),
    plantApplied: input.plantApplied ?? false,
    plantCoveredLocationIds: sortedUnique(input.plantCoveredLocationIds ?? []),
    revisionTokens: [...(input.revisionTokens ?? [])].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}
