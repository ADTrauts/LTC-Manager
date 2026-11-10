/**
 * Projection Runtime Foundation — public domain barrel.
 *
 * Wave 15B domain, Wave 15C pure pipeline, Wave 15D source adapter + runtime,
 * Wave 15E shadow parity.
 */

export type {
  ProjectionAccessClass,
  ProjectionContext,
  ProjectionDescriptor,
  ProjectionDiagnostic,
  ProjectionDiagnosticCode,
  ProjectionDiagnosticSeverity,
  ProjectionDiagnostics,
  ProjectionIdentity,
  ProjectionLens,
  ProjectionLocationNode,
  ProjectionLocationPresentation,
  ProjectionLocationReference,
  ProjectionMetadata,
  ProjectionPlantPolicy,
  ProjectionPrincipalKind,
  ProjectionPurpose,
  ProjectionRequest,
  ProjectionRevision,
  ProjectionSnapshot,
} from "./types";

export type {
  ProjectionSource,
  ProjectionSourceDepartment,
  ProjectionSourceFacility,
  ProjectionSourceLocation,
  ProjectionSourcePolicy,
  ProjectionSourceRoom,
} from "./source";

export {
  buildAndPruneProjectionLocations,
  normalizeProjectionHierarchy,
  resolveProjection,
  resolveProjectionLens,
  resolveRoomEligibility,
  resolveUnitEligibility,
  type EligibleProjectionRoom,
  type NormalizedProjectionHierarchy,
  type ResolvedProjectionLens,
} from "./pipeline";

export {
  buildAccessClass,
  buildDepartmentLens,
  buildFacilityLens,
  buildPinAccessPrincipal,
  buildProjectionRequest,
  permissionKeysForRoleBand,
  type BuildProjectionRequestInput,
  type ProjectionRequestPrincipalInput,
} from "./request";

export {
  loadProjectionSource,
  type ProjectionSourceLoadDb,
  type ProjectionSourceLoadResult,
} from "./load-source";

export {
  createProjectionRuntimeMemo,
  projectionRequestMemoKey,
  type ProjectionRuntimeMemo,
} from "./memo";

export {
  createProjectionRuntimeRequestScope,
  formatProjectionRuntimeLog,
  resolveProjectionRuntime,
  type ProjectionRuntimeMetrics,
  type ProjectionRuntimeResult,
  type ResolveProjectionRuntimeOptions,
} from "./runtime";

export {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
  PROJECTION_GOLDEN_FIXTURES,
} from "./fixtures";

export {
  assertProjectionSnapshotValid,
  validateProjectionSnapshot,
  type ProjectionValidationIssue,
} from "./validation";

export {
  adaptLegacyEligibilityToShadowView,
  adaptProjectionSnapshotToShadowView,
  compareProjectionSnapshotsForShadow,
  compareShadowViews,
  formatShadowParityLog,
  runProjectionShadow,
  type CompareProjectionSnapshotsInput,
  type LegacyShadowInput,
  type LegacyShadowRoom,
  type RunProjectionShadowInput,
  type ShadowEligibilityView,
  type ShadowMismatch,
  type ShadowMismatchKind,
  type ShadowParityMetrics,
  type ShadowParityReport,
  type ShadowSeverity,
} from "./shadow";
