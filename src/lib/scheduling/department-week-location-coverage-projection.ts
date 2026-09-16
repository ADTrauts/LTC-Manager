/**
 * DepartmentWeekLocationCoverageProjection — derived weekly location coverage.
 *
 * Projects OA (+ hierarchy) across a week. Unit-less Shifts alone do not create coverage.
 * Floor / Neighborhood summaries reuse Room-grain truth via aggregateFloorCoverage helpers.
 */

import type { ScheduleWeekRange } from "./schedule-week-range";
import {
  aggregateFloorCoverage,
  aggregateNeighborhoodCoverage,
  roomResponsibilitiesFromAssignments,
  type EligibleFloorRoom,
  type EligibleNeighborhoodRoom,
  type SupervisorFloorCoverage,
  type SupervisorFloorCoverageStatus,
  type SupervisorNeighborhoodCoverage,
} from "./supervisor-daily-coverage";

export type LocationWeekDayCoverage = {
  serviceDate: string;
  status: SupervisorFloorCoverageStatus;
  eligibleRoomCount: number;
  assignedRoomCount: number;
  assignedEmployeeNames: string[];
  /** Compact cell label for managers. */
  cellLabel: string;
  /** True when any assignee for this location/day has no Shift that day. */
  hasAssignedUnscheduled: boolean;
  assignedUnscheduledNames: string[];
};

export type LocationWeekFloorRow = {
  kind: "floor";
  floorUnitId: string;
  floorName: string;
  days: LocationWeekDayCoverage[];
  rooms: Array<{
    unitSpaceId: string;
    roomName: string;
    days: LocationWeekDayCoverage[];
  }>;
};

export type LocationWeekNeighborhoodRow = {
  kind: "neighborhood";
  neighborhoodUnitId: string;
  neighborhoodName: string;
  days: LocationWeekDayCoverage[];
  rooms: Array<{
    unitSpaceId: string;
    roomName: string;
    days: LocationWeekDayCoverage[];
  }>;
};

export type DepartmentWeekLocationCoverageProjection = {
  facilityId: string;
  departmentId: string;
  departmentName: string;
  week: ScheduleWeekRange;
  floors: LocationWeekFloorRow[];
  neighborhoods: LocationWeekNeighborhoodRow[];
  locationScopeNote: string | null;
  emptyMessage: string | null;
};

export type LocationWeekAssignmentInput = {
  employeeId: string;
  employeeName: string;
  serviceDate: string;
  unitSpaceIds: string[];
  /** True when this employee has at least one Shift on serviceDate. */
  employeeHasShiftThatDay: boolean;
};

function buildDayCoverageFromFloor(floor: SupervisorFloorCoverage, extras: {
  hasAssignedUnscheduled: boolean;
  assignedUnscheduledNames: string[];
  serviceDate: string;
}): LocationWeekDayCoverage {
  let cellLabel: string;
  if (floor.status === "full" && floor.responsibleEmployeeNames.length === 1) {
    cellLabel = floor.responsibleEmployeeNames[0]!;
  } else if (floor.status === "full" && floor.responsibleEmployeeNames.length > 1) {
    cellLabel = `${floor.responsibleEmployeeNames.length} assigned`;
  } else if (floor.status === "partial") {
    cellLabel = `${floor.assignedRoomCount}/${floor.eligibleRoomCount} assigned`;
  } else if (floor.status === "uncovered") {
    cellLabel = "Needs coverage";
  } else {
    cellLabel = "—";
  }

  return {
    serviceDate: extras.serviceDate,
    status: floor.status,
    eligibleRoomCount: floor.eligibleRoomCount,
    assignedRoomCount: floor.assignedRoomCount,
    assignedEmployeeNames: floor.responsibleEmployeeNames,
    cellLabel,
    hasAssignedUnscheduled: extras.hasAssignedUnscheduled,
    assignedUnscheduledNames: extras.assignedUnscheduledNames,
  };
}

