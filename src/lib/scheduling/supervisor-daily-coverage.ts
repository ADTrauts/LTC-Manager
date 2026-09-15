/**
 * Supervisor Daily Coverage — derived RUN projection (Phase 4).
 *
 * Consumes Shift presence + Daily Assignment + hierarchy.
 * Does NOT persist coverage. Does NOT create a new staffing truth model.
 *
 * Product language only — never expose raw relationship enums in UI.
 */

import type { ShiftAssignmentRelationship, ShiftPresence } from "./employee-shift-projection";
import {
  formatAssignmentCoverageContext,
  shiftAssignmentRelationshipLabel,
} from "./relationship-labels";
import { formatShiftWindow12h, isValidClockTimeHhMm, normalizeShiftInterval } from "./shift-clock-time";

export type SupervisorCoverageTimeState = "current" | "upcoming" | "ended" | "unknown";

export type SupervisorCoverageEmployeeRow = {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  teamDisplayName: string | null;
  jobRoleDisplayName: string | null;
  jobTitleDisplayName: string | null;
  relationship: ShiftAssignmentRelationship;
  relationshipLabel: string;
  coverageContext: string | null;
  shiftWindowLabels: string[];
  shifts: ShiftPresence[];
  assignmentScopeLabels: string[];
  /** Expanded room labels for detail (optional). */
  assignmentRoomLabels: string[];
  timeState: SupervisorCoverageTimeState;
  attentionRank: number;
  assignCoverageHref: string;
  addShiftHref: string;
  editScheduleHref: string;
};

export type SupervisorFloorCoverageStatus = "full" | "partial" | "uncovered" | "unknown";

export type SupervisorFloorCoverage = {
  floorUnitId: string;
  floorName: string;
  status: SupervisorFloorCoverageStatus;
  eligibleRoomCount: number;
  assignedRoomCount: number;
  responsibleEmployeeNames: string[];
  summaryLabel: string;
  rooms: Array<{
    unitSpaceId: string;
    roomName: string;
    assignedEmployeeNames: string[];
  }>;
};

export type SupervisorNeighborhoodCoverage = {
  neighborhoodUnitId: string;
  neighborhoodName: string;
  status: SupervisorFloorCoverageStatus;
  eligibleRoomCount: number;
  assignedRoomCount: number;
  responsibleEmployeeNames: string[];
  summaryLabel: string;
  rooms: Array<{
    unitSpaceId: string;
    roomName: string;
    assignedEmployeeNames: string[];
  }>;
};

export type SupervisorCoverageSummary = {
  workingCount: number;
  assignedCount: number;
  needAssignmentCount: number;
  assignedUnscheduledCount: number;
  floorFullCount: number;
  floorPartialCount: number;
  floorUncoveredCount: number;
};

export type SupervisorDailyCoverageProjection = {
  serviceDate: string;
  departmentId: string;
  departmentName: string;
  summary: SupervisorCoverageSummary;
  employees: SupervisorCoverageEmployeeRow[];
  floors: SupervisorFloorCoverage[];
  neighborhoods: SupervisorNeighborhoodCoverage[];
  emptyMessage: string | null;
  /** Present when Team scope hides all location coverage without unconfigured empty board. */
  locationScopeNote: string | null;
};

/** Exception-first attention rank (lower = more urgent). */
export function supervisorCoverageAttentionRank(
  relationship: ShiftAssignmentRelationship,
): number {
  switch (relationship) {
    case "SCHEDULED_UNASSIGNED":
      return 0;
    case "ASSIGNED_UNSCHEDULED":
      return 1;
    case "SCHEDULED_AND_ASSIGNED":
      return 2;
    case "NEITHER":
      return 3;
  }
}

/**
 * Derive whether a Shift window is current/upcoming/ended relative to facility-local minutes-from-midnight.
 * Overnight intervals are supported via normalizeShiftInterval.
 */
export function deriveShiftTimeState(input: {
  nowMinutesFromMidnight: number;
  shifts: Array<{ plannedStart: string | null; plannedEnd: string | null }>;
}): SupervisorCoverageTimeState {
  const clockShifts = input.shifts.filter(
    (s) =>
      s.plannedStart &&
      s.plannedEnd &&
      isValidClockTimeHhMm(s.plannedStart) &&
      isValidClockTimeHhMm(s.plannedEnd),
  );
  if (clockShifts.length === 0) return "unknown";

  let anyCurrent = false;
  let anyUpcoming = false;
  let anyEnded = false;

  for (const s of clockShifts) {
    const { startMinutes, endMinutes } = normalizeShiftInterval({
      plannedStart: s.plannedStart!,
      plannedEnd: s.plannedEnd!,
    });
    if (input.nowMinutesFromMidnight >= startMinutes && input.nowMinutesFromMidnight < endMinutes) {
      anyCurrent = true;
    } else if (input.nowMinutesFromMidnight < startMinutes) {
      anyUpcoming = true;
    } else {
      anyEnded = true;
    }
  }

  if (anyCurrent) return "current";
  if (anyUpcoming) return "upcoming";
  if (anyEnded) return "ended";
  return "unknown";
}

