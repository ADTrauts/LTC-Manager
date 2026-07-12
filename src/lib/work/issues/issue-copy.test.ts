import assert from "node:assert/strict";
import test from "node:test";

import { IssueType, RepairPriority, RepairStatus } from "@prisma/client";

import { formatIssueTimestamp } from "@/lib/work/issues/format-issue-time";
import {
  getIssueCopy,
  issueDetailPath,
  issueTypeDisplayLabel,
  issueTypeIconKey,
  mapRepairStatusToRecoveryStage,
  recoveryStageLabel,
  repairDetailAliasPath,
  resolveIssueImpactSummary,
  resolveIssueNextAction,
  resolveIssueRecoveryStatePhrase,
} from "@/lib/work/issues/issue-copy";

test("issue type copy is operator-friendly for each IssueType", () => {
  assert.equal(issueTypeDisplayLabel(IssueType.EQUIPMENT), "Equipment issue");
  assert.equal(issueTypeDisplayLabel(IssueType.SUPPLY_SHORT), "Supply shortage");
  assert.equal(issueTypeDisplayLabel(IssueType.ENVIRONMENT), "Environmental issue");
  assert.equal(issueTypeDisplayLabel(IssueType.SAFETY), "Safety issue");
  assert.equal(issueTypeDisplayLabel(IssueType.SERVICE_DISRUPTION), "Service disruption");
  assert.equal(issueTypeDisplayLabel(IssueType.OTHER), "Operational issue");

  assert.match(getIssueCopy(IssueType.SUPPLY_SHORT).inProgressPhrase, /Restocking/i);
  assert.match(getIssueCopy(IssueType.SUPPLY_SHORT).resolvedPhrase, /Supply restored/i);
  assert.match(getIssueCopy(IssueType.EQUIPMENT).inProgressPhrase, /Repair in progress/i);
  assert.equal(issueTypeIconKey(IssueType.SAFETY), "warning");
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
    mapRepairStatusToRecoveryStage({ status: RepairStatus.WAITING_PARTS }),
    "WAITING",
  );
  assert.equal(mapRepairStatusToRecoveryStage({ status: RepairStatus.CLOSED }), "RESOLVED");
  assert.equal(recoveryStageLabel("WAITING"), "Waiting");
});

test("canonical and alias issue paths", () => {
  assert.equal(issueDetailPath("clxxxxxxxxxxxxxxxxxxxxxxxx"), "/issues/clxxxxxxxxxxxxxxxxxxxxxxxx");
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
      issueType: IssueType.SUPPLY_SHORT,
      status: RepairStatus.OPEN,
      assignedEmployeeId: null,
    }),
    /Assign/i,
  );
  assert.match(
    resolveIssueRecoveryStatePhrase({
      issueType: IssueType.SUPPLY_SHORT,
      status: RepairStatus.IN_PROGRESS,
    }),
    /Restocking/i,
  );
  assert.match(
    resolveIssueImpactSummary({
      issueType: IssueType.SUPPLY_SHORT,
      priority: RepairPriority.MEDIUM,
      status: RepairStatus.OPEN,
    }),
    /Routine/i,
  );
  assert.match(
    resolveIssueImpactSummary({
      issueType: IssueType.EQUIPMENT,
      priority: RepairPriority.URGENT,
      status: RepairStatus.CLOSED,
    }),
    /restored/i,
  );
});
