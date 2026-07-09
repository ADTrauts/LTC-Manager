import assert from "node:assert/strict";
import test from "node:test";

import { UnitType } from "@prisma/client";

import { getOperationsCenterCardOrder } from "@/lib/operations-center/card-registry";
import { classifyUnitPulseStatus, computeSitePulse } from "@/lib/operations-center/compute-site-pulse";
import type { OperationsCenterUnitCard } from "@/lib/operations-center/types";

test("operations center card registry orders exceptions before secondary content", () => {
  const order = getOperationsCenterCardOrder();
  assert.ok(order.indexOf("unit-exceptions") < order.indexOf("meal-boards"));
  assert.ok(order.indexOf("open-repairs") < order.indexOf("compliance-summary"));
  assert.ok(order.indexOf("staffing-gaps") < order.indexOf("call-downs"));
  assert.ok(order.indexOf("call-downs") < order.indexOf("compliance-summary"));
  assert.ok(order.indexOf("staffing-gaps") < order.indexOf("unit-log-board"));
});

test("computeSitePulse prioritizes blocked locations in headline", () => {
  const units: OperationsCenterUnitCard[] = [
    {
      id: "ready",
      name: "Ready Unit",
      unitType: UnitType.KITCHEN,
      hasDietary: true,
      expected: 1,
      completed: 1,
      failed: 0,
      missed: 0,
      pending: 0,
      mealTimes: [],
      staffingCount: 2,
      openRepairCount: 0,
    },
    {
      id: "blocked",
      name: "Blocked Servery",
      unitType: UnitType.SERVERY,
      hasDietary: true,
      expected: 2,
      completed: 0,
      failed: 1,
      missed: 0,
      pending: 1,
      mealTimes: [],
      staffingCount: 0,
      openRepairCount: 0,
    },
  ];

  assert.equal(classifyUnitPulseStatus(units[1]!), "blocked");
  const pulse = computeSitePulse(units);
  assert.equal(pulse.tone, "blocked");
  assert.match(pulse.headline, /Blocked/);
  assert.equal(pulse.blocked, 1);
  assert.equal(pulse.ready, 1);
});
