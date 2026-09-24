import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_REVIEW_RANGE_DAYS,
  addServiceDateKey,
  enumerateServiceDateKeys,
  validateReviewRange,
} from "./service-date-range";

test("enumerates inclusive civil service dates without UTC-midnight shortcuts", () => {
  assert.deepEqual(enumerateServiceDateKeys("2026-09-01", "2026-09-02"), [
    "2026-09-01",
    "2026-09-02",
  ]);
  assert.equal(enumerateServiceDateKeys("2026-09-01", "2026-09-07").length, 7);
  assert.equal(addServiceDateKey("2026-03-08", 1), "2026-03-09");
  assert.equal(enumerateServiceDateKeys("2026-09-01", "2026-10-01").length, 31);
});

test("range validation rejects inverted, oversized, and future ranges", () => {
  assert.equal(validateReviewRange({ start: "nope", end: "2026-09-01", todayKey: "2026-09-23" }).ok, false);
  assert.equal(
    validateReviewRange({ start: "2026-09-07", end: "2026-09-01", todayKey: "2026-09-23" }).ok,
    false,
  );
  const over = validateReviewRange({
    start: "2026-09-01",
    end: "2026-10-02",
    todayKey: "2026-10-02",
  });
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.code, "exceeds_limit");
  const future = validateReviewRange({
    start: "2026-09-20",
    end: "2026-09-24",
    todayKey: "2026-09-23",
  });
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.code, "future_range");
  const max = validateReviewRange({
    start: "2026-09-01",
    end: "2026-10-01",
    todayKey: "2026-10-01",
  });
  assert.equal(max.ok, true);
  if (max.ok) assert.equal(max.keys.length, MAX_REVIEW_RANGE_DAYS);
});
