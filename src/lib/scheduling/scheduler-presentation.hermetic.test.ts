import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEmployeeShiftProjection } from "./employee-shift-projection";
import {
  formatAssignmentCoverageContext,
  shiftAssignmentRelationshipLabel,
} from "./relationship-labels";
import { formatShiftWindow12h } from "./shift-clock-time";

describe("scheduler relationship presentation", () => {
  it("translates four states to product language", () => {
    assert.equal(shiftAssignmentRelationshipLabel("SCHEDULED_AND_ASSIGNED"), "Assigned");
    assert.equal(shiftAssignmentRelationshipLabel("SCHEDULED_UNASSIGNED"), "No daily assignment");
    assert.equal(shiftAssignmentRelationshipLabel("ASSIGNED_UNSCHEDULED"), "Assigned, not scheduled");
    assert.equal(shiftAssignmentRelationshipLabel("NEITHER"), "Not scheduled");
  });

  it("formats assigned coverage context", () => {
    assert.equal(
      formatAssignmentCoverageContext({
        relationship: "SCHEDULED_AND_ASSIGNED",
        scopeSummaryLabels: ["Floors 1 & 2"],
      }),
      "Assigned: Floors 1 & 2",
    );
    assert.equal(
      formatAssignmentCoverageContext({
        relationship: "SCHEDULED_UNASSIGNED",
        scopeSummaryLabels: [],
      }),
      "No daily assignment",
    );
  });

  it("supports scheduled+assigned, scheduled+unassigned, assigned+unscheduled, multiple shifts", () => {
    const base = {
      employeeId: "e1",
      employeeFirstName: "Sharon",
      employeeLastName: "Smith",
      jobRoleDisplayName: "Resident Services Supervisor",
      teamDisplayName: "Resident Services",
      serviceDate: "2026-09-03",
    };

    const scheduledAssigned = buildEmployeeShiftProjection({
      ...base,
      scheduleEntries: [
        {
          id: "s1",
          plannedStart: "06:30",
          plannedEnd: "15:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
      ],
      operationalAssignments: [
        {
          id: "a1",
          roleLabel: "Resident Services Supervisor",
          scopeSummaryLabel: "Floors 1 & 2",
          status: "PLANNED",
          startsAt: null,
          endsAt: null,
        },
      ],
    });
    assert.equal(scheduledAssigned.relationship, "SCHEDULED_AND_ASSIGNED");

    const scheduledUnassigned = buildEmployeeShiftProjection({
      ...base,
      jobRoleDisplayName: null,
      scheduleEntries: [
        {
          id: "s1",
          plannedStart: "06:30",
          plannedEnd: "15:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
      ],
      operationalAssignments: [],
    });
    assert.equal(scheduledUnassigned.relationship, "SCHEDULED_UNASSIGNED");
    assert.equal(scheduledUnassigned.jobRoleDisplayName, null);

    const assignedUnscheduled = buildEmployeeShiftProjection({
      ...base,
      scheduleEntries: [],
      operationalAssignments: [
        {
          id: "a1",
          roleLabel: "Resident Services Supervisor",
          scopeSummaryLabel: "Floors 3 & 4",
          status: "ACTIVE",
          startsAt: null,
          endsAt: null,
        },
      ],
    });
    assert.equal(assignedUnscheduled.relationship, "ASSIGNED_UNSCHEDULED");

    const multi = buildEmployeeShiftProjection({
      ...base,
      scheduleEntries: [
        {
          id: "s1",
          plannedStart: "06:00",
          plannedEnd: "10:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
        {
          id: "s2",
          plannedStart: "14:00",
          plannedEnd: "18:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
      ],
      operationalAssignments: [
        {
          id: "a1",
          roleLabel: "Team Member",
          scopeSummaryLabel: "Naval Park",
          status: "PLANNED",
          startsAt: null,
          endsAt: null,
        },
      ],
    });
    assert.equal(multi.shifts.length, 2);
    assert.equal(multi.relationship, "SCHEDULED_AND_ASSIGNED");
    assert.equal(
      formatShiftWindow12h(multi.shifts[0]!),
      "6:00 AM–10:00 AM",
    );
  });
});

describe("legacy ScheduleEntry readability", () => {
  it("null departmentId / unitId / roleType / meal-slot rows remain readable", () => {
    const proj = buildEmployeeShiftProjection({
      employeeId: "e2",
      employeeFirstName: "Legacy",
      employeeLastName: "Row",
      jobRoleDisplayName: null,
      teamDisplayName: null,
      serviceDate: "2026-09-03",
      scheduleEntries: [
        {
          id: "legacy-1",
          plannedStart: null,
          plannedEnd: null,
          shift: "BREAKFAST",
          departmentId: null,
          unitId: "unit-1",
          workShiftId: null,
        },
      ],
      operationalAssignments: [],
    });
    assert.equal(proj.relationship, "SCHEDULED_UNASSIGNED");
    assert.equal(proj.shifts[0]!.departmentId, null);
    assert.equal(proj.shifts[0]!.legacyUnitId, "unit-1");
    assert.equal(proj.shifts[0]!.shiftSlot, "BREAKFAST");
    assert.equal(formatShiftWindow12h(proj.shifts[0]!), null);
  });

  it("canonical unit-less Shift does not invent Room coverage labels", () => {
    const proj = buildEmployeeShiftProjection({
      employeeId: "e3",
      employeeFirstName: "Joseph",
      employeeLastName: "Sauer",
      jobRoleDisplayName: "Team Member",
      teamDisplayName: "Resident Services",
      serviceDate: "2026-09-03",
      scheduleEntries: [
        {
          id: "s1",
          plannedStart: "06:30",
          plannedEnd: "15:00",
          shift: "FULL_DAY",
          departmentId: "d1",
          unitId: null,
          workShiftId: null,
        },
      ],
      operationalAssignments: [],
    });
    assert.equal(proj.relationship, "SCHEDULED_UNASSIGNED");
    assert.equal(proj.assignments.length, 0);
    assert.equal(proj.shifts[0]!.legacyUnitId, null);
    assert.equal(
      formatAssignmentCoverageContext({
        relationship: proj.relationship,
        scopeSummaryLabels: [],
      }),
      "No daily assignment",
    );
  });
});
