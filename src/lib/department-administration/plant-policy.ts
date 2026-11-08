/**
 * Plant facility-wide maintenance policy — typed integration boundary.
 *
 * Constitutional rule: broad Plant coverage is a certified policy, never
 * copied room assignments. This module defines the boundary Projection will
 * consume later; it creates no room rows and grants no Experiences itself.
 *
 * How Projection will combine (Wave 14C+ — not implemented here):
 *
 *   Plant active Operational Profile        what Plant does
 * + Plant facility-wide physical policy     which placed rooms are in scope
 * + archetype/default behavior              how Plant behaves per room kind
 * → Plant projection for a room
 *
 * Direct room bindings still exist for specialized spaces (Mechanical Rooms,
 * Equipment Areas). The facility-wide policy covers general serviceable
 * spaces WITHOUT creating UnitSpaceResponsibility rows or archetype bindings.
 */

import type { ProfileSnapshot } from "./profile-types";

export type PlantFacilityWidePolicy = {
  kind: "PLANT_FACILITY_WIDE_MAINTENANCE";
  /**
   * Archetype key applied by default to placed, active rooms without a direct
   * binding when Projection later evaluates Plant scope.
   */
  defaultArchetypeKey: string;
  /** Rooms with a direct binding always take their bound archetype instead. */
  directBindingsTakePrecedence: true;
  /** The policy never fabricates Facility Builder assignments. */
  createsRoomAssignments: false;
};

/** Certified placeholder for the Wave 14B boundary. */
export const PLANT_FACILITY_WIDE_POLICY: PlantFacilityWidePolicy = {
  kind: "PLANT_FACILITY_WIDE_MAINTENANCE",
  defaultArchetypeKey: "serviceable_space",
  directBindingsTakePrecedence: true,
  createsRoomAssignments: false,
};

/**
 * Guard: the policy may only expose Experiences that exist in the Plant
 * profile itself. It can never grant another department's Experiences.
 */
export function policyEligibleExperienceKeys(
  plantProfile: ProfileSnapshot,
): string[] {
  if (plantProfile.departmentKey !== "PLANT") {
    return [];
  }
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const area of plantProfile.areas) {
    if (!area.isActive) continue;
    for (const experience of area.experiences) {
      if (!experience.isActive || seen.has(experience.experienceKey)) continue;
      seen.add(experience.experienceKey);
      keys.push(experience.experienceKey);
    }
  }
  return keys;
}
