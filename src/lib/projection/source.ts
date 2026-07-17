/**
 * Fully loaded, normalized input contract for the pure Projection pipeline.
 *
 * Repository/service adapters will populate this shape in later waves.
 * Wave 15C performs no I/O.
 */

import type {
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionSnapshot,
} from "@/lib/department-administration";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type {
  ProjectionLocationReference,
  ProjectionRequest,
  ProjectionRevision,
} from "./types";

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
  activeProfile: ProfileSnapshot | null;
  /** Explicit Facility Builder room assignments only. */
  assignedRoomIds: readonly string[];
  archetypeBindings: readonly RoomArchetypeBindingSnapshot[];
  roomExceptions: readonly RoomExceptionSnapshot[];
};

export type ProjectionSourcePolicy = {
  kind: "PLANT_FACILITY_WIDE_MAINTENANCE";
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  defaultArchetypeKey: string;
  directBindingsTakePrecedence: true;
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

