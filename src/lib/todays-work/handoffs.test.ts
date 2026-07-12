import assert from "node:assert/strict";
import test from "node:test";

import { MealType, UnitType } from "@prisma/client";

import type { OperationsCenterMealBoard } from "@/lib/operations-center";
import { computeUnitReadiness } from "@/lib/readiness";
import { buildHandoffData, buildHandoffSections, summarizeHandoffs } from "@/lib/todays-work/handoffs";
import { buildWalkListItems } from "@/lib/todays-work/walk-list";

function walkItems() {
  const cards = [
    {
      id: "blocked",
      name: "West Servery",
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
    {
      id: "ready",
      name: "Gift Shop",
      unitType: UnitType.RETAIL,
      hasDietary: false,
      expected: 1,
      completed: 1,
      failed: 0,
      missed: 0,
      pending: 0,
      mealTimes: [],
      staffingCount: 1,
      openRepairCount: 0,
    },
  ];

  const readinessByUnitId = new Map(
    cards.map((unit) => {
      const readiness = computeUnitReadiness({
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
        operationPhase: "Preparation",
      });
      return [unit.id, readiness] as const;
    }),
  );

  return buildWalkListItems(cards, readinessByUnitId);
}

test("buildHandoffSections groups failed logs and open call-downs into immediate follow-up", () => {
  const sections = buildHandoffSections({
    walkListItems: walkItems(),
    coverageItems: [
      {
        unitId: "blocked",
        unitName: "West Servery",
        unitType: UnitType.SERVERY,
        level: "none",
        staffingCount: 0,
        expectedSlots: 3,
        missingShifts: [],
        assignments: [],
        overrideCount: 0,
        reason: "No meal service slots staffed today",
        staffingHref: "/staffing?date=2026-07-08#staffing-unit-blocked",
        unitHref: "/unit/blocked",
      },
    ],
    callDownItems: [
      {
        id: "cd1",
        employeeName: "Pat Server",
        templateKey: "call-off",
        templateLabel: "Call-off",
        reason: "Call-off",
        reasonDetails: null,
        oldUnitId: "blocked",
        oldUnitName: "West Servery",
        newUnitId: "north",
        newUnitName: "North Servery",
        mealType: MealType.LUNCH,
        status: "open",
        statusLabel: "Needs coverage",
        changedAt: new Date(),
        staffingHref: "/staffing?date=2026-07-08#staffing-unit-blocked",
        coverageHref: "/today/coverage",
      },
    ],
    repairs: [
      {
        id: "r1",
        title: "Warmer offline",
        priority: "URGENT",
        unitId: "blocked",
        unitName: "West Servery",
      },
    ],
    mealBoards: [],
    operationContext: {
      mealType: MealType.LUNCH,
      mealLabel: "Lunch",
      serviceLabel: "Lunch service",
      phase: "Preparation",
      scheduledTimeLabel: "11:30 AM",
      minutesUntilService: 20,
    },
  });

  const immediate = sections.find((section) => section.key === "immediate");
  assert.ok(immediate);
  assert.ok(immediate.items.some((item) => item.id === "log-failed:blocked"));
  assert.ok(immediate.items.some((item) => item.id === "call-down:cd1"));
  assert.ok(immediate.items.some((item) => item.id === "coverage:blocked"));
  assert.ok(immediate.items.some((item) => item.id === "repair:r1"));
});

test("buildHandoffSections includes meal service handoffs during execution", () => {
  const mealBoards: OperationsCenterMealBoard[] = [
    {
      meal: MealType.LUNCH,
      rows: [
        {
          unitId: "blocked",
          unitName: "West Servery",
          unitType: UnitType.SERVERY,
          mealTime: "11:30",
          statusLabel: "—",
          isReadyLive: false,
          isStartedLive: false,
        },
      ],
    },
  ];

  const sections = buildHandoffSections({
    walkListItems: walkItems(),
    coverageItems: [],
    callDownItems: [],
    repairs: [],
    mealBoards,
    operationContext: {
      mealType: MealType.LUNCH,
      mealLabel: "Lunch",
      serviceLabel: "Lunch service",
      phase: "Execution",
      scheduledTimeLabel: "11:30 AM",
      minutesUntilService: 0,
    },
  });

  const immediate = sections.find((section) => section.key === "immediate");
  assert.ok(immediate?.items.some((item) => item.id === "meal-service:blocked:LUNCH"));
});

test("buildHandoffData reports a clear state when no handoff items exist", () => {
  const data = buildHandoffData({
    walkListItems: walkItems().filter((item) => item.unitId === "ready"),
    coverageItems: [],
    callDownItems: [],
    repairs: [],
    inspectionFindings: [],
    mealBoards: [],
    operationContext: {
      mealType: MealType.LUNCH,
      mealLabel: "Lunch",
      serviceLabel: "Lunch service",
      phase: "Preparation",
      scheduledTimeLabel: "11:30 AM",
      minutesUntilService: 20,
    },
  });

  assert.equal(data.isClear, true);
  assert.deepEqual(data.summary, { total: 0, critical: 0, high: 0, normal: 0 });
});

test("unresolved inspection findings appear in repairs and inspection findings section", () => {
  const sections = buildHandoffSections({
    walkListItems: walkItems().filter((item) => item.unitId === "ready"),
    coverageItems: [],
    callDownItems: [],
    repairs: [],
    inspectionFindings: [
      {
        id: "task_finding_1",
        title: "Correct failed dishwasher rinse",
        status: "OPEN",
        unitId: "ready",
        unitName: "Gift Shop",
      },
    ],
    mealBoards: [],
    operationContext: {
      mealType: MealType.LUNCH,
      mealLabel: "Lunch",
      serviceLabel: "Lunch service",
      phase: "Preparation",
      scheduledTimeLabel: "11:30 AM",
      minutesUntilService: 20,
    },
  });

  const equipment = sections.find((section) => section.key === "equipment");
  assert.equal(equipment?.title, "Repairs and inspection findings");
  const finding = equipment?.items.find((item) => item.id === "inspection-finding:task_finding_1");
  assert.ok(finding);
  assert.equal(finding?.category, "inspection_finding");
  assert.match(finding?.detail ?? "", /follow-up needed from inspection/i);
  assert.equal(
    finding?.primaryHref,
    "/unit/ready?unitTab=overview&followUpTask=task_finding_1",
  );
});

test("summarizeHandoffs counts priorities across sections", () => {
  const summary = summarizeHandoffs([
    {
      key: "immediate",
      title: "Immediate",
      description: "Now",
      items: [
        {
          id: "1",
          category: "call_down",
          categoryLabel: "Call-down",
          priority: "critical",
          title: "One",
          detail: "Detail",
          unitId: "u1",
          unitName: "Unit 1",
          primaryHref: "/staffing",
          primaryLabel: "Staffing",
        },
      ],
    },
    {
      key: "compliance",
      title: "Compliance",
      description: "Later",
      items: [
        {
          id: "2",
          category: "log_exception",
          categoryLabel: "Log exception",
          priority: "high",
          title: "Two",
          detail: "Detail",
          unitId: "u2",
          unitName: "Unit 2",
          primaryHref: "/logs",
          primaryLabel: "Logs",
        },
      ],
    },
  ]);

  assert.deepEqual(summary, { total: 2, critical: 1, high: 1, normal: 0 });
});
