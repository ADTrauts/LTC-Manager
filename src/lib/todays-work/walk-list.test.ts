import assert from "node:assert/strict";
import test from "node:test";

import { UnitType } from "@prisma/client";

import { computeUnitReadiness } from "@/lib/readiness";
import type { OperationsCenterUnitCard } from "@/lib/operations-center";
import type { UnitReadiness } from "@/lib/readiness/types";
import { buildWalkListItems, resolveWalkListReason, summarizeWalkList } from "@/lib/todays-work/walk-list";

function card(partial: Partial<OperationsCenterUnitCard> & Pick<OperationsCenterUnitCard, "id" | "name">): OperationsCenterUnitCard {
  return {
    unitType: UnitType.SERVERY,
    hasDietary: true,
    expected: 0,
    completed: 0,
    failed: 0,
    missed: 0,
    pending: 0,
    mealTimes: [],
    staffingCount: 1,
    openRepairCount: 0,
    ...partial,
  };
}

function readinessMapFromCards(
  cards: OperationsCenterUnitCard[],
  operationPhase: "Preparation" | "Execution" = "Execution",
): Map<string, UnitReadiness> {
  return new Map(
    cards.map((unit) => {
      const readiness = computeUnitReadiness(
        {
          unitId: unit.id,
          unitName: unit.name,
          unitType: unit.unitType,
          failed: unit.failed,
          missed: unit.missed,
          pending: unit.pending,
          expected: unit.expected,
          completed: unit.completed,
          staffingCount: unit.staffingCount,
          openRepairCount: unit.openRepairCount,
          urgentRepairCount: 0,
          highRepairCount: 0,
          serveryMealNotLive: false,
          operationPhase,
        },
        { minutesUntilService: -15, now: new Date("2026-07-08T08:00:00") },
      );
      return [unit.id, readiness] as const;
    }),
  );
}

test("buildWalkListItems orders blocked before in-progress before ready", () => {
  const cards = [
    card({ id: "ready", name: "Zebra Ready", expected: 1, completed: 1 }),
    card({ id: "blocked", name: "Alpha Blocked", failed: 2, expected: 2, completed: 0 }),
    card({ id: "progress", name: "Beta Progress", pending: 1, expected: 2, completed: 1 }),
  ];
  const items = buildWalkListItems(cards, readinessMapFromCards(cards));

  assert.deepEqual(
    items.map((item) => item.unitId),
    ["blocked", "progress", "ready"],
  );
  assert.equal(items[0]?.status, "blocked");
  assert.equal(items[1]?.status, "in_progress");
  assert.equal(items[2]?.status, "ready");
});

test("buildWalkListItems ranks higher attention first within the same status", () => {
  const cards = [
    card({ id: "mild", name: "Mild", failed: 1, expected: 2 }),
    card({ id: "severe", name: "Severe", failed: 3, missed: 1, expected: 4 }),
  ];
  const items = buildWalkListItems(cards, readinessMapFromCards(cards));

  assert.equal(items[0]?.unitId, "severe");
  assert.equal(items[1]?.unitId, "mild");
});

test("resolveWalkListReason prefers failed logs then staffing then repairs", () => {
  assert.match(resolveWalkListReason(card({ id: "a", name: "A", failed: 2 }), "blocked"), /failed log/);
  assert.match(
    resolveWalkListReason(card({ id: "b", name: "B", staffingCount: 0, unitType: UnitType.SERVERY }), "blocked"),
    /no staff coverage/i,
  );
  assert.match(
    resolveWalkListReason(card({ id: "c", name: "C", openRepairCount: 2, expected: 0 }), "in_progress"),
    /open repair/,
  );
});

test("summarizeWalkList counts buckets", () => {
  const cards = [
    card({ id: "1", name: "One", failed: 1 }),
    card({ id: "2", name: "Two", pending: 1, expected: 1 }),
    card({ id: "3", name: "Three", expected: 1, completed: 1 }),
  ];
  const summary = summarizeWalkList(buildWalkListItems(cards, readinessMapFromCards(cards)));
  assert.equal(summary.total, 3);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.inProgress, 1);
  assert.equal(summary.ready, 1);
});
