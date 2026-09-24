/**
 * Pure assigned-SPACE identity. Loaders resolve children; this does not infer from OT.
 */

import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";
import type { RuntimeLocationSpaceRef } from "@/lib/runtime-location-state";

import type { EmployeeRuntimeScopeKind } from "./types";
import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";

export function assignmentScopeKind(
  assignment: JobFlowAssignmentSnapshot | null,
  locationCount: number,
): EmployeeRuntimeScopeKind {
  if (!assignment) return "NONE";
  if (assignment.scopeKind === "SPACES" || locationCount > 0) return "SPACES";
  return "UNIT";
}

export function spaceRefsFromAssignmentLocations(
  locations: readonly ResolvedAssignmentLocation[],
  departmentId: string,
  departmentLabel?: string | null,
): RuntimeLocationSpaceRef[] {
  return locations.map((row) => ({
    spaceId: row.unitSpaceId,
    departmentId,
    departmentLabel: departmentLabel ?? null,
    unitId: row.unitId,
    displayName: row.label,
    floorName: null,
    neighborhoodName: null,
  }));
}

export function assignedSpaceIdSet(
  refs: readonly RuntimeLocationSpaceRef[],
): Set<string> {
  return new Set(refs.map((row) => row.spaceId));
}

export function filterWorkToAssignedSpaces<T extends { spaceId: string | null }>(
  rows: readonly T[],
  assignedSpaceIds: ReadonlySet<string> | null,
): T[] {
  if (assignedSpaceIds == null) return [...rows];
  return rows.filter((row) => row.spaceId == null || assignedSpaceIds.has(row.spaceId));
}
