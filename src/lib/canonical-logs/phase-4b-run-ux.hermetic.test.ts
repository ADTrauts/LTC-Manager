import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveWindowProductState,
  mapEvidenceStateToProductState,
  productStateLabel,
} from "@/lib/logs-architecture/due-state";
import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import { resolveLogRequirementsForAttachment } from "./resolve-log-requirements";
import {
  formatRunTimingContext,
  groupRunLogRequirements,
  presentRunLogRequirement,
  type RunLogRequirementView,
} from "./run-presentation";

function coolerAttachment() {
  const windows = daypartWindowsForCadence("TWICE_DAILY");
  return {
    id: "att1",
    stableKey: "att_cooler_1",
    facilityId: "f1",
    departmentId: "d1",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
    status: "ACTIVE" as const,
    effectiveFrom: new Date("2026-09-13T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS" as const,
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [] as number[],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: "Walk-In #2 Temperature",
    localInstructions: "Probe beside unit.",
    targetKind: "ASSET" as const,
    assetId: "cooler-1",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    dailyWindows: windows.map((w, i) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
      displaySequence: (i + 1) * 10,
    })),
    cycleSelections: [] as Array<{ cycleStableKey: string; displaySequence: number }>,
    catalogDefinition: {
      id: "cat1",
      name: "Cooler Temperature Log",
      purposeType: "LOG" as const,
      instructions: "Check cooler.",
      status: "PUBLISHED" as const,
      fields: [
        {
          fieldKey: "cooler_temperature",
          label: "Cooler temperature",
          fieldType: "TEMPERATURE" as const,
          isRequired: true,
          displaySequence: 10,
          helpText: null,
          unitLabel: "°F",
          minNumber: 33,
          maxNumber: 41,
          allowedSelections: [] as string[],
          correctiveActionTrigger: true,
          correctiveActionRequired: true,
        },
      ],
    },
  };
}

test("product states use staff language — NOT_CONFIRMED → Overdue", () => {
  assert.equal(productStateLabel("DUE"), "Due");
  assert.equal(mapEvidenceStateToProductState("NOT_CONFIRMED").productState, "OVERDUE");
  assert.equal(
    mapEvidenceStateToProductState("COMPLETED_WITH_CORRECTIVE_ACTION").productState,
    "COMPLETED_WITH_EXCEPTION",
  );
  assert.equal(mapEvidenceStateToProductState("NEEDS_REVIEW").productState, "COMPLETED_WITH_EXCEPTION");
});

test("cooler morning/afternoon requirements are independent; MealType absent", () => {
  const morningDuring = new Date("2026-09-13T12:00:00.000Z"); // ~8am ET
  const reqs = resolveLogRequirementsForAttachment({
    attachment: coolerAttachment(),
    operationalDateKey: "2026-09-13",
    now: morningDuring,
    facilityTimezone: "America/New_York",
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r) => r.cycleLabel === "Morning" || r.cycleLabel === "Afternoon"));
  assert.ok(reqs.every((r) => !JSON.stringify(r).includes("MealType")));

  const morning = reqs.find((r) => r.cycleLabel === "Morning")!;
  const afternoon = reqs.find((r) => r.cycleLabel === "Afternoon")!;
  assert.ok(["DUE", "UPCOMING", "OVERDUE"].includes(morning.productState));
  assert.notEqual(morning.requirementKey, afternoon.requirementKey);

  const afterMorningDone = resolveLogRequirementsForAttachment({
    attachment: coolerAttachment(),
    operationalDateKey: "2026-09-13",
    now: morningDuring,
    facilityTimezone: "America/New_York",
    publishedCycles: [],
    existingRecords: [
      {
        id: "rec1",
        requirementKey: morning.requirementKey,
        logRequirementKey: morning.requirementKey,
        status: "COMPLETED",
      },
    ],
  });
  const morningDone = afterMorningDone.find((r) => r.cycleLabel === "Morning")!;
  const afternoonStill = afterMorningDone.find((r) => r.cycleLabel === "Afternoon")!;
  assert.equal(morningDone.productState, "COMPLETED");
  assert.notEqual(afternoonStill.productState, "COMPLETED");
});

test("dishwasher cycle requirements use cycle labels not MealType", () => {
  const cycles = [
    {
      stableKey: "breakfast",
      label: "Breakfast",
      startLocal: "06:00",
      endLocal: "10:00",
      overnight: false,
      startsAt: new Date("2026-09-13T10:00:00.000Z"),
      endsAt: new Date("2026-09-13T14:00:00.000Z"),
    },
    {
      stableKey: "lunch",
      label: "Lunch",
      startLocal: "11:00",
      endLocal: "14:00",
      overnight: false,
      startsAt: new Date("2026-09-13T15:00:00.000Z"),
      endsAt: new Date("2026-09-13T18:00:00.000Z"),
    },
    {
      stableKey: "dinner",
      label: "Dinner",
      startLocal: "16:00",
      endLocal: "20:00",
      overnight: false,
      startsAt: new Date("2026-09-13T20:00:00.000Z"),
      endsAt: new Date("2026-09-14T00:00:00.000Z"),
    },
  ];

  const attachment = {
    ...coolerAttachment(),
    timingMode: "OPERATIONAL_CYCLE" as const,
    dailyWindows: [],
    cycleSelections: cycles.map((c, i) => ({
      cycleStableKey: c.stableKey,
      displaySequence: (i + 1) * 10,
    })),
    catalogDefinition: {
      ...coolerAttachment().catalogDefinition,
      name: "Low-Temperature Chemical Dishwasher Log",
    },
    localDisplayLabel: null,
  };

  const reqs = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now: new Date("2026-09-13T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    publishedCycles: cycles,
    existingRecords: [],
  });
  assert.equal(reqs.length, 3);
  assert.deepEqual(
    reqs.map((r) => r.cycleLabel).sort(),
    ["Breakfast", "Dinner", "Lunch"],
  );
  assert.ok(!JSON.stringify(reqs).includes("MealType"));
  assert.ok(!JSON.stringify(reqs).includes("BREAKFAST"));
});

