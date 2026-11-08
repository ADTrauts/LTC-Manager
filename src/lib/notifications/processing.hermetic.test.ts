/**
 * Hermetic N1C checks. Database behavior stays in the SQL-backed test.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { parseNotificationPayload } from "./payload";
import { coveragePresentation } from "./presentation";
import { keepsCurrentPriority, outboxEvaluationNote } from "./processing";
import { coverageAttentionThreadKey } from "./thread-key";

const grain = {
  serviceDate: "2026-10-29",
  departmentId: "department-1",
  spaceId: "space-1",
  responsibility: "SERVER",
  cycleStableKey: "breakfast",
  coverageEpisodeId: "episode-1",
  locationLabel: "North dining room",
  cycleLabel: "Breakfast",
};

test("payload validation rejects a coverage row that has no thread grain", () => {
  const missing = parseNotificationPayload({
    eventType: "coverage.became_at_risk",
    facilityId: "facility-1",
    departmentId: "department-1",
    payload: { coverageState: "AT_RISK" },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "missing_coverage_grain");

  const mismatch = parseNotificationPayload({
    eventType: "coverage.became_uncovered",
    facilityId: "facility-1",
    departmentId: "department-1",
    payload: { ...grain, departmentId: "other-department", coverageState: "UNCOVERED", serviceState: "active" },
  });
  assert.equal(mismatch.ok, false);

  const sync = parseNotificationPayload({
    eventType: "sync.conflict_detected",
    facilityId: "facility-1",
    departmentId: null,
    payload: { blocksActiveOperation: "yes" },
  });
  assert.equal(sync.ok, false);
});

test("coverage payload keeps one thread key when priority facts change", () => {
  const atRisk = parseNotificationPayload({
    eventType: "coverage.became_at_risk",
    facilityId: "facility-1",
    departmentId: "department-1",
    payload: { ...grain, coverageState: "AT_RISK" },
  });
  const uncovered = parseNotificationPayload({
    eventType: "coverage.became_uncovered",
    facilityId: "facility-1",
    departmentId: "department-1",
    payload: { ...grain, coverageState: "UNCOVERED", serviceState: "active" },
  });
  assert.equal(atRisk.ok, true);
  assert.equal(uncovered.ok, true);
  if (!atRisk.ok || !uncovered.ok) return;
  assert.equal(atRisk.parsed.kind, "coverage");
  assert.equal(uncovered.parsed.kind, "coverage");
  if (atRisk.parsed.kind !== "coverage" || uncovered.parsed.kind !== "coverage") return;
  assert.equal(atRisk.parsed.threadKey, uncovered.parsed.threadKey);
  assert.equal(
    atRisk.parsed.threadKey,
    coverageAttentionThreadKey({
      kind: "coverage",
      facilityId: "facility-1",
      serviceDate: grain.serviceDate,
      departmentId: grain.departmentId,
      spaceId: grain.spaceId,
      responsibility: grain.responsibility,
      cycleStableKey: grain.cycleStableKey,
      episodeId: "episode-1",
    }),
  );
});

test("presentation and priority guards stay factual", () => {
  const copy = coveragePresentation(
    { locationLabel: "North dining room", cycleLabel: "Breakfast" },
    "2026-10-29",
  );
  assert.equal(copy.title, "Coverage needs attention");
  assert.equal(copy.body, "North dining room · Breakfast");
  assert.equal(copy.actionPath, "/staffing?date=2026-10-29");
  assert.equal(keepsCurrentPriority("CRITICAL", "NEEDS_ATTENTION"), true);
  assert.equal(keepsCurrentPriority("NEEDS_ATTENTION", "CRITICAL"), false);
  assert.equal(keepsCurrentPriority("URGENT", "URGENT"), false);
  assert.equal(outboxEvaluationNote("unsupported", "chat_is_not_operational_attention"), "unsupported:chat_is_not_operational_attention");
  assert.equal(outboxEvaluationNote("deferred", "sync_not_processable"), "deferred:sync_not_processable");
});

test("chat and sync do not become a coverage thread", () => {
  const chat = parseNotificationPayload({
    eventType: "chat.message.created",
    facilityId: "facility-1",
    departmentId: null,
    payload: { body: "hello" },
  });
  assert.equal(chat.ok, true);
  if (chat.ok) assert.equal(chat.parsed.kind, "catalog_only");
  const sync = parseNotificationPayload({
    eventType: "sync.conflict_detected",
    facilityId: "facility-1",
    departmentId: "department-1",
    payload: { blocksActiveOperation: true, syncActorUserId: "user-1" },
  });
  assert.equal(sync.ok, true);
  if (sync.ok) assert.equal(sync.parsed.kind, "sync_deferred");
});
