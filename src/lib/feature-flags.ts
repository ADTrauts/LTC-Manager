function parseEnvFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return defaultValue;
}

/** Defaults to disabled — Wave 5 schema ships behind flag until sync/backfill verified. */
export function isOperationEngineEnabled(): boolean {
  return parseEnvFlag(process.env.OPERATION_ENGINE_ENABLED, false);
}

/** Defaults to enabled — Wave 4 ships with Today's Work on. Set `TODAYS_WORK_ENABLED=false` to roll back routes. */
export function isTodaysWorkEnabled(): boolean {
  return parseEnvFlag(process.env.TODAYS_WORK_ENABLED, true);
}

/** Defaults to disabled — Wave 7a Task dual-write stays off until sync is verified. */
export function isTaskSyncEnabled(): boolean {
  return parseEnvFlag(process.env.TASK_SYNC_ENABLED, false);
}

/** Defaults to disabled — Wave 10 Morning Brief stays off until provider is configured. */
export function isAiBriefEnabled(): boolean {
  return parseEnvFlag(process.env.AI_BRIEF_ENABLED, false);
}

/** Defaults to disabled — Wave 10 Shift Transition Summary stays off until enabled. */
export function isAiShiftSummaryEnabled(): boolean {
  return parseEnvFlag(process.env.AI_SHIFT_SUMMARY_ENABLED, false);
}

/** Defaults to disabled — Wave 10 Recovery Assistant stays off until enabled. */
export function isAiRecoveryAssistantEnabled(): boolean {
  return parseEnvFlag(process.env.AI_RECOVERY_ASSISTANT_ENABLED, false);
}

/** Defaults to disabled — Wave 14 Operational Assignments stay off until scheduling workflow is verified. */
export function isOperationalAssignmentsEnabled(): boolean {
  return parseEnvFlag(process.env.OPERATIONAL_ASSIGNMENTS_ENABLED, false);
}

/** Defaults to disabled — Wave 14B Department Operational Profiles foundation; no runtime consumers while off. */
export function isDepartmentOperationalProfilesEnabled(): boolean {
  return parseEnvFlag(process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED, false);
}

/** Defaults to disabled — Wave 15E Projection Shadow Mode (parity diagnostics only). */
export function isProjectionShadowEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_SHADOW_ENABLED, false);
}

/**
 * Defaults to enabled — Wave 15F Locations Experience cutover.
 * Set `PROJECTION_LOCATIONS_ENABLED=false` to roll back to legacy unit eligibility on `/units`.
 */
export function isProjectionLocationsEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_LOCATIONS_ENABLED, true);
}

/**
 * Defaults to disabled — Wave 15G Sidebar location tree cutover.
 * Set `PROJECTION_SIDEBAR_ENABLED=true` to serve Projection eligibility in the Locations rail.
 * When off, `getSidebarUnitsForSession` remains the exclusive Sidebar eligibility path.
 */
export function isProjectionSidebarEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_SIDEBAR_ENABLED, false);
}
