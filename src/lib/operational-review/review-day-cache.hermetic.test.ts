import assert from "node:assert/strict";
import test from "node:test";

import {
  cachedOperationalReviewDay,
  clearOperationalReviewDayCache,
  previousServiceDateKey,
} from "./review-day-cache";

test("yesterday is the calendar day before the facility service date", () => {
  assert.equal(previousServiceDateKey("2026-10-23"), "2026-10-22");
  assert.equal(previousServiceDateKey("2026-03-01"), "2026-02-28");
});

test("a review day is loaded once for the same facility, Department, and date", async () => {
  clearOperationalReviewDayCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { facts: {}, model: {} } as never;
  };
  const input = {
    client: {} as never,
    facilityId: "fac",
    departmentId: "dept",
    serviceDate: "2026-10-22",
  };
  const first = await cachedOperationalReviewDay(input, load);
  const second = await cachedOperationalReviewDay(input, load);
  assert.equal(first, second);
  assert.equal(calls, 1);
  await cachedOperationalReviewDay({ ...input, serviceDate: "2026-10-21" }, load);
  assert.equal(calls, 2);
  clearOperationalReviewDayCache();
});
