import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDepartmentWeekLocationCoverageProjection } from "./department-week-location-coverage-projection";
import { buildScheduleWeekRange } from "./schedule-week-range";

describe("DepartmentWeekLocationCoverageProjection", () => {
  const week = buildScheduleWeekRange({ anchorDate: "2026-09-07" });

  const floorRooms = [
    { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r1", roomName: "101" },
    { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r2", roomName: "102" },
    { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r3", roomName: "103" },
    { floorUnitId: "f1", floorName: "Floor 1", unitSpaceId: "r4", roomName: "104" },
  ];

  it("does not invent coverage from unit-less shifts (assignments drive coverage)", () => {
    const projection = buildDepartmentWeekLocationCoverageProjection({
      facilityId: "fac",
      departmentId: "d1",
      departmentName: "Resident Services",
      week,
      eligibleFloorRooms: floorRooms,
      eligibleNeighborhoodRooms: [],
      assignments: [], // no OA — even if shifts exist elsewhere
    });

    const mon = projection.floors[0]!.days[0]!;
    assert.equal(mon.status, "uncovered");
    assert.equal(mon.cellLabel, "Needs coverage");
  });

  it("shows OA assignees and partial floor coverage with real denominators", () => {
    const projection = buildDepartmentWeekLocationCoverageProjection({
      facilityId: "fac",
      departmentId: "d1",
      departmentName: "Resident Services",
      week,
      eligibleFloorRooms: floorRooms,
      eligibleNeighborhoodRooms: [],
      assignments: [
        {
          employeeId: "e1",
          employeeName: "Sharon Smith",
          serviceDate: "2026-09-07",
          unitSpaceIds: ["r1", "r2", "r3"],
          employeeHasShiftThatDay: true,
        },
      ],
    });

    const mon = projection.floors[0]!.days[0]!;
    assert.equal(mon.status, "partial");
    assert.equal(mon.cellLabel, "3/4 assigned");
    assert.deepEqual(mon.assignedEmployeeNames, ["Sharon Smith"]);
  });

  it("shows full floor coverage when all rooms assigned", () => {
    const projection = buildDepartmentWeekLocationCoverageProjection({
      facilityId: "fac",
      departmentId: "d1",
      departmentName: "Resident Services",
      week,
      eligibleFloorRooms: floorRooms,
      eligibleNeighborhoodRooms: [],
      assignments: [
        {
          employeeId: "e1",
          employeeName: "Sharon Smith",
          serviceDate: "2026-09-07",
          unitSpaceIds: ["r1", "r2", "r3", "r4"],
          employeeHasShiftThatDay: true,
        },
      ],
    });

    assert.equal(projection.floors[0]!.days[0]!.status, "full");
    assert.equal(projection.floors[0]!.days[0]!.cellLabel, "Sharon Smith");
  });

  it("surfaces assigned-but-unscheduled on location cells", () => {
    const projection = buildDepartmentWeekLocationCoverageProjection({
      facilityId: "fac",
      departmentId: "d1",
      departmentName: "Resident Services",
      week,
      eligibleFloorRooms: floorRooms,
      eligibleNeighborhoodRooms: [],
      assignments: [
        {
          employeeId: "e2",
          employeeName: "Mike Jones",
          serviceDate: "2026-09-07",
          unitSpaceIds: ["r1", "r2", "r3", "r4"],
          employeeHasShiftThatDay: false,
        },
      ],
    });

    const mon = projection.floors[0]!.days[0]!;
    assert.equal(mon.hasAssignedUnscheduled, true);
    assert.deepEqual(mon.assignedUnscheduledNames, ["Mike Jones"]);
  });

  it("includes direct Floor rooms in aggregation", () => {
    const projection = buildDepartmentWeekLocationCoverageProjection({
      facilityId: "fac",
      departmentId: "d1",
      departmentName: "Resident Services",
      week,
      eligibleFloorRooms: floorRooms,
      eligibleNeighborhoodRooms: [],
      assignments: [],
    });
    assert.equal(projection.floors[0]!.rooms.length, 4);
    assert.ok(projection.floors[0]!.rooms.some((r) => r.roomName === "101"));
  });
});