function buildRoomDayCoverage(input: {
  serviceDate: string;
  assignedEmployeeNames: string[];
  assignedUnscheduledNames: string[];
}): LocationWeekDayCoverage {
  const assigned = [...new Set(input.assignedEmployeeNames)].sort();
  const status: SupervisorFloorCoverageStatus =
    assigned.length > 0 ? "full" : "uncovered";
  const cellLabel =
    assigned.length === 0
      ? "Needs coverage"
      : assigned.length === 1
        ? assigned[0]!
        : `${assigned.length} assigned`;
  return {
    serviceDate: input.serviceDate,
    status,
    eligibleRoomCount: 1,
    assignedRoomCount: assigned.length > 0 ? 1 : 0,
    assignedEmployeeNames: assigned,
    cellLabel,
    hasAssignedUnscheduled: input.assignedUnscheduledNames.length > 0,
    assignedUnscheduledNames: input.assignedUnscheduledNames,
  };
}

export function buildDepartmentWeekLocationCoverageProjection(input: {
  facilityId: string;
  departmentId: string;
  departmentName: string;
  week: ScheduleWeekRange;
  eligibleFloorRooms: EligibleFloorRoom[];
  eligibleNeighborhoodRooms: EligibleNeighborhoodRoom[];
  assignments: LocationWeekAssignmentInput[];
  locationScopeNote?: string | null;
}): DepartmentWeekLocationCoverageProjection {
  const floors: LocationWeekFloorRow[] = [];
  const floorIds = [...new Set(input.eligibleFloorRooms.map((r) => r.floorUnitId))];

  for (const floorUnitId of floorIds) {
    const floorRooms = input.eligibleFloorRooms.filter((r) => r.floorUnitId === floorUnitId);
    const floorName = floorRooms[0]?.floorName ?? "Floor";
    const days: LocationWeekDayCoverage[] = [];
    const roomsById = new Map<string, { roomName: string; days: LocationWeekDayCoverage[] }>();

    for (const room of floorRooms) {
      roomsById.set(room.unitSpaceId, { roomName: room.roomName, days: [] });
    }

    for (const serviceDate of input.week.days) {
      const dayAssignments = input.assignments.filter((a) => a.serviceDate === serviceDate);
      const roomResponsibilities = roomResponsibilitiesFromAssignments({
        assignments: dayAssignments.map((a) => ({
          employeeName: a.employeeName,
          unitSpaceIds: a.unitSpaceIds,
        })),
      });

      const [aggregated] = aggregateFloorCoverage({
        eligibleFloorRooms: floorRooms,
        roomResponsibilities,
      });

      const unscheduledNames = [
        ...new Set(
          dayAssignments
            .filter((a) => !a.employeeHasShiftThatDay)
            .filter((a) =>
              a.unitSpaceIds.some((id) => floorRooms.some((r) => r.unitSpaceId === id)),
            )
            .map((a) => a.employeeName),
        ),
      ].sort();

      days.push(
        buildDayCoverageFromFloor(
          aggregated ?? {
            floorUnitId,
            floorName,
            status: "unknown",
            eligibleRoomCount: 0,
            assignedRoomCount: 0,
            responsibleEmployeeNames: [],
            summaryLabel: floorName,
            rooms: [],
          },
          {
            serviceDate,
            hasAssignedUnscheduled: unscheduledNames.length > 0,
            assignedUnscheduledNames: unscheduledNames,
          },
        ),
      );

      const assigneesByRoom = new Map(
        roomResponsibilities.map((r) => [r.unitSpaceId, r.employeeNames] as const),
      );
      for (const room of floorRooms) {
        const names = assigneesByRoom.get(room.unitSpaceId) ?? [];
        const roomUnscheduled = [
          ...new Set(
            dayAssignments
              .filter((a) => !a.employeeHasShiftThatDay && a.unitSpaceIds.includes(room.unitSpaceId))
              .map((a) => a.employeeName),
          ),
        ].sort();
        roomsById.get(room.unitSpaceId)!.days.push(
          buildRoomDayCoverage({
            serviceDate,
            assignedEmployeeNames: names,
            assignedUnscheduledNames: roomUnscheduled,
          }),
        );
      }
    }

    floors.push({
      kind: "floor",
      floorUnitId,
      floorName,
      days,
      rooms: [...roomsById.entries()]
        .map(([unitSpaceId, v]) => ({
          unitSpaceId,
          roomName: v.roomName,
          days: v.days,
        }))
        .sort((a, b) => a.roomName.localeCompare(b.roomName)),
    });
  }

  floors.sort((a, b) => a.floorName.localeCompare(b.floorName));

  const neighborhoods: LocationWeekNeighborhoodRow[] = [];
  const neighborhoodIds = [
    ...new Set(input.eligibleNeighborhoodRooms.map((r) => r.neighborhoodUnitId)),
  ];

  for (const neighborhoodUnitId of neighborhoodIds) {
    const nRooms = input.eligibleNeighborhoodRooms.filter(
      (r) => r.neighborhoodUnitId === neighborhoodUnitId,
    );
    const neighborhoodName = nRooms[0]?.neighborhoodName ?? "Neighborhood";
    const days: LocationWeekDayCoverage[] = [];
    const roomsById = new Map<string, { roomName: string; days: LocationWeekDayCoverage[] }>();
    for (const room of nRooms) {
      roomsById.set(room.unitSpaceId, { roomName: room.roomName, days: [] });
    }

    for (const serviceDate of input.week.days) {
      const dayAssignments = input.assignments.filter((a) => a.serviceDate === serviceDate);
      const roomResponsibilities = roomResponsibilitiesFromAssignments({
        assignments: dayAssignments.map((a) => ({
          employeeName: a.employeeName,
          unitSpaceIds: a.unitSpaceIds,
        })),
      });
      const [aggregated] = aggregateNeighborhoodCoverage({
        eligibleNeighborhoodRooms: nRooms,
        roomResponsibilities,
      });

      const unscheduledNames = [
        ...new Set(
          dayAssignments
            .filter((a) => !a.employeeHasShiftThatDay)
            .filter((a) => a.unitSpaceIds.some((id) => nRooms.some((r) => r.unitSpaceId === id)))
            .map((a) => a.employeeName),
        ),
      ].sort();

      const neighborhoodAsFloor: SupervisorFloorCoverage = {
        floorUnitId: neighborhoodUnitId,
        floorName: neighborhoodName,
        status: aggregated?.status ?? "unknown",
        eligibleRoomCount: aggregated?.eligibleRoomCount ?? 0,
        assignedRoomCount: aggregated?.assignedRoomCount ?? 0,
        responsibleEmployeeNames: aggregated?.responsibleEmployeeNames ?? [],
        summaryLabel: aggregated?.summaryLabel ?? neighborhoodName,
        rooms: aggregated?.rooms ?? [],
      };

      days.push(
        buildDayCoverageFromFloor(neighborhoodAsFloor, {
          serviceDate,
          hasAssignedUnscheduled: unscheduledNames.length > 0,
          assignedUnscheduledNames: unscheduledNames,
        }),
      );

      const assigneesByRoom = new Map(
        roomResponsibilities.map((r) => [r.unitSpaceId, r.employeeNames] as const),
      );
      for (const room of nRooms) {
        const names = assigneesByRoom.get(room.unitSpaceId) ?? [];
        const roomUnscheduled = [
          ...new Set(
            dayAssignments
              .filter((a) => !a.employeeHasShiftThatDay && a.unitSpaceIds.includes(room.unitSpaceId))
              .map((a) => a.employeeName),
          ),
        ].sort();
        roomsById.get(room.unitSpaceId)!.days.push(
          buildRoomDayCoverage({
            serviceDate,
            assignedEmployeeNames: names,
            assignedUnscheduledNames: roomUnscheduled,
          }),
        );
      }
    }

    neighborhoods.push({
      kind: "neighborhood",
      neighborhoodUnitId,
      neighborhoodName,
      days,
      rooms: [...roomsById.entries()]
        .map(([unitSpaceId, v]) => ({
          unitSpaceId,
          roomName: v.roomName,
          days: v.days,
        }))
        .sort((a, b) => a.roomName.localeCompare(b.roomName)),
    });
  }

  neighborhoods.sort((a, b) => a.neighborhoodName.localeCompare(b.neighborhoodName));

  let emptyMessage: string | null = null;
  if (floors.length === 0 && neighborhoods.length === 0) {
    emptyMessage = "No actionable locations are configured for this Department.";
  }

  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    departmentName: input.departmentName,
    week: input.week,
    floors,
    neighborhoods,
    locationScopeNote: input.locationScopeNote ?? null,
    emptyMessage,
  };
}
