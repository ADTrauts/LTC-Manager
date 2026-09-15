import assert from "node:assert/strict";
import test from "node:test";

import {
  compareRepairsForQueue,
  parseRepairQueueFilter,
  repairDepartmentWhere,
  repairMatchesQueueFilter,
  repairOpenedAgeLabel,
  repairSourceCompactLine,
  repairSourceKind,
  repairSourceLabel,
  repairStatusProductLabel,
} from "./repair-presentation";

test("queue filter defaults to OPEN", () => {
  assert.equal(parseRepairQueueFilter(undefined), "OPEN");
  assert.equal(parseRepairQueueFilter("bogus"), "OPEN");
  assert.equal(parseRepairQueueFilter("WAITING"), "WAITING");
});

test("status filter membership", () => {
  assert.equal(repairMatchesQueueFilter("OPEN", "OPEN"), true);
  assert.equal(repairMatchesQueueFilter("WAITING_PARTS", "OPEN"), true);
  assert.equal(repairMatchesQueueFilter("COMPLETED", "OPEN"), false);
  assert.equal(repairMatchesQueueFilter("ASSIGNED", "IN_PROGRESS"), true);
  assert.equal(repairMatchesQueueFilter("WAITING_PARTS", "WAITING"), true);
  assert.equal(repairMatchesQueueFilter("COMPLETED", "COMPLETED"), true);
  assert.equal(repairMatchesQueueFilter("OPEN", "COMPLETED"), false);
});

test("source kind — linked / direct / preventive", () => {
  assert.equal(
    repairSourceKind({ workOrderKind: "CORRECTIVE", hasLinkedAssetIssue: true }),
    "LINKED_ISSUE",
  );
  assert.equal(
    repairSourceKind({ workOrderKind: "CORRECTIVE", hasLinkedAssetIssue: false }),
    "DIRECT",
  );
  assert.equal(
    repairSourceKind({ workOrderKind: "PREVENTIVE", hasLinkedAssetIssue: false }),
    "PREVENTIVE",
  );
  assert.equal(repairSourceLabel("DIRECT"), "Direct repair");
  assert.equal(
    repairSourceCompactLine({
      kind: "LINKED_ISSUE",
      issueSummary: "Not holding temperature",
    }),
    "Issue: Not holding temperature",
  );
});

test("status product labels", () => {
  assert.equal(repairStatusProductLabel("OPEN"), "Open");
  assert.equal(repairStatusProductLabel("WAITING_ON_VENDOR"), "Waiting (vendor)");
  assert.equal(repairStatusProductLabel("COMPLETED"), "Completed");
});

test("queue sort — open oldest first, completed after", () => {
  const older = { status: "OPEN" as const, requestedAt: new Date("2026-01-01") };
  const newer = { status: "OPEN" as const, requestedAt: new Date("2026-01-10") };
  const done = { status: "COMPLETED" as const, requestedAt: new Date("2026-01-15") };
  const rows = [done, newer, older].sort(compareRepairsForQueue);
  assert.equal(rows[0], older);
  assert.equal(rows[1], newer);
  assert.equal(rows[2], done);
});

test("department where empty for All Departments", () => {
  assert.deepEqual(repairDepartmentWhere(null), {});
});

test("department where includes responsible/requesting/asset/unassigned", () => {
  const where = repairDepartmentWhere("dept-1");
  assert.ok("OR" in where);
  assert.ok(Array.isArray(where.OR));
  assert.ok(where.OR.length >= 4);
});

test("opened age label", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  assert.equal(repairOpenedAgeLabel(new Date("2026-09-12T08:00:00Z"), now), "Opened today");
  assert.equal(repairOpenedAgeLabel(new Date("2026-09-11T12:00:00Z"), now), "Opened 1 day ago");
  assert.equal(repairOpenedAgeLabel(new Date("2026-09-09T12:00:00Z"), now), "Opened 3 days ago");
});
