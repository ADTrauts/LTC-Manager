/**
 * Wave 15E — Projection Shadow types.
 *
 * Comparable eligibility views only. Shadow never mutates Projection or legacy.
 */

export type ShadowSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type ShadowMismatchKind =
  | "MISSING_LOCATION"
  | "EXTRA_LOCATION"
  | "MISSING_ROOM"
  | "EXTRA_ROOM"
  | "AREA_MISMATCH"
  | "EXPERIENCE_MISMATCH"
  | "ORDERING_MISMATCH"
  | "NAVIGATION_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "PERMISSION_MISMATCH"
  | "SCOPE_MISMATCH"
  | "PLANT_MISMATCH"
  | "DEPARTMENT_LENS_MISMATCH"
  | "REVISION_MISMATCH"
  | "UNKNOWN_DIFFERENCE";

export type ShadowMismatch = {
  kind: ShadowMismatchKind;
  severity: ShadowSeverity;
  path: string;
  message: string;
  legacyValue?: string;
  projectionValue?: string;
};

export type ShadowAreaView = {
  areaKey: string;
  order: number;
  experienceKeys: readonly string[];
};

export type ShadowExperienceView = {
  experienceKey: string;
  areaKey: string;
  order: number;
  locationIds: readonly string[];
  allowedActionKeys: readonly string[];
  navigationHandles: readonly string[];
  workspaceHandles: readonly string[];
};

export type ShadowQueryScopeView = {
  experienceKey: string;
  unitIds: readonly string[];
  spaceIds: readonly string[];
  domains: readonly string[];
};

/**
 * Normalized eligibility surface compared by Shadow Mode.
 * Both legacy adapters and Projection adapters emit this shape.
 */
export type ShadowEligibilityView = {
  source: "LEGACY" | "PROJECTION";
  facilityId: string;
  lensKey: string;
  departmentKeys: readonly string[];
  locationIds: readonly string[];
  actionableLocationIds: readonly string[];
  roomIds: readonly string[];
  areas: readonly ShadowAreaView[];
  experiences: readonly ShadowExperienceView[];
  queryScopes: readonly ShadowQueryScopeView[];
  plantApplied: boolean;
  plantCoveredLocationIds: readonly string[];
  revisionTokens: readonly string[];
};

export type ShadowParityMetrics = {
  legacyDurationMs: number;
  projectionDurationMs: number;
  comparisonDurationMs: number;
  totalDurationMs: number;
  legacyViewBytesEstimate: number;
  projectionSnapshotBytesEstimate: number;
  comparedSlotCount: number;
  matchedSlotCount: number;
  mismatchCount: number;
  parityPercent: number;
  bySeverity: Readonly<Record<ShadowSeverity, number>>;
  byKind: Readonly<Record<string, number>>;
};

export type ShadowParityReport = {
  ok: boolean;
  metrics: ShadowParityMetrics;
  mismatches: readonly ShadowMismatch[];
  legacy: ShadowEligibilityView;
  projection: ShadowEligibilityView;
};
