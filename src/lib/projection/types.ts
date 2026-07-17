/**
 * Projection Runtime Foundation — Wave 15B domain types.
 *
 * This package defines immutable runtime objects only. It does not execute a
 * projection pipeline, query a database, render UI, cache, or build overlays.
 */

import type {
  ExperienceActionDeclaration,
  ExperienceContracts,
  HomeContributionContract,
  NavigationContributionEntry,
} from "@/lib/experiences";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { ExperienceConfiguration } from "@/lib/department-administration";

export type ProjectionPurpose =
  | "SIDEBAR"
  | "LOCATIONS"
  | "WORKSPACE"
  | "UNIT_WORKSPACE"
  | "TODAYS_WORK"
  | "OPERATIONS_CENTER"
  | "BUSINESS_WORKSPACE"
  | "KNOWLEDGE"
  | "ASSIGNMENTS"
  | "ASSETS"
  | "REPAIRS"
  | "AI_CONTEXT"
  | "DEEP_LINK";

export type ProjectionPrincipalKind = "USER" | "EMPLOYEE";

export type ProjectionLens =
  | {
      mode: "DEPARTMENT";
      departmentId: string;
      departmentKey: OperationalDepartmentKey;
    }
  | {
      mode: "FACILITY";
    };

export type ProjectionAccessClass = {
  key: string;
  principalKind: ProjectionPrincipalKind;
  role: string;
  allowedUnitIds: readonly string[] | "ALL";
  lockedUnitId?: string;
  permissionKeys: readonly string[];
};

export type ProjectionLocationReference =
  | {
      kind: "FACILITY";
      facilityId: string;
    }
  | {
      kind: "UNIT";
      facilityId: string;
      unitId: string;
      hierarchyRole: "FLOOR" | "NEIGHBORHOOD" | "LEGACY";
    }
  | {
      kind: "SPACE";
      facilityId: string;
      unitId: string;
      spaceId: string;
      roomRole?: string;
    };

export type ProjectionLocationPresentation = "ACTIONABLE" | "STRUCTURAL";

export type ProjectionLocationNode = {
  id: string;
  reference: ProjectionLocationReference;
  label: string;
  presentation: ProjectionLocationPresentation;
  ancestry: readonly string[];
  experienceKeys: readonly string[];
  children: readonly ProjectionLocationNode[];
};

export type ProjectionRevision = {
  hierarchyRevision: string;
  assignmentRevision: string;
  profileRevision: string;
  bindingRevision: string;
  policyRevision: string;
  experienceRegistryVersion: number;
  accessClassRevision: string;
};

export type ProjectionIdentity = {
  key: string;
  facilityId: string;
  lensKey: string;
  purpose: ProjectionPurpose;
  revision: ProjectionRevision;
  focus?: ProjectionLocationReference;
};

export type ProjectionRequest = {
  facilityId: string;
  lens: ProjectionLens;
  accessClass: ProjectionAccessClass;
  purpose: ProjectionPurpose;
  focus?: ProjectionLocationReference;
  operationContextKey?: string;
  asOf?: string;
};

export type ProjectionContext = {
  identity: ProjectionIdentity;
  request: ProjectionRequest;
  builtAt: string;
};

export type ProjectionExperienceReference = {
  experienceKey: string;
  areaKey: string;
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  locationIds: readonly string[];
  relatedExperienceKeys: readonly string[];
  dependencyExperienceKeys: readonly string[];
};

/**
 * Projection references Experience contracts from the registry. It never owns,
 * clones, or redefines the contract schema.
 */
export type ProjectionContracts = {
  experienceKey: string;
  source: "EXPERIENCE_REGISTRY";
  registryVersion: number;
  contracts: ExperienceContracts;
};

export type ProjectionWorkspaceContribution = {
  default: HomeContributionContract;
  unitWorkspace: HomeContributionContract;
  businessWorkspace: HomeContributionContract;
  operationsCenter: HomeContributionContract;
};

export type ProjectionNavigationContribution = {
  entries: readonly NavigationContributionEntry[];
};

export type ProjectionPermissionContribution = {
  readKeys: readonly string[];
  actionPermissionKeys: readonly string[];
  allowedActionKeys: readonly string[];
};

export type ProjectionQueryScope = {
  id: string;
  experienceKey: string;
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  domains: readonly string[];
  grain: "ROOM" | "UNIT" | "DEPARTMENT" | "FACILITY";
  unitIds: readonly string[];
  spaceIds: readonly string[];
  rules: readonly string[];
};

