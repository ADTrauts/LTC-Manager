/**
 * Plant facility-wide maintenance policy.
 *
 * Broad Plant coverage is a policy. It does not copy room assignments and
 * it does not classify rooms.
 */

export type PlantFacilityWidePolicy = {
  kind: "PLANT_FACILITY_WIDE_MAINTENANCE";
  /** The policy never fabricates Facility Builder assignments. */
  createsRoomAssignments: false;
};

export const PLANT_FACILITY_WIDE_POLICY: PlantFacilityWidePolicy = {
  kind: "PLANT_FACILITY_WIDE_MAINTENANCE",
  createsRoomAssignments: false,
};
