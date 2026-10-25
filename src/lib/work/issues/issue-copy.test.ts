import assert from "node:assert/strict";
import test from "node:test";

import { RepairPriority, RepairStatus } from "@prisma/client";

import { formatIssueTimestamp } from "@/lib/work/issues/format-issue-time";
import {
  getIssueCopy,
  issueDetailPath,
  mapRepairStatusToRecoveryStage,
  recoveryStageLabel,
  repairDetailAliasPath,
  resolveIssueImpactSummary,
  resolveIssueNextAction,
  resolveIssueRecoveryStatePhrase,
} from "@/lib/work/issues/issue-copy";

test("work order copy is the recovery language", () => {
  const copy = getIssueCopy();
  assert.equal(copy.typeLabel, "Work order");
  assert.match(copy.inProgressPhrase, /Work in progress/i);
  assert.match(copy.resolvedPhrase, /Work completed/i);
});

test("recovery stages map from RepairStatus and assignment", () => {
  assert.equal(
    mapRepairStatusToRecoveryStage({ status: RepairStatus.OPEN, assignedEmployeeId: null }),
    "REPORTED",
  );
  assert.equal(
    mapRepairStatusToRecoveryStage({ status: RepairStatus.OPEN, assignedEmployeeId: "emp_1" }),
    "ASSIGNED",
  );
  assert.equal(
    mapRepairStatusToRecoveryStage({ status: RepairStatus.IN_PROGRESS }),
    "IN_PROGRESS",
  );
  assert.equal(
    mapRepairStatusToRecoveryStage({ status: RepairStatus.WAITING_ON_VENDOR }),
    "WAITING",
  );
  assert.equal(
    mapRepairStatusToRecoveryStage({ status: RepairStatus.ON_HOLD }),
    "WAITING",
  );
  assert.equal(mapRepairStatusToRecoveryStage({ status: RepairStatus.COMPLETED }), "RESOLVED");
  assert.equal(recoveryStageLabel("WAITING"), "Waiting");
});

test("canonical repair detail paths", () => {
  assert.equal(issueDetailPath("clxxxxxxxxxxxxxxxxxxxxxxxx"), "/repairs/clxxxxxxxxxxxxxxxxxxxxxxxx");
  assert.equal(repairDetailAliasPath("clxxxxxxxxxxxxxxxxxxxxxxxx"), "/repairs/clxxxxxxxxxxxxxxxxxxxxxxxx");
});

test("facility-local timestamps format without throwing", () => {
  const formatted = formatIssueTimestamp(
    new Date("2026-07-12T16:30:00.000Z"),
    "America/New_York",
  );
  assert.ok(formatted.length > 4);
  assert.equal(formatIssueTimestamp(null), "—");
});

test("next action and recovery phrases follow lifecycle", () => {
  assert.match(
    resolveIssueNextAction({
      status: RepairStatus.OPEN,
      assignedEmployeeId: null,
    }),
    /Assign/i,
  );
  assert.match(
    resolveIssueRecoveryStatePhrase({
      status: RepairStatus.IN_PROGRESS,
    }),
    /Work in progress/i,
  );
  assert.match(
    resolveIssueImpactSummary({
      priority: RepairPriority.MEDIUM,
      status: RepairStatus.OPEN,
    }),
    /Routine/i,
  );
  assert.match(
    resolveIssueImpactSummary({
      priority: RepairPriority.URGENT,
      status: RepairStatus.COMPLETED,
    }),
    /completed/i,
  );
});
