import assert from "node:assert/strict";
import test from "node:test";

import { IssueType } from "@prisma/client";

import { ISSUE_TYPE_OPTIONS, issueTypeLabel } from "@/lib/repair-routing";
import { buildUnitWorkQueue } from "@/lib/unit-workspace/build-unit-work-queue";
import { UNIT_WORK_QUEUE_PRIORITY } from "@/lib/unit-workspace/work-queue-priority";
import { UnitType } from "@prisma/client";

test("all IssueType values are represented in quick-report options", () => {
  const values = new Set(ISSUE_TYPE_OPTIONS.map((option) => option.value));
  for (const value of Object.values(IssueType)) {
    assert.ok(values.has(value), `missing option for ${value}`);
    assert.ok(issueTypeLabel(value).length > 0);
  }
});

test("urgent issues sort above routine open issues in the unit queue", () => {
  const queue = buildUnitWorkQueue({
    unit: {
      id: "unit-1",
      name: "4A",
      unitType: UnitType.KITCHEN,
      isActive: true,
      mealTimes: [],
    },
    activeLogTab: null,
    mealServiceEventByMeal: new Map(),
    queries: {
      assignments: [],
      submissions: [],
      openRepairs: [
        {
          id: "r-routine",
          repairCode: "R-00002",
          title: "Out of gloves",
          priority: "MEDIUM",
          status: "OPEN",
          issueType: "SUPPLY_SHORT",
          workOrderKind: "CORRECTIVE",
          assignedEmployeeId: null,
          dueAt: null,
          preventiveScheduleId: null,
          assetId: null,
        },
        {
          id: "r-urgent",
          repairCode: "R-00001",
          title: "Dishwasher not heating",
          priority: "URGENT",
          status: "OPEN",
          issueType: "EQUIPMENT",
          workOrderKind: "CORRECTIVE",
          assignedEmployeeId: null,
          dueAt: null,
          preventiveScheduleId: null,
          assetId: null,
        },
      ] as never,
    },
  });

  assert.equal(queue.primaryItem?.id, "repair:r-urgent");
  assert.ok(queue.items.some((item) => item.id === "repair:r-routine"));
  assert.ok(UNIT_WORK_QUEUE_PRIORITY.URGENT_REPAIR < UNIT_WORK_QUEUE_PRIORITY.OTHER_REPAIR);
  assert.match(queue.items.find((item) => item.id === "repair:r-routine")?.detail ?? "", /Supply short/);
});
