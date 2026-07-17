/**
 * Projection Runtime Foundation — public domain barrel.
 *
 * Wave 15B domain, Wave 15C pure pipeline, Wave 15D source adapter + runtime.
 */

export type {
  ProjectionAccessClass,
  ProjectionArea,
  ProjectionContext,
  ProjectionContracts,
  ProjectionDescriptor,
  ProjectionDiagnostic,
  ProjectionDiagnosticCode,
  ProjectionDiagnosticSeverity,
  ProjectionDiagnostics,
  ProjectionExperience,
  ProjectionExperienceProvenance,
  ProjectionExperienceReference,
  ProjectionIdentity,
  ProjectionLens,
  ProjectionLocationNode,
  ProjectionLocationPresentation,
  ProjectionLocationReference,
  ProjectionMetadata,
  ProjectionNavigationContribution,
  ProjectionPermissionContribution,
  ProjectionPlantPolicy,
  ProjectionPrincipalKind,
  ProjectionPurpose,
  ProjectionQueryScope,
  ProjectionQueryScopes,
  ProjectionRequest,
  ProjectionRevision,
  ProjectionSnapshot,
  ProjectionWorkspaceContribution,
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
  buildProjectionAreas,
  buildProjectionExperiences,
  intersectProjectionPermissions,
  normalizeProjectionHierarchy,
  resolveActiveProjectionProfile,
  resolveProjection,
  resolveProjectionLens,
  resolveProjectionQueryScopes,
  resolveRegistryContracts,
  resolveRoomEligibility,
  resolveRoomProfiles,
  type EligibleProjectionRoom,
  type NormalizedProjectionHierarchy,
  type PermissionedProjectionRoom,
  type ResolvedProjectionLens,
  type ResolvedProjectionRoom,
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
