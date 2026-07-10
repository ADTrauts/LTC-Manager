import assert from "node:assert/strict";
import test from "node:test";

import { UnitType } from "@prisma/client";

import {
  evaluateBlockedRules,
  evaluateInProgressRules,
  requiresStaffingCoverage,
  resolveReadinessReason,
} from "@/lib/readiness/blocked-rules";
import type { UnitReadinessSignals } from "@/lib/readiness/types";

function signals(partial: Partial<UnitReadinessSignals> & Pick<UnitReadinessSignals, "unitId" | "unitName">): UnitReadinessSignals {
  return {
    unitType: UnitType.KITCHEN,
    failed: 0,
    missed: 0,
    pending: 0,
    expected: 0,
    completed: 0,
    staffingCount: 1,
    openRepairCount: 0,
    urgentRepairCount: 0,
    highRepairCount: 0,
    serveryMealNotLive: false,
    operationPhase: "Preparation",
    profileKey: "DIETARY",
    mealLabel: "Breakfast",
    primaryUrgentRepairTitle: null,
    primaryHighRepairTitle: null,
    assignedSignificantRepairCount: 0,
    unassignedUrgentOrHighCount: 0,
    overdueCriticalRepairCount: 0,
    normalPriorityOpenRepairCount: 0,
    assignedNormalRepairCount: 0,
    preventiveMaintenanceInProgressCount: 0,
    requiresEvsCoverage: false,
    ...partial,
  };
}

test("requiresStaffingCoverage applies to serveries and kitchens only", () => {
  assert.equal(requiresStaffingCoverage(UnitType.SERVERY), true);
  assert.equal(requiresStaffingCoverage(UnitType.KITCHEN), true);
  assert.equal(requiresStaffingCoverage(UnitType.RETAIL), false);
});

test("evaluateBlockedRules flags failed required logs", () => {
  const result = evaluateBlockedRules(signals({ unitId: "u1", unitName: "A", failed: 2 }));
  assert.equal(result.blocked, true);
  assert.deepEqual(result.reasonCodes, ["failed_logs"]);
});

test("evaluateBlockedRules flags missed required logs", () => {
  const result = evaluateBlockedRules(signals({ unitId: "u1", unitName: "A", missed: 1 }));
  assert.equal(result.blocked, true);
  assert.deepEqual(result.reasonCodes, ["missed_logs"]);
});

test("evaluateBlockedRules flags urgent and high open repairs", () => {
  assert.deepEqual(
    evaluateBlockedRules(signals({ unitId: "u1", unitName: "A", openRepairCount: 1, urgentRepairCount: 1 })).reasonCodes,
    ["urgent_repair"],
  );
  assert.deepEqual(
    evaluateBlockedRules(signals({ unitId: "u1", unitName: "A", openRepairCount: 1, highRepairCount: 1 })).reasonCodes,
    ["high_repair"],
  );
});

test("evaluateBlockedRules flags zero staffing for serveries and kitchens", () => {
  assert.deepEqual(
    evaluateBlockedRules(
      signals({ unitId: "s1", unitName: "Servery", unitType: UnitType.SERVERY, staffingCount: 0 }),
    ).reasonCodes,
    ["no_staffing"],
  );
  assert.deepEqual(
    evaluateBlockedRules(
      signals({ unitId: "k1", unitName: "Kitchen", unitType: UnitType.KITCHEN, staffingCount: 0 }),
    ).reasonCodes,
    ["no_staffing"],
  );
});

test("evaluateBlockedRules does not flag zero staffing for retail", () => {
  const result = evaluateBlockedRules(
    signals({ unitId: "r1", unitName: "Shop", unitType: UnitType.RETAIL, staffingCount: 0 }),
  );
  assert.equal(result.blocked, false);
  assert.deepEqual(result.reasonCodes, []);
});

test("evaluateBlockedRules stacks multiple blocked reasons in priority order", () => {
  const result = evaluateBlockedRules(
    signals({
      unitId: "u1",
      unitName: "West Servery",
      unitType: UnitType.SERVERY,
      failed: 1,
      missed: 1,
      urgentRepairCount: 1,
      highRepairCount: 1,
      staffingCount: 0,
      openRepairCount: 2,
    }),
  );
  assert.equal(result.blocked, true);
  assert.deepEqual(result.reasonCodes, [
    "failed_logs",
    "missed_logs",
    "urgent_repair",
    "high_repair",
    "no_staffing",
  ]);
});

test("evaluateInProgressRules tracks pending logs and lower-priority repairs", () => {
  const result = evaluateInProgressRules(
    signals({
      unitId: "u1",
      unitName: "Kitchen",
      pending: 2,
      openRepairCount: 2,
      urgentRepairCount: 0,
      highRepairCount: 0,
    }),
  );
  assert.deepEqual(result, ["pending_logs", "open_repair"]);
});

test("evaluateInProgressRules tracks servery meal status during execution", () => {
  const result = evaluateInProgressRules(
    signals({
      unitId: "s1",
      unitName: "Servery",
      unitType: UnitType.SERVERY,
      serveryMealNotLive: true,
      operationPhase: "Execution",
    }),
  );
  assert.deepEqual(result, ["servery_not_live"]);
});

test("resolveReadinessReason returns human-readable blocked and in-progress messages", () => {
  const blockedSignals = signals({ unitId: "u1", unitName: "A", failed: 2 });
  assert.match(
    resolveReadinessReason(blockedSignals, "blocked", ["failed_logs"]),
    /critical checks failed/i,
  );

  const progressSignals = signals({ unitId: "u1", unitName: "A", pending: 1 });
  assert.match(
    resolveReadinessReason(progressSignals, "in_progress", ["pending_logs"]),
    /due now/i,
  );
});
