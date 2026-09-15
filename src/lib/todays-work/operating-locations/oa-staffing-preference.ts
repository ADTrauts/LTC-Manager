export function deriveAssignedCountsWithOaPreference(input: {
  operationalEnabled: boolean;
  /** Sum of OperationalAssignmentLocation-backed room staffing for the location's rooms. */
  spaceAssigned: number;
  /** OperationalAssignment unit-wide assigned count for the location's unit id (when used). */
  unitAssigned: number;
  /** OA template expected count at unit grain (may exist even when no local OA assignments exist). */
  expectedByUnitId: number | null;
  /** ScheduleEntry-derived staffing count for this location's unit id. */
  scheduleCount: number;
}): { assignedCount: number | null; expectedCount: number | null } {
  const hasMeaningfulOa = input.operationalEnabled && (input.unitAssigned > 0 || input.spaceAssigned > 0);

  const expectedCount = hasMeaningfulOa ? input.expectedByUnitId : null;

  if (hasMeaningfulOa) {
    const assignedCount = input.unitAssigned > 0 ? input.unitAssigned : input.spaceAssigned;
    return { assignedCount, expectedCount };
  }

  if (input.scheduleCount > 0) {
    return { assignedCount: input.scheduleCount, expectedCount: null };
  }

  return { assignedCount: null, expectedCount: null };
}

