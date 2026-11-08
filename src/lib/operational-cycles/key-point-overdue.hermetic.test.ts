import assert from "node:assert/strict";
import test from "node:test";

import { keyPointAttentionThreadKey } from "@/lib/notifications/thread-key";

import {
  effectiveKeyPointDueLocal,
  isRequiredKeyPointOverdue,
} from "./key-time-day-expectation";

const grain = {
  kind: "key_point" as const,
  facilityId: "facility-a",
  serviceDate: "2026-10-29",
  departmentId: "department-dietary",
  spaceId: "space-1",
  cycleStableKey: "servery_ready",
};

test("only a REQUIRED Key Point with no actual is overdue after the expected minute", () => {
  const base = {
    configuredDueLocal: "12:00",
    adjustedDueLocal: null,
    hasActual: false,
    nowLocalHhMm: "12:01",
  };
  assert.equal(isRequiredKeyPointOverdue({ ...base, occurrenceTracking: "NONE" }), false);
  assert.equal(isRequiredKeyPointOverdue({ ...base, occurrenceTracking: "OPTIONAL" }), false);
  assert.equal(isRequiredKeyPointOverdue({ ...base, occurrenceTracking: "REQUIRED", nowLocalHhMm: "11:59" }), false);
  assert.equal(isRequiredKeyPointOverdue({ ...base, occurrenceTracking: "REQUIRED", nowLocalHhMm: "12:00" }), false);
  assert.equal(isRequiredKeyPointOverdue({ ...base, occurrenceTracking: "REQUIRED" }), true);
  assert.equal(isRequiredKeyPointOverdue({ ...base, occurrenceTracking: "REQUIRED", hasActual: true }), false);
});

test("an adjusted due time is the expected minute", () => {
  assert.equal(
    isRequiredKeyPointOverdue({
      occurrenceTracking: "REQUIRED",
      configuredDueLocal: "12:00",
      adjustedDueLocal: "12:15",
      hasActual: false,
      nowLocalHhMm: "12:01",
    }),
    false,
  );
  assert.equal(
    effectiveKeyPointDueLocal({
      configuredDueLocal: "12:00",
      expectationAdjustedDueLocal: "12:10",
      expectationAdjustedAt: new Date("2026-10-29T16:00:00.000Z"),
      latestAdjustmentDueLocal: "12:20",
      latestAdjustmentAt: new Date("2026-10-29T16:04:00.000Z"),
    }),
    "12:20",
  );
});

test("the Key Point thread is the occurrence, not the clock", () => {
  const key = keyPointAttentionThreadKey(grain);
  assert.equal(keyPointAttentionThreadKey(grain), key);
  assert.equal(key.includes("URGENT"), false);
  assert.equal(key.includes("12:00"), false);
  assert.notEqual(
    key,
    keyPointAttentionThreadKey({ ...grain, cycleStableKey: "service_started" }),
  );
});
