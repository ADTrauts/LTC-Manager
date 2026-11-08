import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ShiftPresence } from "./employee-shift-projection";
import {
  aggregateFloorCoverage,
  aggregateNeighborhoodCoverage,
  buildSupervisorCoverageEmployeeRow,
  buildSupervisorDailyCoverageProjection,
  deriveShiftTimeState,
  filterEligibleRoomsByViewerScope,
  roomResponsibilitiesFromAssignments,
  supervisorCoverageAttentionRank,
  timeStateLabel,
} from "./supervisor-daily-coverage";

function shift(partial: Partial<ShiftPresence> & { scheduleEntryId: string }): ShiftPresence {
  return {
    serviceDate: "2026-09-03",
    plannedStart: "06:30",
    plannedEnd: "15:00",
    shiftSlot: "FULL_DAY",
    departmentId: "d1",
    legacyUnitId: null,
    workShiftId: null,
    ...partial,
  };
}

describe("supervisor coverage employee relationships", () => {
  it("orders exceptions before healthy assigned staff", () => {
    assert.ok(
      supervisorCoverageAttentionRank("SCHEDULED_UNASSIGNED") <
        supervisorCoverageAttentionRank("ASSIGNED_UNSCHEDULED"),
    );
    assert.ok(
      supervisorCoverageAttentionRank("ASSIGNED_UNSCHEDULED") <
        supervisorCoverageAttentionRank("SCHEDULED_AND_ASSIGNED"),
    );
  });

  it("builds scheduled + assigned quietly with coverage context", () => {
    const row = buildSupervisorCoverageEmployeeRow({
      employeeId: "sharon",
      employeeFirstName: "Sharon",
      employeeLastName: "Smith",
      teamDisplayName: "Resident Services",
      jobRoleDisplayName: "Resident Services Supervisor",
      jobTitleDisplayName: null,
      relationship: "SCHEDULED_AND_ASSIGNED",
      shifts: [shift({ scheduleEntryId: "s1" })],
      assignmentScopeLabels: ["Floors 1 & 2"],
      assignmentRoomLabels: ["Naval Park Servery", "Lighthouse Servery"],
      serviceDate: "2026-09-03",
      nowMinutesFromMidnight: 8 * 60,
    });
    assert.equal(row.relationshipLabel, "Assigned");
    assert.equal(row.coverageContext, "Assigned: Floors 1 & 2");
    assert.equal(row.timeState, "current");
    assert.equal(timeStateLabel(row.timeState), null);
    assert.match(row.assignCoverageHref, /\/staffing\/assignments/);
    assert.match(row.addShiftHref, /\/staffing\?date=/);
  });

  it("builds scheduled + unassigned with Assign coverage path", () => {
    const row = buildSupervisorCoverageEmployeeRow({
      employeeId: "joseph",
      employeeFirstName: "Joseph",
      employeeLastName: "Sauer",
      teamDisplayName: "Resident Services",
      jobRoleDisplayName: "Team Member",
      jobTitleDisplayName: null,
      relationship: "SCHEDULED_UNASSIGNED",
      shifts: [shift({ scheduleEntryId: "s2" })],
      assignmentScopeLabels: [],
      assignmentRoomLabels: [],
      serviceDate: "2026-09-03",
      nowMinutesFromMidnight: 8 * 60,
    });
    assert.equal(row.relationshipLabel, "No daily assignment");
    assert.equal(row.coverageContext, "No daily assignment");
    assert.match(row.assignCoverageHref, /assignments/);
  });

  it("builds assigned + unscheduled with Add shift path", () => {
    const row = buildSupervisorCoverageEmployeeRow({
      employeeId: "a",
      employeeFirstName: "Test",
      employeeLastName: "Employee",
      teamDisplayName: null,
      jobRoleDisplayName: null,
      jobTitleDisplayName: null,
      relationship: "ASSIGNED_UNSCHEDULED",
      shifts: [],
      assignmentScopeLabels: ["Floors 3 & 4"],
      assignmentRoomLabels: [],
      serviceDate: "2026-09-03",
      nowMinutesFromMidnight: 8 * 60,
    });
    assert.equal(row.relationshipLabel, "Assigned, not scheduled");
    assert.equal(row.jobRoleDisplayName, null);
    assert.match(row.addShiftHref, /\/staffing\?date=/);
  });

  it("supports multiple shifts and excludes NEITHER from board", () => {
    const sharon = buildSupervisorCoverageEmployeeRow({
      employeeId: "sharon",
      employeeFirstName: "Sharon",
      employeeLastName: "Smith",
      teamDisplayName: "Resident Services",
      jobRoleDisplayName: "Resident Services Supervisor",
      jobTitleDisplayName: null,
      relationship: "SCHEDULED_AND_ASSIGNED",
      shifts: [
        shift({ scheduleEntryId: "s1", plannedStart: "06:00", plannedEnd: "10:00" }),
        shift({ scheduleEntryId: "s2", plannedStart: "14:00", plannedEnd: "18:00" }),
      ],
      assignmentScopeLabels: ["Floors 1 & 2"],
      assignmentRoomLabels: [],
      serviceDate: "2026-09-03",
      nowMinutesFromMidnight: 8 * 60,
    });
    assert.equal(sharon.shiftWindowLabels.length, 2);

    const offDuty = buildSupervisorCoverageEmployeeRow({
      employeeId: "off",
      employeeFirstName: "Off",
      employeeLastName: "Duty",
      teamDisplayName: null,
      jobRoleDisplayName: null,
      jobTitleDisplayName: null,
      relationship: "NEITHER",
      shifts: [],
      assignmentScopeLabels: [],
      assignmentRoomLabels: [],
      serviceDate: "2026-09-03",
      nowMinutesFromMidnight: 8 * 60,
    });

    const board = buildSupervisorDailyCoverageProjection({
      serviceDate: "2026-09-03",
      departmentId: "d1",
      departmentName: "Dietary",
      employees: [sharon, offDuty],
      floors: [],
    });
    assert.equal(board.employees.length, 1);
    assert.equal(board.employees[0]!.employeeId, "sharon");
    assert.equal(board.summary.workingCount, 1);
  });
});

