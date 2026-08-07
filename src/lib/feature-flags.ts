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

/** Defaults to disabled — Phase 7A Dietary Assignments; enable with OPERATIONAL_ASSIGNMENTS_ENABLED=true for pilot. */
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
 * Defaults to enabled — Location Experience Certification (nested hierarchy rail).
 * Set `PROJECTION_SIDEBAR_ENABLED=false` to roll back to legacy flat Unit list.
 * When off, `getSidebarUnitsForSession` remains the exclusive Sidebar eligibility path.
 */
export function isProjectionSidebarEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_SIDEBAR_ENABLED, true);
}

/**
 * Defaults to disabled — Wave 15H Unit Workspace Experience cutover.
 * Set `PROJECTION_UNIT_WORKSPACE_ENABLED=true` to render Area → Experience panels from Projection.
 * When off, the legacy module-based Unit Workspace remains exclusive (no mix).
 */
export function isProjectionUnitWorkspaceEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_UNIT_WORKSPACE_ENABLED, false);
}

/**
 * Defaults to disabled — Wave 15I Today's Work Projection cutover.
 * Set `PROJECTION_TODAYS_WORK_ENABLED=true` to assemble walk/coverage/handoffs
 * within Projection eligibility only. When off, legacy Today's Work remains exclusive.
 */
export function isProjectionTodaysWorkEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_TODAYS_WORK_ENABLED, false);
}

/**
 * Defaults to disabled — Wave 15J Operations Center Projection cutover.
 * Set `PROJECTION_OPERATIONS_CENTER_ENABLED=true` to aggregate OC within
 * Projection eligibility only. When off, legacy OC remains exclusive (no mix).
 * Do not reuse the Today's Work flag.
 */
export function isProjectionOperationsCenterEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_OPERATIONS_CENTER_ENABLED, false);
}

/**
 * Defaults to disabled — Wave 15K Business Workspace Projection cutover.
 * Set `PROJECTION_BUSINESS_WORKSPACE_ENABLED=true` to compose Workspace from
 * projected Experiences/scopes only. When off, legacy Workspace remains exclusive.
 * Do not reuse OC or Today's Work flags.
 */
export function isProjectionBusinessWorkspaceEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_BUSINESS_WORKSPACE_ENABLED, false);
}

/**
 * Defaults to disabled — Wave 16A Experience Shell & Tool Host foundation.
 * Set `EXPERIENCE_SHELL_ENABLED=true` to render projected Experiences through
 * the reusable Experience Shell (sections/cards/widgets/tool host).
 * When off, Unit Workspace Projection keeps legacy placeholder panels.
 * No mixed rendering within a request.
 */
export function isExperienceShellEnabled(): boolean {
  return parseEnvFlag(process.env.EXPERIENCE_SHELL_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 9A Dietary Operational Cycles.
 * Set `DIETARY_OPERATIONAL_CYCLES_ENABLED=true` for Department Builder / runtime cycle context.
 * Does not enable `OPERATION_ENGINE_ENABLED` — Operations Engine stays off.
 */
export function isDietaryOperationalCyclesEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_OPERATIONAL_CYCLES_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 9B Dietary Employee Job Flow & Supervisor Operations Board.
 * Set `DIETARY_JOB_FLOW_ENABLED=true` for derived Job Flow / Operations Board projections.
 * Does not enable `OPERATION_ENGINE_ENABLED` — Operations Engine stays off.
 * Job Flow is a derived Runtime projection (no JobFlowRecord / no migration).
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_JOB_FLOW_ENABLED=true
 *   OPERATION_ENGINE_ENABLED=false
 */
export function isDietaryJobFlowEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_JOB_FLOW_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 9C Dietary Operational Evidence (Templates / Runtime / Log Book).
 * Set `DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true` for Builder, derived requirements, and records.
 * Does not enable `OPERATION_ENGINE_ENABLED` — Operations Engine stays off.
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_JOB_FLOW_ENABLED=true
 *   DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
 *   OPERATION_ENGINE_ENABLED=false
 */
export function isDietaryOperationalEvidenceEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 10A Dietary Asset Operations (Assets / Issues / Work Orders).
 * Set `DIETARY_ASSET_OPERATIONS_ENABLED=true` for Asset Builder, Issue reporting, Work Orders,
 * Supervisor Asset exceptions, and offline Issue commands.
 * Does not enable `OPERATION_ENGINE_ENABLED` — Operations Engine stays off.
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_JOB_FLOW_ENABLED=true
 *   DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
 *   DIETARY_ASSET_OPERATIONS_ENABLED=true
 *   OPERATION_ENGINE_ENABLED=false
 */
export function isDietaryAssetOperationsEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_ASSET_OPERATIONS_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 11A Dietary Department Work Plans.
 * Set `DIETARY_WORK_PLANS_ENABLED=true` for Work Plan Builder, Job Flow Work,
 * Supervisor Work exceptions, one-off Work, and offline Work completion.
 * Does not enable `OPERATION_ENGINE_ENABLED` or `TASK_SYNC_ENABLED`.
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_JOB_FLOW_ENABLED=true
 *   DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
 *   DIETARY_ASSET_OPERATIONS_ENABLED=true
 *   DIETARY_WORK_PLANS_ENABLED=true
 *   OPERATION_ENGINE_ENABLED=false
 *   TASK_SYNC_ENABLED=false
 */
export function isDietaryWorkPlansEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_WORK_PLANS_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 11B EVS Operations (Cycles / Job Flow / Evidence / Work / thin Assets).
 * Set `EVS_OPERATIONS_ENABLED=true` for local / test EVS Department operational surfaces.
 * Does not enable `OPERATION_ENGINE_ENABLED` or `TASK_SYNC_ENABLED`.
 * Dietary remains gated by existing `DIETARY_*` flags independently.
 * Typical local activation:
 *   EVS_OPERATIONS_ENABLED=true
 *   OPERATION_ENGINE_ENABLED=false
 *   TASK_SYNC_ENABLED=false
 */
export function isEvsOperationsEnabled(): boolean {
  return parseEnvFlag(process.env.EVS_OPERATIONS_ENABLED, false);
}
