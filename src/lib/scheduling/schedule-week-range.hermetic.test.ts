import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildScheduleWeekRange,
  currentScheduleWeek,
  mondayOfWeekContaining,
  nextScheduleWeek,
  previousScheduleWeek,
  scheduleIsoWeekday,
  SCHEDULE_WEEK_STARTS_ON,
  shiftScheduleIsoDate,
} from "./schedule-week-range";

describe("schedule week range (Monday-start)", () => {
  it("declares Monday-start as the staffing convention", () => {
    assert.equal(SCHEDULE_WEEK_STARTS_ON, "MONDAY");
  });

  it("resolves Monday of week containing a mid-week date", () => {
    // 2026-09-11 is Friday
    assert.equal(mondayOfWeekContaining("2026-09-11"), "2026-09-07");
    assert.equal(scheduleIsoWeekday("2026-09-07"), 1); // Monday
  });

  it("maps Sunday to the prior Monday", () => {
    assert.equal(mondayOfWeekContaining("2026-09-13"), "2026-09-07");
  });

  it("builds a 7-day Mon–Sun range", () => {
    const week = buildScheduleWeekRange({ anchorDate: "2026-09-11" });
    assert.equal(week.weekStart, "2026-09-07");
    assert.equal(week.weekEnd, "2026-09-13");
    assert.deepEqual(week.days, [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("navigates previous / next / current week", () => {
    const current = currentScheduleWeek("2026-09-11");
    const prev = previousScheduleWeek(current.weekStart);
    const next = nextScheduleWeek(current.weekStart);
    assert.equal(prev.weekStart, "2026-08-31");
    assert.equal(prev.weekEnd, "2026-09-06");
    assert.equal(next.weekStart, "2026-09-14");
    assert.equal(next.weekEnd, "2026-09-20");
  });

  it("shifts ISO dates across month boundaries", () => {
    assert.equal(shiftScheduleIsoDate("2026-09-01", -1), "2026-08-31");
    assert.equal(shiftScheduleIsoDate("2026-08-31", 1), "2026-09-01");
  });
});
