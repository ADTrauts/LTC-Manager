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
 * Defaults to disabled — Wave 15I Today's Work Projection cutover.
 * Set `PROJECTION_TODAYS_WORK_ENABLED=true` to assemble walk/coverage/handoffs
 * within Projection eligibility only. When off, legacy Today's Work remains exclusive.
 */
export function isProjectionTodaysWorkEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_TODAYS_WORK_ENABLED, false);
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
 * Defaults to disabled — Phase 9A Dietary Operational Cycles.
 * Set `DIETARY_OPERATIONAL_CYCLES_ENABLED=true` for Department Builder / runtime cycle context.
 * Operations Engine is deleted. Do not add it back.
 */
export function isDietaryOperationalCyclesEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_OPERATIONAL_CYCLES_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 9B Dietary Employee Job Flow & Supervisor Operations Board.
 * Set `DIETARY_JOB_FLOW_ENABLED=true` for derived Job Flow / Operations Board projections.
 * Operations Engine is deleted. Do not add it back.
 * Job Flow is a derived Runtime projection (no JobFlowRecord / no migration).
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_JOB_FLOW_ENABLED=true
 */
export function isDietaryJobFlowEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_JOB_FLOW_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 9C Dietary Operational Evidence (Templates / Runtime / Log Book).
 * Set `DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true` for Builder, derived requirements, and records.
 * Operations Engine is deleted. Do not add it back.
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_JOB_FLOW_ENABLED=true
 *   DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
 */
export function isDietaryOperationalEvidenceEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_OPERATIONAL_EVIDENCE_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 10A Dietary Asset Operations (Assets / Issues / Work Orders).
 * Set `DIETARY_ASSET_OPERATIONS_ENABLED=true` for Asset Builder, Issue reporting, Work Orders,
 * Supervisor Asset exceptions, and offline Issue commands.
 * Operations Engine is deleted. Do not add it back.
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_JOB_FLOW_ENABLED=true
 *   DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
 *   DIETARY_ASSET_OPERATIONS_ENABLED=true
 */
export function isDietaryAssetOperationsEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_ASSET_OPERATIONS_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 11A Dietary Department Work Plans.
 * Set `DIETARY_WORK_PLANS_ENABLED=true` for Work Plan Builder, Job Flow Work,
 * Supervisor Work exceptions, one-off Work, and offline Work completion.
 * Operations Engine is deleted. Does not enable `TASK_SYNC_ENABLED`.
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_JOB_FLOW_ENABLED=true
 *   DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
 *   DIETARY_ASSET_OPERATIONS_ENABLED=true
 *   DIETARY_WORK_PLANS_ENABLED=true
 *   TASK_SYNC_ENABLED=false
 */
export function isDietaryWorkPlansEnabled(): boolean {
  return parseEnvFlag(process.env.DIETARY_WORK_PLANS_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 11B EVS Operations (Cycles / Job Flow / Evidence / Work / thin Assets).
 * Set `EVS_OPERATIONS_ENABLED=true` for local / test EVS Department operational surfaces.
 * Operations Engine is deleted. Does not enable `TASK_SYNC_ENABLED`.
 * Dietary remains gated by existing `DIETARY_*` flags independently.
 * Typical local activation:
 *   EVS_OPERATIONS_ENABLED=true
 *   TASK_SYNC_ENABLED=false
 */
export function isEvsOperationsEnabled(): boolean {
  return parseEnvFlag(process.env.EVS_OPERATIONS_ENABLED, false);
}

/**
 * Defaults to disabled — Phase 12A Plant Operations (Request routing / triage / WO Runtime).
 * Set `PLANT_OPERATIONS_ENABLED=true` for local / test Plant Department operational surfaces.
 * Operations Engine is deleted. Does not enable `TASK_SYNC_ENABLED`.
 * Dietary and EVS remain gated by their own flags independently.
 * Typical local activation:
 *   PLANT_OPERATIONS_ENABLED=true
 *   TASK_SYNC_ENABLED=false
 */
export function isPlantOperationsEnabled(): boolean {
  return parseEnvFlag(process.env.PLANT_OPERATIONS_ENABLED, false);
}

/**
 * Defaults to disabled — Canonical Logs (platform Catalog + facility Attachment).
 * Enable only in a controlled local/dev or named test facility context:
 *   CANONICAL_LOGS_ENABLED=true
 * Do not default-on for production. Legacy `/logs` remains independent.
 * Typical local activation:
 *   DIETARY_OPERATIONAL_CYCLES_ENABLED=true
 *   DIETARY_OPERATIONAL_EVIDENCE_ENABLED=true
 *   CANONICAL_LOGS_ENABLED=true
 */
export function isCanonicalLogsEnabled(): boolean {
  return parseEnvFlag(process.env.CANONICAL_LOGS_ENABLED, false);
}

/**
 * Defaults to disabled — department purchase licenses are stored but not enforced.
 * Set `BILLING_ENTITLEMENTS_ENABLED=true` only after Stripe subscriptions and
 * grandfathering for existing facilities are certified. Visibility flags are
 * not licenses (ADL-013).
 */
export function isBillingEntitlementsEnabled(): boolean {
  return parseEnvFlag(process.env.BILLING_ENTITLEMENTS_ENABLED, false);
}