test("missing published cycle yields Needs setup — no silent remap", () => {
  const attachment = {
    ...coolerAttachment(),
    timingMode: "OPERATIONAL_CYCLE" as const,
    dailyWindows: [],
    cycleSelections: [{ cycleStableKey: "ghost", displaySequence: 10 }],
  };
  const reqs = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-13",
    now: new Date("2026-09-13T12:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(reqs[0]!.productState, "NEEDS_SETUP");
});

test("RUN card presentation prefers local label and Due now copy", () => {
  const reqs = resolveLogRequirementsForAttachment({
    attachment: coolerAttachment(),
    operationalDateKey: "2026-09-13",
    now: new Date("2026-09-13T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    publishedCycles: [],
    existingRecords: [],
  });
  const morning = reqs.find((r) => r.cycleLabel === "Morning")!;
  // Force due for presentation check
  const dueReq = {
    ...morning,
    productState: "DUE" as const,
    productStateLabel: "Due",
  };
  const view = presentRunLogRequirement({
    requirement: dueReq,
    catalogDefinitionName: "Cooler Temperature Log",
    localDisplayLabel: "Walk-In #2 Temperature",
    localInstructions: "Probe beside unit.",
    catalogInstructions: "Check cooler.",
    targetLabel: "Naval Park → Reach-In Cooler #1",
    isManager: true,
  });
  assert.equal(view.displayName, "Walk-In #2 Temperature");
  assert.equal(view.catalogDefinitionName, "Cooler Temperature Log");
  assert.equal(view.stateLabel, "Due now");
  assert.equal(view.primaryActionLabel, "Open Log");
  assert.match(view.timingContextLabel, /Morning/);
  assert.doesNotMatch(view.timingContextLabel, /DAILY_WINDOWS|MealType/);
});

test("grouping orders Overdue / Due / Upcoming / Completed", () => {
  const base: Omit<RunLogRequirementView, "productState" | "stateLabel" | "requirementKey"> = {
    attachmentId: "a",
    departmentId: "d",
    operationalDateKey: "2026-09-13",
    displayName: "Log",
    catalogDefinitionName: "Log",
    purposeType: "LOG",
    targetLabel: "Target",
    timingContextLabel: "Morning",
    emphasis: "quiet",
    primaryActionLabel: null,
    openHref: null,
    viewRecordHref: null,
    buildSettingsHref: null,
    localInstructions: null,
    catalogInstructions: null,
    showLocalInstructionsOnCard: false,
    cycleStableKey: null,
    cycleLabel: "Morning",
    windowStartLocal: null,
    windowEndLocal: null,
    windowStartsAt: null,
    windowEndsAt: null,
    recordId: null,
    fields: [],
    isAdHoc: false,
  };
  const items: RunLogRequirementView[] = [
    { ...base, requirementKey: "u", productState: "UPCOMING", stateLabel: "Upcoming" },
    { ...base, requirementKey: "c", productState: "COMPLETED", stateLabel: "Completed" },
    { ...base, requirementKey: "o", productState: "OVERDUE", stateLabel: "Overdue", emphasis: "strong" },
    { ...base, requirementKey: "d", productState: "DUE", stateLabel: "Due now", emphasis: "strong" },
  ];
  const groups = groupRunLogRequirements(items, []);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["overdue", "due", "upcoming", "completed"],
  );
});

test("window progression Upcoming → Due → Overdue", () => {
  const start = new Date("2026-09-13T10:00:00.000Z");
  const end = new Date("2026-09-13T14:00:00.000Z");
  assert.equal(
    deriveWindowProductState({
      now: new Date("2026-09-13T09:00:00.000Z"),
      windowStartsAt: start,
      windowEndsAt: end,
      isAdHoc: false,
    }),
    "UPCOMING",
  );
  assert.equal(
    deriveWindowProductState({
      now: new Date("2026-09-13T12:00:00.000Z"),
      windowStartsAt: start,
      windowEndsAt: end,
      isAdHoc: false,
    }),
    "DUE",
  );
  assert.equal(
    deriveWindowProductState({
      now: new Date("2026-09-13T15:00:00.000Z"),
      windowStartsAt: start,
      windowEndsAt: end,
      isAdHoc: false,
    }),
    "OVERDUE",
  );
});

test("timing context formatting stays product-facing", () => {
  assert.equal(formatRunTimingContext({ cycleLabel: "Breakfast", windowStartLocal: null, windowEndLocal: null }), "Breakfast");
  assert.match(
    formatRunTimingContext({
      cycleLabel: null,
      windowLabel: "Morning",
      windowStartLocal: "05:00",
      windowEndLocal: "11:00",
    }),
    /Morning · 5:00 AM–11:00 AM/,
  );
});
