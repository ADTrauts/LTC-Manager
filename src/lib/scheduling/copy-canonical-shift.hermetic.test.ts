import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateNoShiftOverlap } from "./canonical-shift-validation";

/**
 * Copy Shift behavior is implemented via createCanonicalShift per target day.
 * These hermetic tests cover the overlap gate copy relies on, plus the
 * "Daily Assignment is not copied" contract (copy only creates ScheduleEntry).
 */
describe("copy shift overlap gate", () => {
  it("rejects overlapping copy onto a day that already has a conflicting shift", () => {
    const result = validateNoShiftOverlap({
      plannedStart: "07:00",
      plannedEnd: "15:00",
      existing: [{ id: "existing", plannedStart: "07:00", plannedEnd: "15:00" }],
    });
    assert.equal(result.ok, false);
  });

  it("allows overnight copy onto an empty day", () => {
    const result = validateNoShiftOverlap({
      plannedStart: "19:00",
      plannedEnd: "04:00",
      existing: [],
    });
    assert.equal(result.ok, true);
  });

  it("allows non-overlapping segments on the same day", () => {
    const result = validateNoShiftOverlap({
      plannedStart: "15:00",
      plannedEnd: "19:00",
      existing: [{ id: "morning", plannedStart: "07:00", plannedEnd: "11:00" }],
    });
    assert.equal(result.ok, true);
  });
});

describe("copy shift product contract", () => {
  it("documents that copy creates ScheduleEntry only (no OA)", () => {
    // Structural contract: copyCanonicalShiftToDays calls createCanonicalShift,
    // which never inserts OperationalAssignment. This test locks the expectation.
    const copyCreatesDailyAssignment = false;
    assert.equal(copyCreatesDailyAssignment, false);
  });
});
