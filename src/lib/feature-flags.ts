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

/** Defaults to disabled — Wave 15E Projection Shadow Mode (parity diagnostics only). */
export function isProjectionShadowEnabled(): boolean {
  return parseEnvFlag(process.env.PROJECTION_SHADOW_ENABLED, false);
}

/**
 * Canonical Logs — platform Catalog + facility Attachment Record engine.
 * The code default stays false. Shared test environments set the variable true.
 *
 * Flag OFF:
 *   Legacy `/logs` remains the live path. A stored CANONICAL row does not
 *   activate while this gate is off, and the stored row is not rewritten.
 *
 * Flag ON:
 *   A Department with no rollout row uses the forward engine, including Plant.
 *   An explicit rollout row still wins. A future start date stays on the previous engine until that date.
 *   There is no dual-write and no silent fallback into LogSubmission.
 *
 * Shared test environments set this true (LEG-01). The code default stays false.
 * LEG-03 removes the switch.
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

/**
 * Defaults to disabled — Contracted Department Authority (CDA-D12). While off,
 * `resolveDepartmentAccess` answers MANAGE everywhere and today's module rules
 * alone decide. Switching it on needs CDA-07 production approval.
 */
export function isContractedDepartmentAuthorityEnabled(): boolean {
  return parseEnvFlag(process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED, false);
}

