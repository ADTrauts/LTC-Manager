/** Shared Plant maintenance scope, without manufacturing room responsibility. */
export type PlantFacilityWidePolicy = {
  kind: "PLANT_FACILITY_WIDE_MAINTENANCE";
  createsRoomAssignments: false;
};

export const PLANT_FACILITY_WIDE_POLICY: PlantFacilityWidePolicy = {
  kind: "PLANT_FACILITY_WIDE_MAINTENANCE",
  createsRoomAssignments: false,
};