export function timeStateLabel(state: SupervisorCoverageTimeState): string | null {
  switch (state) {
    case "current":
      return null; // quiet when healthy/current
    case "upcoming":
      return "Upcoming";
    case "ended":
      return "Ended";
    case "unknown":
      return null;
  }
}

export type EligibleFloorRoom = {
  floorUnitId: string;
  floorName: string;
  unitSpaceId: string;
  roomName: string;
};

export type EligibleNeighborhoodRoom = {
  neighborhoodUnitId: string;
  neighborhoodName: string;
  unitSpaceId: string;
  roomName: string;
};

export type RoomResponsibility = {
  unitSpaceId: string;
  employeeNames: string[];
};

function coverageStatusRank(status: SupervisorFloorCoverageStatus): number {
  const rank: Record<SupervisorFloorCoverageStatus, number> = {
    uncovered: 0,
    partial: 1,
    full: 2,
    unknown: 3,
  };
  return rank[status];
}

function deriveGroupCoverageStatus(input: {
  groupName: string;
  rooms: Array<{ unitSpaceId: string; roomName: string; assignedEmployeeNames: string[] }>;
}): {
  status: SupervisorFloorCoverageStatus;
  eligibleRoomCount: number;
  assignedRoomCount: number;
  responsibleEmployeeNames: string[];
  summaryLabel: string;
} {
  const eligibleRoomCount = input.rooms.length;
  const assignedRoomCount = input.rooms.filter((r) => r.assignedEmployeeNames.length > 0).length;
  const responsibleEmployeeNames = [
    ...new Set(input.rooms.flatMap((r) => r.assignedEmployeeNames)),
  ].sort();

  let status: SupervisorFloorCoverageStatus;
  if (eligibleRoomCount === 0) {
    status = "unknown";
  } else if (assignedRoomCount === 0) {
    status = "uncovered";
  } else if (assignedRoomCount === eligibleRoomCount) {
    status = "full";
  } else {
    status = "partial";
  }

  const summaryLabel = (() => {
    if (status === "full" && responsibleEmployeeNames.length === 1) {
      return `${input.groupName} — ${responsibleEmployeeNames[0]}`;
    }
    if (status === "full" && responsibleEmployeeNames.length > 1) {
      return `${input.groupName} — ${responsibleEmployeeNames.join(", ")}`;
    }
    if (status === "partial") {
      return `${input.groupName} — partial (${assignedRoomCount}/${eligibleRoomCount} Rooms)`;
    }
    if (status === "uncovered") {
      return `${input.groupName} — needs coverage`;
    }
    return input.groupName;
  })();

  return {
    status,
    eligibleRoomCount,
    assignedRoomCount,
    responsibleEmployeeNames,
    summaryLabel,
  };
}

/**
 * Aggregate Room-grain assignments into Floor summaries.
 * Floor is full only when every eligible Department Room under that Floor has ≥1 assignee.
 * Direct Floor Rooms are included in eligibleFloorRooms (caller supplies them).
 */
export function aggregateFloorCoverage(input: {
  eligibleFloorRooms: EligibleFloorRoom[];
  roomResponsibilities: RoomResponsibility[];
}): SupervisorFloorCoverage[] {
  const assigneesByRoom = new Map<string, string[]>();
  for (const row of input.roomResponsibilities) {
    assigneesByRoom.set(row.unitSpaceId, [...new Set(row.employeeNames)].sort());
  }

  const byFloor = new Map<
    string,
    {
      floorName: string;
      rooms: Array<{ unitSpaceId: string; roomName: string; assignedEmployeeNames: string[] }>;
    }
  >();

  for (const room of input.eligibleFloorRooms) {
    const bucket = byFloor.get(room.floorUnitId) ?? {
      floorName: room.floorName,
      rooms: [],
    };
    bucket.rooms.push({
      unitSpaceId: room.unitSpaceId,
      roomName: room.roomName,
      assignedEmployeeNames: assigneesByRoom.get(room.unitSpaceId) ?? [],
    });
    byFloor.set(room.floorUnitId, bucket);
  }

  const floors: SupervisorFloorCoverage[] = [];
  for (const [floorUnitId, bucket] of byFloor) {
    const derived = deriveGroupCoverageStatus({
      groupName: bucket.floorName,
      rooms: bucket.rooms,
    });
    floors.push({
      floorUnitId,
      floorName: bucket.floorName,
      ...derived,
      rooms: bucket.rooms.sort((a, b) => a.roomName.localeCompare(b.roomName)),
    });
  }

  return floors.sort((a, b) => {
    const d = coverageStatusRank(a.status) - coverageStatusRank(b.status);
    if (d !== 0) return d;
    return a.floorName.localeCompare(b.floorName);
  });
}

