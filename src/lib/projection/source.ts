/**
 * Fully loaded, normalized input contract for the pure Projection pipeline.
 *
 * Repository/service adapters will populate this shape in later waves.
 * Wave 15C performs no I/O.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type {
  ProjectionLocationReference,
  ProjectionRequest,
  ProjectionRevision,
} from "./types";

export type RoomContext = {
  id: string;
  facilityId: string;
  isActive: boolean;
  /** null = builder-only undesignated staging. */
  unitId: string | null;
  parentHierarchyRole:
    | "BUILDING"
    | "FLOOR"
    | "NEIGHBORHOOD"
    | "LEGACY_LOCATION"
    | "STAGED"
    | null;
  assignedDepartmentIds: readonly string[];
};

export type ProjectionSourceFacility = {
  id: string;
  label: string;
};

export type ProjectionSourceLocation = {
  id: string;
  reference: ProjectionLocationReference;
  parentId: string | null;
  label: string;
  isActive: boolean;
  /** False for staged/undesignated builder-only nodes. */
  isPlaced: boolean;
  /**
   * Facility Builder display order (units) / sortOrder (spaces).
   * Used to preserve physical hierarchy ordering in Run trees.
   */
  displayOrder?: number;
};

export type ProjectionSourceRoom = {
  locationId: string;
  context: RoomContext;
};

export type ProjectionSourceDepartment = {
  id: string;
  key: OperationalDepartmentKey;
  label: string;
  isActive: boolean;
  /**
   * Explicit Facility Builder room assignments (UnitSpaceResponsibility).
   */
  assignedRoomIds: readonly string[];
  /**
   * Explicit Facility Builder neighborhood/unit assignments
   * (UnitDepartmentResponsibility). Floors remain structural.
   */
  assignedUnitIds: readonly string[];
};

export type ProjectionSourcePolicy = {
  kind: "PLANT_FACILITY_WIDE_MAINTENANCE";
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  createsRoomAssignments: false;
  /** Empty/undefined means every active, placed room. */
  coveredRoomIds?: readonly string[];
  excludedRoomIds?: readonly string[];
};

export type ProjectionSource = {
  request: ProjectionRequest;
  facility: ProjectionSourceFacility;
  locations: readonly ProjectionSourceLocation[];
  rooms: readonly ProjectionSourceRoom[];
  departments: readonly ProjectionSourceDepartment[];
  policies: readonly ProjectionSourcePolicy[];
  revision: ProjectionRevision;
  /** Deterministic timestamp supplied by the caller; pipeline never reads clock. */
  resolvedAt: string;
};

