import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatClockTime12h,
  formatShiftDuration,
  formatShiftWindow12h,
  normalizeShiftInterval,
  shiftDurationMinutes,
  shiftIntervalsOverlap,
} from "./shift-clock-time";
import {
  validateCanonicalShiftTimes,
  validateEmployeeEligibleForDepartmentShift,
  validateNoShiftOverlap,
} from "./canonical-shift-validation";

describe("overnight shift semantics", () => {
  it("23:00 → 07:00 normalizes as overnight ending next day", () => {
    const n = normalizeShiftInterval({ plannedStart: "23:00", plannedEnd: "07:00" });
    assert.equal(n.isOvernight, true);
    assert.equal(n.startMinutes, 23 * 60);
    assert.equal(n.endMinutes, 7 * 60 + 24 * 60);
    assert.equal(shiftDurationMinutes({ plannedStart: "23:00", plannedEnd: "07:00" }), 8 * 60);
    assert.equal(formatShiftDuration({ plannedStart: "23:00", plannedEnd: "07:00" }), "8h");
    assert.equal(formatShiftWindow12h({ plannedStart: "23:00", plannedEnd: "07:00" }), "11:00 PM–7:00 AM");
  });

  it("06:30 → 15:00 is not overnight", () => {
    const n = normalizeShiftInterval({ plannedStart: "06:30", plannedEnd: "15:00" });
    assert.equal(n.isOvernight, false);
    assert.equal(formatShiftDuration({ plannedStart: "06:30", plannedEnd: "15:00" }), "8h 30m");
    assert.equal(formatClockTime12h("06:30"), "6:30 AM");
    assert.equal(formatClockTime12h("15:00"), "3:00 PM");
  });
});

describe("shift overlap detection", () => {
  it("rejects overlapping intervals", () => {
    assert.equal(
      shiftIntervalsOverlap(
        { plannedStart: "06:30", plannedEnd: "15:00" },
        { plannedStart: "14:00", plannedEnd: "19:30" },
      ),
      true,
    );
    const result = validateNoShiftOverlap({
      plannedStart: "06:30",
      plannedEnd: "15:00",
      existing: [{ id: "a", plannedStart: "14:00", plannedEnd: "19:30" }],
    });
    assert.equal(result.ok, false);
  });

  it("allows non-overlapping split shifts", () => {
    assert.equal(
      shiftIntervalsOverlap(
        { plannedStart: "06:30", plannedEnd: "10:00" },
        { plannedStart: "14:00", plannedEnd: "19:30" },
      ),
      false,
    );
    const result = validateNoShiftOverlap({
      plannedStart: "06:30",
      plannedEnd: "10:00",
      existing: [{ id: "a", plannedStart: "14:00", plannedEnd: "19:30" }],
    });
    assert.equal(result.ok, true);
  });

  it("adjacent boundaries do not overlap", () => {
    assert.equal(
      shiftIntervalsOverlap(
        { plannedStart: "06:30", plannedEnd: "10:00" },
        { plannedStart: "10:00", plannedEnd: "14:00" },
      ),
      false,
    );
  });

  it("detects overnight overlap with evening segment on the same service date", () => {
    // 22:00→06:00 expands past midnight; 23:00–23:30 still overlaps the overnight start.
    assert.equal(
      shiftIntervalsOverlap(
        { plannedStart: "22:00", plannedEnd: "06:00" },
        { plannedStart: "23:00", plannedEnd: "23:30" },
      ),
      true,
    );
  });

  it("overnight ending next morning does not overlap a morning shift on the start service date", () => {
    // Service date owns the start. 23:00→07:00 ends next calendar day; 06:00–14:00 is earlier that day.
    assert.equal(
      shiftIntervalsOverlap(
        { plannedStart: "23:00", plannedEnd: "07:00" },
        { plannedStart: "06:00", plannedEnd: "14:00" },
      ),
      false,
    );
  });
});

describe("canonical Shift creation validation", () => {
  it("requires planned start/end", () => {
    assert.equal(validateCanonicalShiftTimes({ plannedStart: "", plannedEnd: "15:00" }).ok, false);
    assert.equal(validateCanonicalShiftTimes({ plannedStart: "06:30", plannedEnd: "15:00" }).ok, true);
  });

  it("rejects equal start/end", () => {
    assert.equal(validateCanonicalShiftTimes({ plannedStart: "06:30", plannedEnd: "06:30" }).ok, false);
  });

  it("employee outside Department rejected", () => {
    const result = validateEmployeeEligibleForDepartmentShift(
      {
        id: "e1",
        facilityId: "f1",
        status: "ACTIVE",
        belongsToDepartment: false,
      },
      { facilityId: "f1", departmentId: "d1" },
    );
    assert.equal(result.ok, false);
  });

  it("cross-facility employee rejected", () => {
    const result = validateEmployeeEligibleForDepartmentShift(
      {
        id: "e1",
        facilityId: "other",
        status: "ACTIVE",
        belongsToDepartment: true,
      },
      { facilityId: "f1", departmentId: "d1" },
    );
    assert.equal(result.ok, false);
  });

  it("inactive employee rejected", () => {
    const result = validateEmployeeEligibleForDepartmentShift(
      {
        id: "e1",
        facilityId: "f1",
        status: "TERMINATED",
        belongsToDepartment: true,
      },
      { facilityId: "f1", departmentId: "d1" },
    );
    assert.equal(result.ok, false);
  });

  it("active Department member can be scheduled (Unit/roleType/Job Role not required)", () => {
    const result = validateEmployeeEligibleForDepartmentShift(
      {
        id: "e1",
        facilityId: "f1",
        status: "ACTIVE",
        belongsToDepartment: true,
      },
      { facilityId: "f1", departmentId: "d1" },
    );
    assert.equal(result.ok, true);
  });
});