/** Neighborhood display aggregation from Room truth (not persisted coverage). */
export function aggregateNeighborhoodCoverage(input: {
  eligibleNeighborhoodRooms: EligibleNeighborhoodRoom[];
  roomResponsibilities: RoomResponsibility[];
}): SupervisorNeighborhoodCoverage[] {
  const assigneesByRoom = new Map<string, string[]>();
  for (const row of input.roomResponsibilities) {
    assigneesByRoom.set(row.unitSpaceId, [...new Set(row.employeeNames)].sort());
  }

  const byNeighborhood = new Map<
    string,
    {
      neighborhoodName: string;
      rooms: Array<{ unitSpaceId: string; roomName: string; assignedEmployeeNames: string[] }>;
    }
  >();

  for (const room of input.eligibleNeighborhoodRooms) {
    const bucket = byNeighborhood.get(room.neighborhoodUnitId) ?? {
      neighborhoodName: room.neighborhoodName,
      rooms: [],
    };
    bucket.rooms.push({
      unitSpaceId: room.unitSpaceId,
      roomName: room.roomName,
      assignedEmployeeNames: assigneesByRoom.get(room.unitSpaceId) ?? [],
    });
    byNeighborhood.set(room.neighborhoodUnitId, bucket);
  }

  const neighborhoods: SupervisorNeighborhoodCoverage[] = [];
  for (const [neighborhoodUnitId, bucket] of byNeighborhood) {
    const derived = deriveGroupCoverageStatus({
      groupName: bucket.neighborhoodName,
      rooms: bucket.rooms,
    });
    neighborhoods.push({
      neighborhoodUnitId,
      neighborhoodName: bucket.neighborhoodName,
      ...derived,
      rooms: bucket.rooms.sort((a, b) => a.roomName.localeCompare(b.roomName)),
    });
  }

  return neighborhoods.sort((a, b) => {
    const d = coverageStatusRank(a.status) - coverageStatusRank(b.status);
    if (d !== 0) return d;
    return a.neighborhoodName.localeCompare(b.neighborhoodName);
  });
}

/** Restrict eligible Rooms to Team viewer scope without broadening visibility. */
export function filterEligibleRoomsByViewerScope<T extends { unitSpaceId: string }>(
  rooms: T[],
  allowedRoomIds: ReadonlySet<string> | null,
): T[] {
  if (!allowedRoomIds) return rooms;
  return rooms.filter((room) => allowedRoomIds.has(room.unitSpaceId));
}

export type BuildSupervisorEmployeeRowInput = {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  teamDisplayName: string | null;
  jobRoleDisplayName: string | null;
  jobTitleDisplayName: string | null;
  relationship: ShiftAssignmentRelationship;
  shifts: ShiftPresence[];
  assignmentScopeLabels: string[];
  assignmentRoomLabels: string[];
  serviceDate: string;
  nowMinutesFromMidnight: number | null;
};

