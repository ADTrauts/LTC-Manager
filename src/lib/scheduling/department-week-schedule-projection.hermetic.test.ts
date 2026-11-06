import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDepartmentWeekScheduleProjection,
  filterDepartmentWeekEmployees,
} from "./department-week-schedule-projection";
import { buildScheduleWeekRange } from "./schedule-week-range";
import { formatShiftWindowCompact } from "./shift-clock-time";

describe("DepartmentWeekScheduleProjection", () => {
  const week = buildScheduleWeekRange({ anchorDate: "2026-09-07" });

  it("includes active employees with empty days when no shifts exist", () => {
    const projection = buildDepartmentWeekScheduleProjection({
      facilityId: "f1",
      departmentId: "d1",
      departmentName: "Culinary",
      week,
      employees: [
        {
          id: "e1",
          firstName: "Joseph",
          lastName: "Sauer",
          teamDisplayName: "Kitchen",
          jobRoleDisplayName: "Cook",
          jobTitleDisplayName: null,
        },
        {
          id: "e2",
          firstName: "Test",
          lastName: "FSW",
          teamDisplayName: "Dining",
          jobRoleDisplayName: null,
          jobTitleDisplayName: null,
        },
      ],
      scheduleEntries: [],
      assignments: [],
    });

    assert.equal(projection.employees.length, 2);
    assert.equal(projection.employees[0]!.teamDisplayName, "Dining"); // Team then name
    assert.equal(projection.employees.every((e) => e.days.length === 7), true);
    assert.equal(projection.summary.scheduledEmployeeCount, 0);
  });

  it("places multiple shifts and overnight compact labels on the start service date", () => {
    const projection = buildDepartmentWeekScheduleProjection({
      facilityId: "f1",
      departmentId: "d1",
      departmentName: "Culinary",
      week,
      employees: [
        {
          id: "e1",
          firstName: "Andrew",
          lastName: "Trautman",
          teamDisplayName: "Night",
          jobRoleDisplayName: null,
          jobTitleDisplayName: null,
        },
      ],
      scheduleEntries: [
        {
          id: "s1",
          employeeId: "e1",
          serviceDate: "2026-09-07",
          plannedStart: "07:00",
          plannedEnd: "11:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
        {
          id: "s2",
          employeeId: "e1",
          serviceDate: "2026-09-07",
          plannedStart: "15:00",
          plannedEnd: "19:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
        {
          id: "s3",
          employeeId: "e1",
          serviceDate: "2026-09-08",
          plannedStart: "19:00",
          plannedEnd: "04:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
      ],
      assignments: [],
    });

    const mon = projection.employees[0]!.days[0]!;
    assert.equal(mon.shifts.length, 2);
    assert.equal(mon.needsAssignment, true);
    assert.equal(mon.shifts[0]!.compactLabel, "7–11");
    assert.equal(mon.shifts[1]!.compactLabel, "3–7p");

    const tue = projection.employees[0]!.days[1]!;
    assert.equal(tue.shifts.length, 1);
    assert.equal(tue.shifts[0]!.compactLabel, "7p–4a");
    // Overnight must not appear on Wednesday
    assert.equal(projection.employees[0]!.days[2]!.shifts.length, 0);
  });

  it("surfaces scheduled-unassigned and assigned-unscheduled day markers", () => {
    const projection = buildDepartmentWeekScheduleProjection({
      facilityId: "f1",
      departmentId: "d1",
      departmentName: "Resident Services",
      week,
      employees: [
        {
          id: "e1",
          firstName: "Joseph",
          lastName: "Sauer",
          teamDisplayName: "RS",
          jobRoleDisplayName: "Aide",
          jobTitleDisplayName: null,
        },
        {
          id: "e2",
          firstName: "Test",
          lastName: "FSW",
          teamDisplayName: "RS",
          jobRoleDisplayName: null,
          jobTitleDisplayName: null,
        },
      ],
      scheduleEntries: [
        {
          id: "s1",
          employeeId: "e1",
          serviceDate: "2026-09-07",
          plannedStart: "07:00",
          plannedEnd: "15:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
      ],
      assignments: [
        {
          id: "a1",
          employeeId: "e2",
          serviceDate: "2026-09-07",
          roleLabel: "FSW",
          scopeSummaryLabel: "Floor 1",
          status: "PLANNED",
          startsAt: null,
          endsAt: null,
        },
      ],
    });

    const josephMon = projection.employees.find((e) => e.employeeId === "e1")!.days[0]!;
    const fswMon = projection.employees.find((e) => e.employeeId === "e2")!.days[0]!;
    assert.equal(josephMon.needsAssignment, true);
    assert.equal(fswMon.assignedUnscheduled, true);
    assert.equal(projection.summary.needAssignmentDayCount, 1);
    assert.equal(projection.summary.assignedUnscheduledDayCount, 1);
  });

  it("filters by team / search / scheduled", () => {
    const projection = buildDepartmentWeekScheduleProjection({
      facilityId: "f1",
      departmentId: "d1",
      departmentName: "Culinary",
      week,
      employees: [
        {
          id: "e1",
          firstName: "Joseph",
          lastName: "Sauer",
          teamDisplayName: "Kitchen",
          jobRoleDisplayName: "Cook",
          jobTitleDisplayName: null,
        },
        {
          id: "e2",
          firstName: "Test",
          lastName: "FSW",
          teamDisplayName: "Dining",
          jobRoleDisplayName: null,
          jobTitleDisplayName: null,
        },
      ],
      scheduleEntries: [
        {
          id: "s1",
          employeeId: "e1",
          serviceDate: "2026-09-07",
          plannedStart: "07:00",
          plannedEnd: "15:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
      ],
      assignments: [],
    });

    assert.equal(filterDepartmentWeekEmployees(projection, { team: "Kitchen" }).length, 1);
    assert.equal(filterDepartmentWeekEmployees(projection, { search: "traut" }).length, 0);
    assert.equal(filterDepartmentWeekEmployees(projection, { search: "sauer" }).length, 1);
    assert.equal(filterDepartmentWeekEmployees(projection, { scheduledOnly: true }).length, 1);
    assert.equal(filterDepartmentWeekEmployees(projection, { unscheduledOnly: true }).length, 1);
  });
});

describe("formatShiftWindowCompact", () => {
  it("formats daytime and overnight compactly", () => {
    assert.equal(formatShiftWindowCompact({ plannedStart: "07:00", plannedEnd: "15:00" }), "7–3");
    assert.equal(formatShiftWindowCompact({ plannedStart: "19:00", plannedEnd: "04:00" }), "7p–4a");
  });
});
