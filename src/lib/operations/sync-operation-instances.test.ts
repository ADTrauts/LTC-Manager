import assert from "node:assert/strict";
import test from "node:test";

import { MealType } from "@prisma/client";

import {
  buildOperationInstanceCreatePlans,
  hasOperationInstanceForDefinition,
  isSameServiceDate,
  summarizeSyncOperationInstances,
} from "@/lib/operations/sync-operation-instances";

const serviceDate = new Date("2026-07-08T00:00:00");

function definition(partial: {
  id: string;
  label: string;
  isActive?: boolean;
  mealType?: MealType | null;
}) {
  return {
    facilityId: "facility-1",
    departmentId: "dept-1",
    workShiftId: null,
    scheduledStartLocal: "07:30",
    scheduledEndLocal: "09:00",
    isActive: true,
    mealType: MealType.BREAKFAST,
    ...partial,
  };
}

test("buildOperationInstanceCreatePlans creates rows only for active definitions without instances", () => {
  const plans = buildOperationInstanceCreatePlans({
    serviceDate,
    definitions: [
      definition({ id: "def-breakfast", label: "Breakfast" }),
      definition({ id: "def-lunch", label: "Lunch", mealType: MealType.LUNCH }),
      definition({ id: "def-inactive", label: "Inactive", isActive: false }),
    ],
    existing: [{ definitionId: "def-breakfast", serviceDate }],
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.definitionId, "def-lunch");
  assert.equal(plans[0]?.label, "Lunch");
  assert.equal(plans[0]?.serviceDate.getTime(), serviceDate.getTime());
});

test("hasOperationInstanceForDefinition matches service dates on calendar day only", () => {
  const laterSameDay = new Date("2026-07-08T15:30:00");
  assert.equal(isSameServiceDate(serviceDate, laterSameDay), true);
  assert.equal(
    hasOperationInstanceForDefinition("def-breakfast", serviceDate, [
      { definitionId: "def-breakfast", serviceDate: laterSameDay },
    ]),
    true,
  );
  assert.equal(
    hasOperationInstanceForDefinition("def-breakfast", serviceDate, [
      { definitionId: "def-breakfast", serviceDate: new Date("2026-07-09T00:00:00") },
    ]),
    false,
  );
});

test("summarizeSyncOperationInstances reports created and skipped counts", () => {
  const summary = summarizeSyncOperationInstances({
    facilityId: "facility-1",
    serviceDate,
    definitions: [
      definition({ id: "def-breakfast", label: "Breakfast" }),
      definition({ id: "def-lunch", label: "Lunch", mealType: MealType.LUNCH }),
    ],
    existing: [{ definitionId: "def-breakfast", serviceDate }],
    createdCount: 1,
  });

  assert.equal(summary.definitionsConsidered, 2);
  assert.equal(summary.skippedExisting, 1);
  assert.equal(summary.created, 1);
});

test("buildOperationInstanceCreatePlans is idempotent when all active definitions already exist", () => {
  const definitions = [
    definition({ id: "def-breakfast", label: "Breakfast" }),
    definition({ id: "def-lunch", label: "Lunch", mealType: MealType.LUNCH }),
  ];
  const existing = definitions.map((row) => ({ definitionId: row.id, serviceDate }));

  const plans = buildOperationInstanceCreatePlans({
    serviceDate,
    definitions,
    existing,
  });

  assert.equal(plans.length, 0);
});