export function buildSupervisorCoverageEmployeeRow(
  input: BuildSupervisorEmployeeRowInput,
): SupervisorCoverageEmployeeRow {
  const shiftWindowLabels = input.shifts
    .map((s) => formatShiftWindow12h(s) ?? (s.shiftSlot ? `Legacy: ${s.shiftSlot}` : null))
    .filter((v): v is string => Boolean(v));

  const timeState =
    input.nowMinutesFromMidnight == null
      ? "unknown"
      : deriveShiftTimeState({
          nowMinutesFromMidnight: input.nowMinutesFromMidnight,
          shifts: input.shifts,
        });

  return {
    employeeId: input.employeeId,
    employeeFirstName: input.employeeFirstName,
    employeeLastName: input.employeeLastName,
    teamDisplayName: input.teamDisplayName,
    jobRoleDisplayName: input.jobRoleDisplayName,
    jobTitleDisplayName: input.jobTitleDisplayName,
    relationship: input.relationship,
    relationshipLabel: shiftAssignmentRelationshipLabel(input.relationship),
    coverageContext: formatAssignmentCoverageContext({
      relationship: input.relationship,
      scopeSummaryLabels: input.assignmentScopeLabels,
    }),
    shiftWindowLabels,
    shifts: input.shifts,
    assignmentScopeLabels: input.assignmentScopeLabels,
    assignmentRoomLabels: input.assignmentRoomLabels,
    timeState,
    attentionRank: supervisorCoverageAttentionRank(input.relationship),
    assignCoverageHref: `/staffing/assignments?date=${input.serviceDate}`,
    addShiftHref: `/staffing?date=${input.serviceDate}`,
    editScheduleHref: `/staffing?date=${input.serviceDate}`,
  };
}

export function buildSupervisorCoverageSummary(
  employees: SupervisorCoverageEmployeeRow[],
  floors: SupervisorFloorCoverage[],
): SupervisorCoverageSummary {
  const working = employees.filter(
    (e) =>
      e.relationship === "SCHEDULED_AND_ASSIGNED" || e.relationship === "SCHEDULED_UNASSIGNED",
  );
  const assigned = employees.filter(
    (e) =>
      e.relationship === "SCHEDULED_AND_ASSIGNED" || e.relationship === "ASSIGNED_UNSCHEDULED",
  );
  return {
    workingCount: working.length,
    assignedCount: assigned.length,
    needAssignmentCount: employees.filter((e) => e.relationship === "SCHEDULED_UNASSIGNED").length,
    assignedUnscheduledCount: employees.filter((e) => e.relationship === "ASSIGNED_UNSCHEDULED")
      .length,
    floorFullCount: floors.filter((f) => f.status === "full").length,
    floorPartialCount: floors.filter((f) => f.status === "partial").length,
    floorUncoveredCount: floors.filter((f) => f.status === "uncovered").length,
  };
}

export function buildSupervisorDailyCoverageProjection(input: {
  serviceDate: string;
  departmentId: string;
  departmentName: string;
  employees: SupervisorCoverageEmployeeRow[];
  floors: SupervisorFloorCoverage[];
  neighborhoods?: SupervisorNeighborhoodCoverage[];
  locationScopeNote?: string | null;
}): SupervisorDailyCoverageProjection {
  // Off-duty (NEITHER) excluded from supervisor board by default.
  const visible = input.employees
    .filter((e) => e.relationship !== "NEITHER")
    .sort((a, b) => {
      const d = a.attentionRank - b.attentionRank;
      if (d !== 0) return d;
      return a.employeeLastName.localeCompare(b.employeeLastName);
    });

  const floors = input.floors;
  const neighborhoods = input.neighborhoods ?? [];
  const summary = buildSupervisorCoverageSummary(visible, floors);

  let emptyMessage: string | null = null;
  if (visible.length === 0) {
    emptyMessage = "No employees are scheduled for today.";
  } else if (summary.needAssignmentCount > 0 && summary.assignedCount === 0) {
    emptyMessage = `${summary.needAssignmentCount} employee${summary.needAssignmentCount === 1 ? " is" : "s are"} working but still need coverage assignments.`;
  }

  return {
    serviceDate: input.serviceDate,
    departmentId: input.departmentId,
    departmentName: input.departmentName,
    summary,
    employees: visible,
    floors,
    neighborhoods,
    emptyMessage,
    locationScopeNote: input.locationScopeNote ?? null,
  };
}

/**
 * Canonical unit-less Shift must not invent Room coverage.
 * Only rooms with explicit OA responsibility (or legacy unit-bound schedule fallback handled elsewhere)
 * contribute to roomResponsibilities.
 */
export function roomResponsibilitiesFromAssignments(input: {
  assignments: Array<{
    employeeName: string;
    unitSpaceIds: string[];
  }>;
}): RoomResponsibility[] {
  const map = new Map<string, Set<string>>();
  for (const a of input.assignments) {
    for (const spaceId of a.unitSpaceIds) {
      const set = map.get(spaceId) ?? new Set<string>();
      set.add(a.employeeName);
      map.set(spaceId, set);
    }
  }
  return [...map.entries()].map(([unitSpaceId, names]) => ({
    unitSpaceId,
    employeeNames: [...names].sort(),
  }));
}
