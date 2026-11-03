/**
 * Projection Runtime Foundation — Wave 15B domain types.
 *
 * This package defines immutable runtime objects only. It does not execute a
 * projection pipeline, query a database, render UI, cache, or build overlays.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";

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
      hierarchyRole: "BUILDING" | "FLOOR" | "NEIGHBORHOOD" | "LEGACY";
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
  children: readonly ProjectionLocationNode[];
};

export type ProjectionRevision = {
  hierarchyRevision: string;
  assignmentRevision: string;
  policyRevision: string;
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

export type ProjectionDescriptor = {
  id: string;
  kind: "LOCATION";
  sourceId: string;
  label: string;
};

export type ProjectionPlantPolicy = {
  applied: boolean;
  kind?: "PLANT_FACILITY_WIDE_MAINTENANCE";
  createsRoomAssignments: false;
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
  fixtureName?: string;
  notes?: readonly string[];
};

export type ProjectionSnapshot = {
  context: ProjectionContext;
  metadata: ProjectionMetadata;
  locations: {
    roots: readonly ProjectionLocationNode[];
    actionableIds: readonly string[];
    byId: Readonly<Record<string, ProjectionLocationNode>>;
  };
  descriptors: readonly ProjectionDescriptor[];
  diagnostics: ProjectionDiagnostics;
  plantPolicy?: ProjectionPlantPolicy;
  facilityOverview?: {
    departmentSnapshots: readonly ProjectionSnapshot[];
  };
};

