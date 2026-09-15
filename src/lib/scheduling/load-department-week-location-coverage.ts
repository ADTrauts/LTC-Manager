/**
 * Bounded Department-week location coverage loader (Location View).
 * Hierarchy loaded once; OA + shifts loaded for the whole week range.
 */

import type { AppJwtPayload } from "@/lib/auth";
import type { HierarchyWalkUnit } from "@/lib/department-administration/department-locations";
import { collectDepartmentActionableLocations } from "@/lib/department-administration/department-locations";
import { loadFacilityHierarchy } from "@/lib/facility-builder/load-facility-hierarchy";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import {
  resolveViewerTeamScopes,
  type ViewerTeamScope,
} from "@/lib/todays-work/viewer-team-scope";

import {
  buildDepartmentWeekLocationCoverageProjection,
  type DepartmentWeekLocationCoverageProjection,
} from "./department-week-location-coverage-projection";
import { buildScheduleWeekRange, type ScheduleWeekRange } from "./schedule-week-range";
import {
  filterEligibleRoomsByViewerScope,
  type EligibleFloorRoom,
  type EligibleNeighborhoodRoom,
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
        "Your Team does not have configured Rooms yet, so location coverage is hidden.",
    };
  }
  return {
    allowedRoomIds: new Set(scope.roomIds),
    locationScopeNote: null,
  };
}

function serviceDateKeyFromUtcMidnight(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekWindow(week: ScheduleWeekRange): { start: Date; end: Date } {
  const start = facilityLocalDateToServiceDate(week.weekStart);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

export async function loadDepartmentWeekLocationCoverage(input: {
  facilityId: string;
  departmentId: string;
  anchorDate: string;
  session?: AppJwtPayload | null;
}): Promise<DepartmentWeekLocationCoverageProjection> {
  const week = buildScheduleWeekRange({ anchorDate: input.anchorDate });
  const { start, end } = weekWindow(week);
  const oaStart = facilityLocalDateToServiceDate(week.weekStart);
  const oaEnd = new Date(oaStart);
  oaEnd.setUTCDate(oaEnd.getUTCDate() + 7);

  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true, name: true },
  });
  if (!department) {
    throw new Error("Department not found.");
  }

  const oaEnabled = isOperationalAssignmentsEnabled();

  const [hierarchy, oaRows, scheduleEntries, teamScopes] = await Promise.all([
    loadFacilityHierarchy(input.facilityId),
    oaEnabled
      ? prisma.operationalAssignment.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: input.departmentId,
            serviceDate: { gte: oaStart, lt: oaEnd },
            status: { in: ["PLANNED", "ACTIVE"] },
          },
          select: {
            employeeId: true,
            serviceDate: true,
            employee: { select: { firstName: true, lastName: true } },
            locations: { select: { unitSpaceId: true } },
          },
        })
      : Promise.resolve([]),
    prisma.scheduleEntry.findMany({
      where: {
        date: { gte: start, lt: end },
        employee: { facilityId: input.facilityId },
        OR: [
          { departmentId: input.departmentId },
          {
            departmentId: null,
            employee: {
              OR: [
                { primaryDepartmentId: input.departmentId },
                { employeeDepartments: { some: { departmentId: input.departmentId } } },
              ],
            },
          },
        ],
      },
      select: { employeeId: true, date: true },
    }),
    input.session
      ? resolveViewerTeamScopes({
          session: input.session,
          facilityId: input.facilityId,
          departments: [{ id: department.id, label: department.name }],
        })
      : Promise.resolve(new Map<string, ViewerTeamScope>()),
  ]);

  const teamScope = teamScopes.get(department.id) ?? null;
  const { allowedRoomIds, locationScopeNote } = allowedRoomsFromTeamScope(teamScope);
  const units = toHierarchyWalkUnits(hierarchy.units);

  const eligibleFloorRooms = filterEligibleRoomsByViewerScope(
    collectEligibleFloorRooms({ departmentId: input.departmentId, units }),
    allowedRoomIds,
  );
  const eligibleNeighborhoodRooms = filterEligibleRoomsByViewerScope(
    collectEligibleNeighborhoodRooms({ departmentId: input.departmentId, units }),
    allowedRoomIds,
  );

  const shiftPresence = new Set(
    scheduleEntries.map(
      (s) => `${s.employeeId}|${serviceDateKeyFromUtcMidnight(s.date)}`,
    ),
  );

  const assignments = oaEnabled
    ? oaRows.map((row) => {
        const serviceDate = serviceDateKeyFromUtcMidnight(row.serviceDate);
        return {
          employeeId: row.employeeId,
          employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
          serviceDate,
          unitSpaceIds: row.locations.map((l) => l.unitSpaceId),
          employeeHasShiftThatDay: shiftPresence.has(`${row.employeeId}|${serviceDate}`),
        };
      })
    : [];

  return buildDepartmentWeekLocationCoverageProjection({
    facilityId: input.facilityId,
    departmentId: department.id,
    departmentName: department.name,
    week,
    eligibleFloorRooms,
    eligibleNeighborhoodRooms,
    assignments,
    locationScopeNote,
  });
}
