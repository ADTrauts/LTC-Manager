import assert from "node:assert/strict";
import test from "node:test";

import { UnitType } from "@prisma/client";

import { evaluateBlockedRules, evaluateInProgressRules } from "@/lib/readiness/blocked-rules";
import type { UnitReadinessSignals } from "@/lib/readiness/types";

function signals(
  partial: Partial<UnitReadinessSignals> & Pick<UnitReadinessSignals, "unitId" | "unitName">,
): UnitReadinessSignals {
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
    profileKey: "NEUTRAL",
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
    evsRoomStatus: null,
    evsRoomStatusUpdatedAt: null,
    evsCriticalRoomCondition: false,
    evsDischargePending: false,
    evsActiveCleaning: false,
    evsRoomServiceComplete: false,
    evsRoomStatusPresent: false,
    outOfServiceAssetCount: 0,
    criticalOutOfServiceCount: 0,
    primaryCriticalOutOfServiceName: null,
    importantOutOfServiceCount: 0,
    primaryImportantOutOfServiceName: null,
    importantOutOfServiceAddressedCount: 0,
    importantOutOfServiceUnaddressedCount: 0,
    routineOutOfServiceCount: 0,
    overdueCriticalPmCount: 0,
    primaryOverdueCriticalPmName: null,
    overdueImportantPmCount: 0,
    overdueRoutinePmCount: 0,
    dueTodayPmScheduleCount: 0,
    pmDueTodayUnderwayElevatedCount: 0,
    significantActivelyWorkedCount: 0,
    urgentNotActivelyWorkedCount: 0,
    primarySignificantInProgressTitle: null,
    ...partial,
  };
}

test("routine open Supply Short (MEDIUM) does not force Needs Attention", () => {
  const blocked = evaluateBlockedRules(
    signals({
      unitId: "u1",
      unitName: "4A",
      openRepairCount: 1,
      urgentRepairCount: 0,
      highRepairCount: 0,
      normalPriorityOpenRepairCount: 1,
    }),
  );
  assert.equal(blocked.blocked, false);
  assert.deepEqual(blocked.reasonCodes, []);

  const inProgress = evaluateInProgressRules(
    signals({
      unitId: "u1",
      unitName: "4A",
      openRepairCount: 1,
      urgentRepairCount: 0,
      highRepairCount: 0,
      normalPriorityOpenRepairCount: 1,
    }),
  );
  assert.ok(inProgress.includes("open_repair"));
});

test("urgent equipment issue still elevates Needs Attention via urgent_repair", () => {
  const blocked = evaluateBlockedRules(
    signals({ unitId: "u1", unitName: "4A", openRepairCount: 1, urgentRepairCount: 1 }),
  );
  assert.ok(blocked.reasonCodes.includes("urgent_repair"));
});

test("HIGH open issue elevates Needs Attention; MEDIUM stays In Progress only", () => {
  const highBlocked = evaluateBlockedRules(
    signals({ unitId: "u1", unitName: "4A", openRepairCount: 1, highRepairCount: 1 }),
  );
  assert.ok(highBlocked.reasonCodes.includes("high_repair"));

  const mediumInProgress = evaluateInProgressRules(
    signals({
      unitId: "u1",
      unitName: "4A",
      openRepairCount: 1,
      urgentRepairCount: 0,
      highRepairCount: 0,
      normalPriorityOpenRepairCount: 1,
    }),
  );
  assert.ok(mediumInProgress.includes("open_repair"));
  assert.equal(
    evaluateBlockedRules(
      signals({
        unitId: "u1",
        unitName: "4A",
        openRepairCount: 1,
        urgentRepairCount: 0,
        highRepairCount: 0,
      }),
    ).blocked,
    false,
  );
});
