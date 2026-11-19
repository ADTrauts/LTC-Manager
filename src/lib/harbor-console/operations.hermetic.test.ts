import assert from "node:assert/strict";
import test from "node:test";
import { harborOperationsHref, parseHarborOperationQueue } from "./operations";
import { elapsedAgeLabel } from "./presentation";
import { describeSupportScanSchedule, pendingSupportScanWhere, supportScanQueueWhere } from "@/lib/support/scan-scheduling";

test("Operations query navigation clamps invalid scope and preserves scan filters", () => {
  assert.equal(parseHarborOperationQueue(["catalog", "billing"]), "support");
  assert.equal(parseHarborOperationQueue("pending"), "pending");
  assert.equal(harborOperationsHref("scanning", 2, "scheduled"), "/console/operations?queue=scanning&page=2&scan=scheduled");
  assert.equal(harborOperationsHref("billing", 1, "failed"), "/console/operations?queue=billing");
});

test("Scan lease/retry boundaries share processor policy without inventing liveness or an SLA", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const row = { scanStatus: "PENDING" as const, nextScanAt: null as Date | null, scanLeaseExpiresAt: null as Date | null };
  assert.deepEqual(supportScanQueueWhere("eligible", now), pendingSupportScanWhere(now));
  assert.equal(describeSupportScanSchedule(row, now).stage, "eligible");
  assert.equal(describeSupportScanSchedule({ ...row, scanLeaseExpiresAt: now }, now).stage, "eligible");
  assert.equal(describeSupportScanSchedule({ ...row, scanLeaseExpiresAt: new Date(+now + 1) }, now).stage, "leased");
  assert.equal(describeSupportScanSchedule({ ...row, nextScanAt: now }, now).stage, "eligible");
  assert.equal(describeSupportScanSchedule({ ...row, nextScanAt: new Date(+now + 1) }, now).stage, "scheduled");
  assert.equal(describeSupportScanSchedule({ ...row, scanStatus: "BLOCKED" }, now).stage, null);
  assert.equal(describeSupportScanSchedule({ ...row, scanStatus: "SCAN_FAILED" }, now).stage, "failed");
  assert.equal(elapsedAgeLabel(new Date(+now - 61_000), now), "1 min");
  assert.match(elapsedAgeLabel(new Date(+now + 1), now), /ahead/);
});
