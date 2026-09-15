/**
 * Load Supervisor Daily Coverage for a Department + service date.
 * Reuses department-day schedule + OA locations + facility hierarchy.
 * Applies Team viewer scope to location aggregations (not employee presence).
 */

import type { AppJwtPayload } from "@/lib/auth";
import type { HierarchyWalkUnit } from "@/lib/department-administration/department-locations";
import { collectDepartmentActionableLocations } from "@/lib/department-administration/department-locations";
import { loadFacilityHierarchy } from "@/lib/facility-builder/load-facility-hierarchy";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import {
  facilityLocalDateToServiceDate,
  getFacilityLocalParts,
  loadFacilityTimezone,
  resolveFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import {
  resolveViewerTeamScopes,
  type ViewerTeamScope,
} from "@/lib/todays-work/viewer-team-scope";

import { loadDepartmentDaySchedule } from "./load-department-day-schedule";
import {
  aggregateFloorCoverage,
  aggregateNeighborhoodCoverage,
  buildSupervisorCoverageEmployeeRow,
  buildSupervisorDailyCoverageProjection,
  filterEligibleRoomsByViewerScope,
  roomResponsibilitiesFromAssignments,
  type EligibleFloorRoom,
  type EligibleNeighborhoodRoom,
  type SupervisorDailyCoverageProjection,
} from "./supervisor-daily-coverage";

function toHierarchyWalkUnits(
  units: Awaited<ReturnType<typeof loadFacilityHierarchy>>["units"],
): HierarchyWalkUnit[] {
  return units as unknown as HierarchyWalkUnit[];
}

function collectEligibleFloorRooms(input: {
  departmentId: string;
  units: readonly HierarchyWalkUnit[];
}): EligibleFloorRoom[] {
  const out: EligibleFloorRoom[] = [];

  const visitFloors = (nodes: readonly HierarchyWalkUnit[]) => {
    for (const node of nodes) {
      if (node.hierarchyRole === "FLOOR") {
        const actionable = collectDepartmentActionableLocations({
          departmentId: input.departmentId,
          units: [node],
        });
        for (const loc of actionable) {
          if (loc.kind !== "room" || !loc.isActive) continue;
          out.push({
            floorUnitId: node.id,
            floorName: node.name,
            unitSpaceId: loc.id,
            roomName: loc.displayName ?? loc.name,
          });
        }
      } else {
        visitFloors(node.childUnits);
      }
    }
  };

  visitFloors(input.units);
  const seen = new Set<string>();
  return out.filter((r) => {
    if (seen.has(r.unitSpaceId)) return false;
    seen.add(r.unitSpaceId);
    return true;
  });
}

function collectEligibleNeighborhoodRooms(input: {
  departmentId: string;
  units: readonly HierarchyWalkUnit[];
}): EligibleNeighborhoodRoom[] {
  const out: EligibleNeighborhoodRoom[] = [];

  const visit = (nodes: readonly HierarchyWalkUnit[]) => {
    for (const node of nodes) {
      if (node.hierarchyRole === "NEIGHBORHOOD") {
        const actionable = collectDepartmentActionableLocations({
          departmentId: input.departmentId,
          units: [node],
        });
        for (const loc of actionable) {
          if (loc.kind !== "room" || !loc.isActive) continue;
          out.push({
            neighborhoodUnitId: node.id,
            neighborhoodName: node.name,
            unitSpaceId: loc.id,
            roomName: loc.displayName ?? loc.name,
          });
        }
      }
      visit(node.childUnits);
    }
  };

  visit(input.units);
  const seen = new Set<string>();
  return out.filter((r) => {
    if (seen.has(r.unitSpaceId)) return false;
    seen.add(r.unitSpaceId);
    return true;
  });
}

function allowedRoomsFromTeamScope(scope: ViewerTeamScope | null): {
  allowedRoomIds: ReadonlySet<string> | null;
  locationScopeNote: string | null;
} {
  if (!scope || scope.mode === "DEPARTMENT_WIDE") {
    return { allowedRoomIds: null, locationScopeNote: null };
  }
  if (scope.mode === "TEAM_WITHOUT_LOCATIONS") {
    return {
      allowedRoomIds: new Set(),
      locationScopeNote:
        "Your Team does not have configured Rooms yet, so location coverage is hidden. Staff presence still shows below.",
    };
  }
  return {
    allowedRoomIds: new Set(scope.roomIds),
    locationScopeNote: null,
  };
}

export async function loadSupervisorDailyCoverage(input: {
  facilityId: string;
  departmentId: string;
  serviceDate: string;
  session?: AppJwtPayload | null;
  now?: Date;
}): Promise<SupervisorDailyCoverageProjection> {
  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const parts = getFacilityLocalParts(now, resolveFacilityTimezone(timezone));
  const nowMinutes = parts.hour * 60 + parts.minute;

  const schedule = await loadDepartmentDaySchedule({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDate: input.serviceDate,
  });

  const oaEnabled = isOperationalAssignmentsEnabled();
  const oaServiceDate = facilityLocalDateToServiceDate(input.serviceDate);

  const [hierarchy, oaRows, teamScopes] = await Promise.all([
    loadFacilityHierarchy(input.facilityId),
    oaEnabled
      ? prisma.operationalAssignment.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: input.departmentId,
            serviceDate: oaServiceDate,
            status: { in: ["PLANNED", "ACTIVE"] },
          },
          select: {
            employeeId: true,
            employee: { select: { firstName: true, lastName: true } },
            locations: { select: { unitSpaceId: true, labelSnapshot: true } },
          },
        })
      : Promise.resolve([]),
    input.session
      ? resolveViewerTeamScopes({
          session: input.session,
          facilityId: input.facilityId,
          departments: [{ id: schedule.departmentId, label: schedule.departmentName }],
        })
      : Promise.resolve(new Map<string, ViewerTeamScope>()),
  ]);

  const teamScope = teamScopes.get(schedule.departmentId) ?? null;
  const { allowedRoomIds, locationScopeNote } = allowedRoomsFromTeamScope(teamScope);

  const units = toHierarchyWalkUnits(hierarchy.units);
  const eligibleFloorRooms = filterEligibleRoomsByViewerScope(
    collectEligibleFloorRooms({
      departmentId: input.departmentId,
      units,
    }),
    allowedRoomIds,
  );
  const eligibleNeighborhoodRooms = filterEligibleRoomsByViewerScope(
    collectEligibleNeighborhoodRooms({
      departmentId: input.departmentId,
      units,
    }),
    allowedRoomIds,
  );

  const roomResponsibilities = roomResponsibilitiesFromAssignments({
    assignments: oaRows.map((row) => ({
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      unitSpaceIds: row.locations.map((l) => l.unitSpaceId),
    })),
  });

  const floors = oaEnabled
    ? aggregateFloorCoverage({ eligibleFloorRooms, roomResponsibilities })
    : [];
  const neighborhoods = oaEnabled
    ? aggregateNeighborhoodCoverage({ eligibleNeighborhoodRooms, roomResponsibilities })
    : [];

  const roomLabelsByEmployee = new Map<string, string[]>();
  for (const row of oaRows) {
    const labels = row.locations.map((l) => l.labelSnapshot?.trim() || l.unitSpaceId);
    roomLabelsByEmployee.set(row.employeeId, labels);
  }

  const employees = schedule.employees.map((row) =>
    buildSupervisorCoverageEmployeeRow({
      employeeId: row.projection.employeeId,
      employeeFirstName: row.projection.employeeFirstName,
      employeeLastName: row.projection.employeeLastName,
      teamDisplayName: row.projection.teamDisplayName,
      jobRoleDisplayName: row.projection.jobRoleDisplayName,
      jobTitleDisplayName: row.jobTitleDisplayName,
      relationship: row.projection.relationship,
      shifts: row.projection.shifts,
      assignmentScopeLabels: row.projection.assignments.map((a) => a.scopeSummaryLabel),
      assignmentRoomLabels: roomLabelsByEmployee.get(row.projection.employeeId) ?? [],
      serviceDate: input.serviceDate,
      nowMinutesFromMidnight: nowMinutes,
    }),
  );

  return buildSupervisorDailyCoverageProjection({
    serviceDate: input.serviceDate,
    departmentId: schedule.departmentId,
    departmentName: schedule.departmentName,
    employees,
    floors,
    neighborhoods,
    locationScopeNote,
  });
}