export type ProjectionQueryScopes = {
  byExperience: Readonly<Record<string, ProjectionQueryScope>>;
  byDomain: Readonly<Record<string, readonly string[]>>;
};

export type ProjectionDescriptor = {
  id: string;
  kind:
    | "AREA"
    | "EXPERIENCE"
    | "LOCATION"
    | "QUERY_SCOPE"
    | "NAVIGATION"
    | "WORKSPACE"
    | "PERMISSION";
  sourceId: string;
  label: string;
};

export type ProjectionExperience = {
  id: string;
  reference: ProjectionExperienceReference;
  label: string;
  order: number;
  configurationByLocation: Readonly<
    Record<string, ExperienceConfiguration | null>
  >;
  archetypeByLocation: Readonly<
    Record<
      string,
      { id: string; key: string; name: string } | null
    >
  >;
  contracts: ProjectionContracts;
  queryScopeId: string;
  workspace: ProjectionWorkspaceContribution;
  navigation: ProjectionNavigationContribution;
  permissions: ProjectionPermissionContribution;
  actions: readonly ExperienceActionDeclaration[];
  descriptors: readonly ProjectionDescriptor[];
  provenance: readonly ProjectionExperienceProvenance[];
};

export type ProjectionExperienceProvenance =
  | "PROFILE"
  | "ARCHETYPE"
  | "ROOM_EXCEPTION"
  | "PLANT_POLICY_DEFAULT";

export type ProjectionArea = {
  id: string;
  areaKey: string;
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  label: string;
  order: number;
  experienceIds: readonly string[];
  descriptors: readonly ProjectionDescriptor[];
};

export type ProjectionPlantPolicy = {
  applied: boolean;
  kind?: "PLANT_FACILITY_WIDE_MAINTENANCE";
  createsRoomAssignments: false;
  defaultArchetypeKey?: string;
  coveredLocationIds: readonly string[];
};

export type ProjectionDiagnosticSeverity = "INFO" | "WARNING" | "ERROR";

export type ProjectionDiagnosticCode =
  | "DUPLICATE_ID"
  | "MISSING_IDENTITY"
  | "UNKNOWN_EXPERIENCE_KEY"
  | "INVALID_EXPERIENCE_CONTRACT"
  | "INVALID_LOCATION_REFERENCE"
  | "INVALID_AREA_ORDERING"
  | "INVALID_DESCRIPTOR"
  | "INVALID_ARCHETYPE_REFERENCE"
  | "ORPHAN_BINDING"
  | "ROOM_UNMAPPED"
  | "ROOM_EXCEPTION_INVALID"
  | "MISSING_ACTIVE_PROFILE"
  | "INACTIVE_DEPARTMENT"
  | "UNKNOWN_DEPARTMENT"
  | "PERMISSION_DENIED"
  | "PERMISSION_LEAKAGE"
  | "SOURCE_INVALID"
  | "MISSING_QUERY_SCOPE"
  | "MISSING_CONTRACT_REFERENCE"
  | "AREA_EXPERIENCE_MISMATCH"
  | "CIRCULAR_EXPERIENCE_DEPENDENCY"
  | "PLANT_POLICY_ASSIGNMENT_COPY"
  | "FACILITY_OVERVIEW_FLATTENED"
  | "PROJECTION_INVARIANT";

export type ProjectionDiagnostic = {
  code: ProjectionDiagnosticCode;
  severity: ProjectionDiagnosticSeverity;
  message: string;
  path?: string;
};

export type ProjectionDiagnostics = {
  issues: readonly ProjectionDiagnostic[];
};

export type ProjectionMetadata = {
  architectureWave: "15B";
  registryVersion: number;
  fixtureName?: string;
  notes?: readonly string[];
};

export type ProjectionSnapshot = {
  context: ProjectionContext;
  metadata: ProjectionMetadata;
  areas: readonly ProjectionArea[];
  experiences: readonly ProjectionExperience[];
  locations: {
    roots: readonly ProjectionLocationNode[];
    actionableIds: readonly string[];
    byId: Readonly<Record<string, ProjectionLocationNode>>;
  };
  queryScopes: ProjectionQueryScopes;
  descriptors: readonly ProjectionDescriptor[];
  diagnostics: ProjectionDiagnostics;
  plantPolicy?: ProjectionPlantPolicy;
  facilityOverview?: {
    departmentSnapshots: readonly ProjectionSnapshot[];
  };
};