describe("supervisor coverage time states", () => {
  it("marks current / upcoming / ended / overnight correctly", () => {
    assert.equal(
      deriveShiftTimeState({
        nowMinutesFromMidnight: 8 * 60,
        shifts: [{ plannedStart: "06:30", plannedEnd: "15:00" }],
      }),
      "current",
    );
    assert.equal(
      deriveShiftTimeState({
        nowMinutesFromMidnight: 5 * 60,
        shifts: [{ plannedStart: "06:30", plannedEnd: "15:00" }],
      }),
      "upcoming",
    );
    assert.equal(
      deriveShiftTimeState({
        nowMinutesFromMidnight: 16 * 60,
        shifts: [{ plannedStart: "06:30", plannedEnd: "15:00" }],
      }),
      "ended",
    );
    assert.equal(
      deriveShiftTimeState({
        nowMinutesFromMidnight: 23 * 60 + 30,
        shifts: [{ plannedStart: "23:00", plannedEnd: "07:00" }],
      }),
      "current",
    );
  });
});

describe("floor aggregation from Room truth", () => {
  it("marks Floor full when all eligible Rooms assigned", () => {
    const floors = aggregateFloorCoverage({
      eligibleFloorRooms: [
        { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r1", roomName: "Naval Park" },
        { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r2", roomName: "Lighthouse" },
      ],
      roomResponsibilities: [
        { unitSpaceId: "r1", employeeNames: ["Sharon Smith"] },
        { unitSpaceId: "r2", employeeNames: ["Sharon Smith"] },
      ],
    });
    assert.equal(floors.length, 1);
    assert.equal(floors[0]!.status, "full");
    assert.equal(floors[0]!.summaryLabel, "Floor 1 — Sharon Smith");
  });

  it("marks partial when only some Rooms assigned; includes direct Floor Rooms", () => {
    const floors = aggregateFloorCoverage({
      eligibleFloorRooms: [
        { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r1", roomName: "Naval Park" },
        { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r-direct", roomName: "Floor Lounge" },
      ],
      roomResponsibilities: [{ unitSpaceId: "r1", employeeNames: ["Sharon Smith"] }],
    });
    assert.equal(floors[0]!.status, "partial");
    assert.equal(floors[0]!.assignedRoomCount, 1);
    assert.equal(floors[0]!.eligibleRoomCount, 2);
  });

  it("marks uncovered when no Rooms assigned", () => {
    const floors = aggregateFloorCoverage({
      eligibleFloorRooms: [
        { floorUnitId: "f2", floorName: "Floor 2", unitSpaceId: "r3", roomName: "Canal" },
      ],
      roomResponsibilities: [],
    });
    assert.equal(floors[0]!.status, "uncovered");
    assert.match(floors[0]!.summaryLabel, /needs coverage/);
  });

  it("canonical unit-less Shift does not invent Room coverage via roomResponsibilities helper", () => {
    // No OA locations → no room responsibilities, even if people are scheduled.
    const rooms = roomResponsibilitiesFromAssignments({
      assignments: [{ employeeName: "Joseph Sauer", unitSpaceIds: [] }],
    });
    assert.equal(rooms.length, 0);

    const floors = aggregateFloorCoverage({
      eligibleFloorRooms: [
        { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r1", roomName: "Naval Park" },
      ],
      roomResponsibilities: rooms,
    });
    assert.equal(floors[0]!.status, "uncovered");
  });

  it("excludes unrelated Department Rooms by only aggregating supplied eligible rooms", () => {
    const floors = aggregateFloorCoverage({
      eligibleFloorRooms: [
        { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "dietary-r1", roomName: "Servery" },
      ],
      roomResponsibilities: [
        { unitSpaceId: "dietary-r1", employeeNames: ["Sharon"] },
        { unitSpaceId: "evs-other", employeeNames: ["Someone Else"] },
      ],
    });
    assert.equal(floors[0]!.rooms.length, 1);
    assert.equal(floors[0]!.status, "full");
  });

  it("aggregates Neighborhood coverage independently of Floor", () => {
    const neighborhoods = aggregateNeighborhoodCoverage({
      eligibleNeighborhoodRooms: [
        {
          neighborhoodUnitId: "n1",
          neighborhoodName: "Naval Park",
          unitSpaceId: "r1",
          roomName: "Servery A",
        },
        {
          neighborhoodUnitId: "n1",
          neighborhoodName: "Naval Park",
          unitSpaceId: "r2",
          roomName: "Servery B",
        },
      ],
      roomResponsibilities: [{ unitSpaceId: "r1", employeeNames: ["Sharon"] }],
    });
    assert.equal(neighborhoods[0]!.status, "partial");
  });

  it("filters eligible Rooms by Team viewer scope", () => {
    const filtered = filterEligibleRoomsByViewerScope(
      [
        { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r1", roomName: "A" },
        { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r2", roomName: "B" },
      ],
      new Set(["r1"]),
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.unitSpaceId, "r1");
  });
});

describe("supervisor action hrefs", () => {
  it("points Assign coverage and Edit shift at canonical flows", () => {
    const row = buildSupervisorCoverageEmployeeRow({
      employeeId: "joseph",
      employeeFirstName: "Joseph",
      employeeLastName: "Sauer",
      teamDisplayName: "Resident Services",
      jobRoleDisplayName: "Team Member",
      jobTitleDisplayName: null,
      relationship: "SCHEDULED_UNASSIGNED",
      shifts: [shift({ scheduleEntryId: "s2" })],
      assignmentScopeLabels: [],
      assignmentRoomLabels: [],
      serviceDate: "2026-09-03",
      nowMinutesFromMidnight: 8 * 60,
    });
    assert.equal(row.assignCoverageHref, "/staffing/assignments?date=2026-09-03");
    assert.equal(row.editScheduleHref, "/staffing?date=2026-09-03");
    assert.equal(row.addShiftHref, "/staffing?date=2026-09-03");
    assert.doesNotMatch(row.assignCoverageHref, /legacy/);
  });
});
