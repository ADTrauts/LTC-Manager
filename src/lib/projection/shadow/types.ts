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

/**
 * Normalized location eligibility compared by Shadow Mode.
 */
export type ShadowEligibilityView = {
  source: "LEGACY" | "PROJECTION";
  facilityId: string;
  lensKey: string;
  departmentKeys: readonly string[];
  locationIds: readonly string[];
  actionableLocationIds: readonly string[];
  roomIds: readonly string[];
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
