/**
 * Projection Runtime Foundation — public domain barrel.
 *
 * Wave 15B exports immutable domain models, fixtures, and validation only.
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

