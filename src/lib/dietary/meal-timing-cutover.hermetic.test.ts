import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { keyPointActualAppendDecision } from "@/lib/operational-cycles/cycle-canonical";

import {
  dietaryMealTimingUpgradeRequired,
  dietaryTimingWriteTarget,
  planDietaryTimingUpgrade,
  selectAuthoritativeLegacyMilestones,
  selectDietaryMealTimingModel,
  selectMealTimingFacts,
} from "./meal-timing";

const legacyBreakfast = {
  stableKey: "breakfast",
  nodeKind: "PERIOD" as const,
  mealType: "BREAKFAST",
  expectedMilestones: ["READY", "SERVICE_STARTED"],
  parentStableKey: null,
  version: 3,
};

test("a legacy published Breakfast Cycle keeps the legacy writer only", () => {
  for (const eventType of ["READY", "STARTED"] as const) {
    const model = selectDietaryMealTimingModel({
      mealType: "BREAKFAST",
      eventType,
      effectiveCycles: [legacyBreakfast],
    });
    assert.equal(model, "LEGACY_MILESTONES");
    assert.equal(dietaryTimingWriteTarget(model), "legacy");
  }
});

test("canonical Key Points use the canonical writer only", () => {
  const cycles = [
    legacyBreakfast,
    { stableKey: "breakfast_ready", nodeKind: "KEY_TIME" as const, version: 1 },
    { stableKey: "breakfast_service_started", nodeKind: "KEY_TIME" as const, version: 1 },
  ];
  assert.equal(
    selectDietaryMealTimingModel({
      mealType: "BREAKFAST",
      eventType: "READY",
      effectiveCycles: cycles,
    }),
    "CANONICAL_KEY_POINTS",
  );
  assert.equal(
    dietaryTimingWriteTarget(
      selectDietaryMealTimingModel({
        mealType: "BREAKFAST",
        eventType: "STARTED",
        effectiveCycles: cycles,
      }),
    ),
    "canonical",
  );
});

test("effective date chooses the writer even when both stores have rows", () => {
  const legacyFacts = [{ milestone: "SERVICE_STARTED" as const, occurredAt: "08:07" }];
  const canonicalFacts = [{ actualLocal: "08:17" }];
  const october4 = selectMealTimingFacts({
    mealType: "BREAKFAST",
    eventType: "STARTED",
    effectiveCycles: [legacyBreakfast],
    canonical: canonicalFacts,
    legacy: legacyFacts,
  });
  assert.equal(october4.model, "LEGACY_MILESTONES");
  assert.equal(october4.legacy.length, 1);
  assert.equal(october4.canonical.length, 0);
  const october5 = selectMealTimingFacts({
    mealType: "BREAKFAST",
    eventType: "STARTED",
    effectiveCycles: [
      { ...legacyBreakfast, version: 4 },
      { stableKey: "breakfast_service_started", nodeKind: "KEY_TIME" as const, version: 1 },
    ],
    canonical: canonicalFacts,
    legacy: legacyFacts,
  });
  assert.equal(october5.model, "CANONICAL_KEY_POINTS");
  assert.equal(october5.canonical.length, 1);
  assert.equal(october5.legacy.length, 0);
  const shown = selectAuthoritativeLegacyMilestones(
    [
      { mealType: "BREAKFAST", milestone: "SERVICE_STARTED", occurredAt: "08:07" },
    ],
    [legacyBreakfast],
  );
  assert.equal(shown.length, 1);
  const hidden = selectAuthoritativeLegacyMilestones(
    [
      { mealType: "BREAKFAST", milestone: "SERVICE_STARTED", occurredAt: "08:07" },
    ],
    [
      { ...legacyBreakfast, version: 4 },
      { stableKey: "breakfast_service_started", nodeKind: "KEY_TIME" as const, version: 1 },
    ],
  );
  assert.equal(hidden.length, 0);
});

test("a custom Cycle without legacy Dietary timing is not configured", () => {
  const model = selectDietaryMealTimingModel({
    mealType: "BREAKFAST",
    eventType: "STARTED",
    effectiveCycles: [
      {
        stableKey: "staff_meal",
        nodeKind: "PERIOD",
        mealType: null,
        expectedMilestones: [],
        parentStableKey: null,
      },
    ],
  });
  assert.equal(model, "NOT_CONFIGURED");
  assert.equal(dietaryTimingWriteTarget(model), "none");
});

test("timing upgrade drafts the missing Key Points once and leaves the published predecessor", () => {
  const first = planDietaryTimingUpgrade({
    effectiveCycles: [legacyBreakfast],
    occupiedStableKeys: ["breakfast"],
    draftStableKeys: [],
  });
  assert.deepEqual(first.forkStableKeys, ["breakfast"]);
  assert.deepEqual(
    first.createPlans.map((plan) => plan.stableKey),
    ["breakfast_due", "breakfast_ready", "breakfast_service_started"],
  );
  const started = first.createPlans.find((plan) => plan.stableKey === "breakfast_service_started");
  assert.equal(started?.occurrenceTracking, "REQUIRED");
  const second = planDietaryTimingUpgrade({
    effectiveCycles: [legacyBreakfast],
    occupiedStableKeys: ["breakfast", ...first.createPlans.map((plan) => plan.stableKey)],
    draftStableKeys: ["breakfast"],
  });
  assert.deepEqual(second.forkStableKeys, []);
  assert.deepEqual(second.createPlans, []);
  assert.equal(dietaryMealTimingUpgradeRequired([legacyBreakfast]), true);
  assert.equal(
    dietaryMealTimingUpgradeRequired([
      legacyBreakfast,
      { stableKey: "breakfast_ready", nodeKind: "KEY_TIME" },
      { stableKey: "breakfast_service_started", nodeKind: "KEY_TIME" },
    ]),
    false,
  );
});

test("standard Run load does not enable createIfMissing", () => {
  const files = [
    "src/lib/operational-cycles/load-employee-cycle-context.ts",
    "src/lib/operational-cycles/load-supervisor-cycle-overview.ts",
    "src/lib/operational-cycles/load-run-operation-presentation.ts",
    "src/lib/offline/build-runtime-bundle.ts",
    "src/lib/servery/record-milestone.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /createIfMissing:\s*true/, file);
  }
});

test("Record time cannot append a second original Key Point actual", () => {
  assert.equal(keyPointActualAppendDecision({ existingCount: 0 }), "create");
  assert.equal(
    keyPointActualAppendDecision({ existingCount: 1, correctionReason: null }),
    "already_recorded",
  );
  assert.equal(
    keyPointActualAppendDecision({ existingCount: 1, correctionReason: "entry error" }),
    "correct",
  );
  const source = readFileSync(
    join(process.cwd(), "src/lib/operational-cycles/key-time-day-actions.ts"),
    "utf8",
  );
  assert.match(source, /keyPointActualAppendDecision/);
  assert.match(source, /operationalCycleKeyPointActual\.create/);
});
