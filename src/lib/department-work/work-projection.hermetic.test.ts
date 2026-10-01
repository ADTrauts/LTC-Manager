import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildOccurrenceKey } from "./occurrence-key";
import { isWorkPlanEffectiveOnDate, resolveWorkRequirements } from "./resolve-requirements";
import type {
  PublishedCycleWindowForWorkResolve,
  PublishedWorkPlanForResolve,
} from "./types";
import { buildWorkPlanPresetDraft } from "./work-presets";

function item(
  overrides: Partial<PublishedWorkPlanForResolve["items"][number]> &
    Pick<PublishedWorkPlanForResolve["items"][number], "id" | "itemKey" | "label">,
): PublishedWorkPlanForResolve["items"][number] {
  return {
    instructions: null,
    displaySequence: 10,
    priority: "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKeys: [],
    windowStartLocal: null,
    windowEndLocal: null,
    dueOffsetKind: null,
    dueOffsetMinutes: null,
    roleKeys: [],
    unitId: null,
    spaceId: null,
    assetId: null,
    knowledgeArticleId: null,
    procedureTitleSnapshot: null,
    linkedTemplateStableKey: null,
    linkedTemplateId: null,
    supervisorVisible: true,
    ...overrides,
  };
}

function plan(
  overrides: Partial<PublishedWorkPlanForResolve> &
    Pick<PublishedWorkPlanForResolve, "id" | "stableKey" | "name" | "items">,
): PublishedWorkPlanForResolve {
  return {
    version: 1,
    status: "PUBLISHED",
    effectiveStartDate: null,
    effectiveEndDate: null,
    weekdays: [],
    applicabilities: [
      {
        kind: "DEPARTMENT_UNIT",
        unitId: null,
        spaceId: null,
        spaceType: null,
        assetId: null,
        assetType: null,
      },
    ],
    ...overrides,
  };
}

function breakfastWindow(
  overrides: Partial<PublishedCycleWindowForWorkResolve> = {},
): PublishedCycleWindowForWorkResolve {
  return {
    stableKey: "breakfast",
    label: "Breakfast",
    startLocal: "06:00",
    endLocal: "09:00",
    startsAt: new Date("2026-09-27T10:00:00.000Z"),
    endsAt: new Date("2026-09-27T13:00:00.000Z"),
    departmentWide: false,
    participatingUnitIds: ["naval", "lighthouse"],
    participatingSpaceIds: [],
    ...overrides,
  };
}

const mealSupport = plan({
  id: "plan_mss",
  stableKey: "meal_service_support",
  name: "Meal Service Support",
  items: [
    item({
      id: "tray",
      itemKey: "tray_line_check",
      label: "Tray line check",
      scheduleKind: "OPERATIONAL_CYCLE",
      // Existing facility-owned binding to meal Cycle roots (pre-Service-Phase preset).
      cycleStableKeys: ["breakfast", "lunch", "dinner"],
    }),
  ],
});

function breakfastServiceWindow(
  overrides: Partial<PublishedCycleWindowForWorkResolve> = {},
): PublishedCycleWindowForWorkResolve {
  return {
    stableKey: "breakfast_service",
    label: "Service",
    startLocal: "07:10",
    endLocal: "09:00",
    startsAt: new Date("2026-09-27T11:10:00.000Z"),
    endsAt: new Date("2026-09-27T13:00:00.000Z"),
    departmentWide: false,
    participatingUnitIds: ["naval", "lighthouse"],
    participatingSpaceIds: [],
    ...overrides,
  };
}

const mealSupportServicePhase = plan({
  id: "plan_mss_service",
  stableKey: "meal_service_support",
  name: "Meal Service Support",
  applicabilities: [operationalTypeApp("servery")],
  items: [
    item({
      id: "tray",
      itemKey: "tray_line_check",
      label: "Tray line check",
      scheduleKind: "OPERATIONAL_CYCLE",
      cycleStableKeys: ["breakfast_service", "lunch_service", "dinner_service"],
    }),
  ],
});

test("Dietary presets bind Opening→Prep, Meal Support→Service, Closing→Cleanup", () => {
  const opening = buildWorkPlanPresetDraft("SERVERY_OPENING_CHECKS");
  const support = buildWorkPlanPresetDraft("MEAL_SERVICE_SUPPORT");
  const closing = buildWorkPlanPresetDraft("SERVERY_CLOSING_CHECKS");

  assert.deepEqual(opening.items[0]!.cycleStableKeys, ["breakfast_prep"]);
  assert.deepEqual(opening.items[1]!.cycleStableKeys, ["breakfast_prep"]);
  assert.deepEqual(support.items[0]!.cycleStableKeys, [
    "breakfast_service",
    "lunch_service",
    "dinner_service",
  ]);
  assert.deepEqual(support.items[1]!.cycleStableKeys, [
    "breakfast_service",
    "lunch_service",
    "dinner_service",
  ]);
  assert.deepEqual(closing.items[0]!.cycleStableKeys, [
    "breakfast_cleanup",
    "lunch_cleanup",
    "dinner_cleanup",
  ]);
  assert.equal(closing.items[1]!.scheduleKind, "ONCE_PER_OPERATIONAL_DATE");
  assert.deepEqual(closing.items[1]!.cycleStableKeys ?? [], []);
  // Superseded: new Dietary presets targeted operational type "servery".
  // Product identity is now food_service_area. Published plans that still say servery are unchanged.
  assert.deepEqual(opening.applicabilities, [
    { kind: "OPERATIONAL_TYPE", operationalTypeKey: "food_service_area" },
  ]);
  assert.deepEqual(support.applicabilities, [
    { kind: "OPERATIONAL_TYPE", operationalTypeKey: "food_service_area" },
  ]);
  assert.deepEqual(closing.applicabilities, [
    { kind: "OPERATIONAL_TYPE", operationalTypeKey: "food_service_area" },
  ]);
  const roomClean = buildWorkPlanPresetDraft("ROUTINE_ROOM_CLEAN");
  const commonArea = buildWorkPlanPresetDraft("COMMON_AREA_ROUND");
  const closeout = buildWorkPlanPresetDraft("SHIFT_CLOSEOUT");
  // Superseded: EVS presets used physical SPACE_TYPE. Future drafts use Location Functions.
  assert.deepEqual(roomClean.applicabilities, [
    { kind: "OPERATIONAL_TYPE", operationalTypeKey: "resident_care" },
  ]);
  assert.deepEqual(commonArea.applicabilities, [
    { kind: "OPERATIONAL_TYPE", operationalTypeKey: "service_support" },
  ]);
  assert.equal(closeout.applicabilities?.[0]?.kind, "DEPARTMENT_UNIT");
});

test("Meal Service Support projects to cycle participants with zero assignments", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse", "central"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: new Map([
      ["naval", "Naval Park"],
      ["lighthouse", "Lighthouse"],
      ["central", "Central Terminal"],
    ]),
  });

  const units = reqs.map((r) => r.unitId).sort();
  assert.deepEqual(units, ["lighthouse", "naval"]);
  assert.ok(reqs.every((r) => r.assignedEmployeeId === null));
  assert.ok(reqs.every((r) => r.occurrenceId === null));
  assert.ok(reqs.every((r) => r.cycleStableKey === "breakfast"));
});

test("assignment after projection keeps the same unit-shared occurrence key", () => {
  const before = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  const after = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [{ employeeId: "javier", unitId: "naval", roleKey: "COOK" }],
    existingOccurrences: [],
  });

  const navalBefore = before.find((r) => r.unitId === "naval")!;
  const navalAfter = after.find((r) => r.unitId === "naval")!;
  assert.equal(navalBefore.occurrenceKey, navalAfter.occurrenceKey);
  assert.equal(after.filter((r) => r.unitId === "naval").length, 1);
  assert.ok(after.some((r) => r.unitId === "lighthouse"));
  assert.equal(
    navalBefore.occurrenceKey,
    buildOccurrenceKey({
      sourceKind: "WORK_PLAN",
      workPlanStableKey: "meal_service_support",
      workPlanVersion: 1,
      workItemKey: "tray_line_check",
      operationalDate: "2026-09-27",
      unitId: "naval",
      cycleStableKey: "breakfast",
      windowStartLocal: "06:00",
      windowEndLocal: "09:00",
    }),
  );
});

test("removing assignment does not erase expected unit Work", () => {
  const withAssignment = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [{ employeeId: "javier", unitId: "naval", roleKey: null }],
    existingOccurrences: [],
  });
  const without = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(withAssignment.length, without.length);
  assert.deepEqual(
    withAssignment.map((r) => r.occurrenceKey).sort(),
    without.map((r) => r.occurrenceKey).sort(),
  );
});

test("Dietary-responsible unit without Breakfast participation gets no Breakfast Work", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "central"],
    unitId: "central",
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow({ participatingUnitIds: ["naval"] })],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 0);
});

test("child PERIOD breakfast_prep binds independently of the root", () => {
  const opening = plan({
    id: "open",
    stableKey: "servery_opening",
    name: "Servery Opening Checks",
    items: [
      item({
        id: "stations",
        itemKey: "verify_stations",
        label: "Verify stations ready",
        scheduleKind: "OPERATIONAL_CYCLE",
        cycleStableKeys: ["breakfast_prep"],
      }),
    ],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T09:40:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [opening],
    publishedCycles: [
      breakfastWindow(),
      {
        stableKey: "breakfast_prep",
        label: "Prep",
        startLocal: "05:30",
        endLocal: "07:10",
        startsAt: new Date("2026-09-27T09:30:00.000Z"),
        endsAt: new Date("2026-09-27T11:10:00.000Z"),
        participatingUnitIds: ["naval"],
      },
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.cycleStableKey, "breakfast_prep");
});

test("ONCE_PER_OPERATIONAL_DATE projects without a cycle or assignment", () => {
  const daily = plan({
    id: "daily",
    stableKey: "inventory_count",
    name: "Inventory count",
    applicabilities: [
      {
        kind: "SPECIFIC_UNIT",
        unitId: "plant_shop",
        spaceId: null,
        spaceType: null,
        assetId: null,
        assetType: null,
      },
    ],
    items: [item({ id: "count", itemKey: "count_parts", label: "Count parts" })],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "plant",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["plant_shop", "boiler"],
    publishedPlans: [daily],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.unitId, "plant_shop");
  assert.equal(reqs[0]!.cycleStableKey, null);
});

test("effective dates and weekdays use the service date", () => {
  const tomorrow = plan({
    ...mealSupport,
    id: "future",
    effectiveStartDate: new Date("2026-09-28T00:00:00.000Z"),
  });
  assert.equal(isWorkPlanEffectiveOnDate(tomorrow, "2026-09-27"), false);
  assert.equal(isWorkPlanEffectiveOnDate(tomorrow, "2026-09-28"), true);

  const weekdaysOnly = plan({
    ...mealSupport,
    id: "weekdays",
    weekdays: [1, 2, 3, 4, 5],
  });
  assert.equal(isWorkPlanEffectiveOnDate(weekdaysOnly, "2026-09-27"), false);
  assert.equal(isWorkPlanEffectiveOnDate(weekdaysOnly, "2026-09-28"), true);

  const hidden = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [tomorrow],
    publishedCycles: [breakfastWindow({ participatingUnitIds: ["naval"] })],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(hidden.length, 0);
});

test("one item retains breakfast lunch and dinner windows", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [mealSupport],
    publishedCycles: [
      breakfastWindow({ participatingUnitIds: ["naval"] }),
      {
        stableKey: "lunch",
        label: "Lunch",
        startLocal: "10:00",
        endLocal: "14:00",
        startsAt: new Date("2026-09-27T14:00:00.000Z"),
        endsAt: new Date("2026-09-27T18:00:00.000Z"),
        participatingUnitIds: ["naval"],
      },
      {
        stableKey: "dinner",
        label: "Dinner",
        startLocal: "15:30",
        endLocal: "20:00",
        startsAt: new Date("2026-09-27T19:30:00.000Z"),
        endsAt: new Date("2026-09-28T00:00:00.000Z"),
        participatingUnitIds: ["naval"],
      },
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.deepEqual(reqs.map((r) => r.cycleStableKey).sort(), ["breakfast", "dinner", "lunch"]);
  assert.equal(reqs.length, 3);
});

test("existing completion attaches to the same assignment-independent key", () => {
  const key = buildOccurrenceKey({
    sourceKind: "WORK_PLAN",
    workPlanStableKey: "meal_service_support",
    workPlanVersion: 1,
    workItemKey: "tray_line_check",
    operationalDate: "2026-09-27",
    unitId: "naval",
    cycleStableKey: "breakfast",
    windowStartLocal: "06:00",
    windowEndLocal: "09:00",
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow({ participatingUnitIds: ["naval"] })],
    confirmedAssignments: [],
    existingOccurrences: [
      {
        id: "occ1",
        occurrenceKey: key,
        status: "COMPLETED",
        assignedEmployeeId: null,
        completedByLabel: "Javier",
        completedAt: new Date("2026-09-27T11:20:00.000Z"),
        evidenceRecordId: null,
        sourceKind: "WORK_PLAN",
        workItemLabelSnapshot: "Tray line check",
        instructionsSnapshot: null,
        priority: "ROUTINE",
        unitId: "naval",
        spaceId: null,
        assetId: null,
        dueAt: null,
        windowStartLocal: "06:00",
        windowEndLocal: "09:00",
        cycleStableKey: "breakfast",
        knowledgeArticleId: null,
        procedureTitleSnapshot: null,
        workPlanId: "plan_mss",
        workPlanStableKey: "meal_service_support",
        workPlanVersion: 1,
        workItemId: "tray",
        workItemKey: "tray_line_check",
      },
    ],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.state, "COMPLETED");
  assert.equal(reqs[0]!.occurrenceId, "occ1");
  assert.equal(reqs[0]!.completedByLabel, "Javier");
});

test("NOT_REQUIRED and linked evidence still resolve without assignment", () => {
  const linked = plan({
    id: "temps",
    stableKey: "opening",
    name: "Opening",
    items: [
      item({
        id: "temps",
        itemKey: "confirm_temps",
        label: "Confirm holding temperatures",
        completionMode: "LINKED_EVIDENCE",
        linkedTemplateStableKey: "cooler_temperature_log",
        scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
      }),
    ],
  });
  const skippedKey = buildOccurrenceKey({
    sourceKind: "WORK_PLAN",
    workPlanStableKey: "opening",
    workPlanVersion: 1,
    workItemKey: "confirm_temps",
    operationalDate: "2026-09-27",
    unitId: "naval",
  });
  const skipped = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [linked],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [
      {
        id: "nr1",
        occurrenceKey: skippedKey,
        status: "NOT_REQUIRED",
        assignedEmployeeId: null,
        completedByLabel: null,
        completedAt: null,
        evidenceRecordId: null,
        sourceKind: "WORK_PLAN",
        workItemLabelSnapshot: "Confirm holding temperatures",
        instructionsSnapshot: null,
        priority: "ROUTINE",
        unitId: "naval",
        spaceId: null,
        assetId: null,
        dueAt: null,
        windowStartLocal: null,
        windowEndLocal: null,
        cycleStableKey: null,
        knowledgeArticleId: null,
        procedureTitleSnapshot: null,
        workPlanId: "temps",
        workPlanStableKey: "opening",
        workPlanVersion: 1,
        workItemId: "temps",
        workItemKey: "confirm_temps",
      },
    ],
  });
  assert.equal(skipped[0]!.state, "NOT_REQUIRED");

  const evidenced = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [linked],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
    acceptedEvidence: [
      {
        id: "ev1",
        templateStableKey: "cooler_temperature_log",
        templateId: "t1",
        unitId: "naval",
        status: "COMPLETED",
      },
    ],
  });
  assert.equal(evidenced[0]!.state, "COMPLETED_WITH_EVIDENCE");
  assert.equal(evidenced[0]!.occurrenceId, null);
});

test("SPECIFIC_UNIT applicability still excludes other responsible units", () => {
  const specific = plan({
    ...mealSupport,
    applicabilities: [
      {
        kind: "SPECIFIC_UNIT",
        unitId: "naval",
        spaceId: null,
        spaceType: null,
        assetId: null,
        assetType: null,
      },
    ],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse"],
    publishedPlans: [specific],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.deepEqual(reqs.map((r) => r.unitId), ["naval"]);
});

test("department isolation: EVS plans are not mixed into Dietary resolve input", () => {
  const evs = plan({
    id: "evs",
    stableKey: "routine_room_clean",
    name: "Routine Room Clean",
    items: [item({ id: "surfaces", itemKey: "surfaces", label: "Clean surfaces" })],
  });
  const dietaryOnly = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow({ participatingUnitIds: ["naval"] })],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.ok(dietaryOnly.every((r) => r.workItemKey !== "surfaces"));
  const evsOnly = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "evs",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["nursing"],
    publishedPlans: [evs],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(evsOnly[0]!.workItemKey, "surfaces");
});

test("custom department SPECIFIC_UNIT work still resolves without assignment", () => {
  const aquatics = plan({
    id: "aq",
    stableKey: "opening_checks",
    name: "Opening checks",
    applicabilities: [
      {
        kind: "SPECIFIC_UNIT",
        unitId: "unit_pool",
        spaceId: null,
        spaceType: null,
        assetId: null,
        assetType: null,
      },
    ],
    items: [item({ id: "deck", itemKey: "deck_inspection", label: "Deck inspection" })],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dept_aquatics",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    publishedPlans: [aquatics],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.unitId, "unit_pool");
});

const dietaryFacilityUnits = [
  "main_kitchen",
  "retail",
  "dietitian",
  "naval",
  "lighthouse",
  "central",
] as const;

const dietaryFacilityNames = new Map([
  ["main_kitchen", "Main Kitchen"],
  ["retail", "Retail"],
  ["dietitian", "Dietitian Office"],
  ["naval", "Naval Park"],
  ["lighthouse", "Lighthouse"],
  ["central", "Central Terminal"],
]);

const dietaryFacilitySpaces = [
  { id: "mk-space", spaceType: "PRODUCTION_AREA", unitId: "main_kitchen", operationalTypeKey: "main_kitchen" },
  { id: "retail-space", spaceType: "SERVICE_AREA", unitId: "retail", operationalTypeKey: "retail" },
  { id: "office-space", spaceType: "OFFICE", unitId: "dietitian", operationalTypeKey: "office_support" },
  { id: "naval-space", spaceType: "SERVICE_AREA", unitId: "naval", operationalTypeKey: "servery" },
  { id: "lh-space", spaceType: "SERVICE_AREA", unitId: "lighthouse", operationalTypeKey: "servery" },
  { id: "ct-space", spaceType: "SERVICE_AREA", unitId: "central", operationalTypeKey: "servery" },
];

function operationalTypeApp(key: string) {
  return {
    kind: "OPERATIONAL_TYPE" as const,
    unitId: null,
    spaceId: null,
    spaceType: null,
    assetId: null,
    assetType: null,
    operationalTypeKey: key,
  };
}

test("cycle-free servery Station reset excludes kitchen retail and office", () => {
  const closing = plan({
    id: "plan_close",
    stableKey: "servery_closing_checks",
    name: "Servery Closing Checks",
    applicabilities: [operationalTypeApp("servery")],
    items: [item({ id: "reset", itemKey: "station_reset", label: "Station reset" })],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T22:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: [...dietaryFacilityUnits],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [closing],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: dietaryFacilityNames,
  });
  assert.deepEqual(reqs.map((r) => r.unitId).sort(), ["central", "lighthouse", "naval"]);
  assert.deepEqual(reqs.map((r) => r.spaceId).sort(), ["ct-space", "lh-space", "naval-space"]);
  assert.ok(reqs.every((r) => r.cycleStableKey === null));
  assert.ok(reqs.every((r) => r.occurrenceId === null));
  assert.ok(!reqs.some((r) => r.unitId === "main_kitchen"));
  assert.ok(!reqs.some((r) => r.unitId === "retail"));
  assert.ok(!reqs.some((r) => r.unitId === "dietitian"));
});

test("zero matching operational types yield zero Work with no department-unit fallback", () => {
  const closing = plan({
    id: "plan_close",
    stableKey: "servery_closing_checks",
    name: "Servery Closing Checks",
    applicabilities: [operationalTypeApp("servery")],
    items: [item({ id: "reset", itemKey: "station_reset", label: "Station reset" })],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T22:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["main_kitchen", "retail", "dietitian"],
    spaces: dietaryFacilitySpaces.filter((space) => space.operationalTypeKey !== "servery"),
    publishedPlans: [closing],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 0);
});

test("breakfast servery Work intersects operational type with cycle participation", () => {
  const support = plan({
    ...mealSupport,
    applicabilities: [operationalTypeApp("servery")],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: [...dietaryFacilityUnits],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [support],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: dietaryFacilityNames,
  });
  assert.deepEqual(reqs.map((r) => r.unitId).sort(), ["lighthouse", "naval"]);
  assert.ok(!reqs.some((r) => r.unitId === "central"));
  assert.ok(!reqs.some((r) => r.unitId === "main_kitchen"));
  assert.ok(!reqs.some((r) => r.unitId === "retail"));
  assert.ok(!reqs.some((r) => r.unitId === "dietitian"));
});

test("opening checks use breakfast_prep participation not servery classification", () => {
  const opening = plan({
    id: "open",
    stableKey: "servery_opening",
    name: "Servery Opening Checks",
    applicabilities: [operationalTypeApp("servery")],
    items: [
      item({
        id: "stations",
        itemKey: "verify_stations",
        label: "Verify stations ready",
        scheduleKind: "OPERATIONAL_CYCLE",
        cycleStableKeys: ["breakfast_prep"],
      }),
    ],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T09:40:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: [...dietaryFacilityUnits],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [opening],
    publishedCycles: [
      {
        stableKey: "breakfast_prep",
        label: "Prep",
        startLocal: "05:30",
        endLocal: "07:10",
        startsAt: new Date("2026-09-27T09:30:00.000Z"),
        endsAt: new Date("2026-09-27T11:10:00.000Z"),
        participatingUnitIds: ["naval"],
      },
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.unitId, "naval");
  assert.equal(reqs[0]!.cycleStableKey, "breakfast_prep");
});

test("DEPARTMENT_UNIT still projects to every responsible unit including kitchen", () => {
  const generic = plan({
    id: "generic",
    stableKey: "inventory",
    name: "Inventory",
    items: [item({ id: "count", itemKey: "count", label: "Count stock" })],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: [...dietaryFacilityUnits],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [generic],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.deepEqual(reqs.map((r) => r.unitId).sort(), [...dietaryFacilityUnits].sort());
  assert.ok(reqs.every((r) => r.spaceId === null));
});

test("operational-type Work projects with zero assignments and keeps identity after assignment", () => {
  const closing = plan({
    id: "plan_close",
    stableKey: "servery_closing_checks",
    name: "Servery Closing Checks",
    applicabilities: [operationalTypeApp("servery")],
    items: [item({ id: "reset", itemKey: "station_reset", label: "Station reset" })],
  });
  const before = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T22:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: [...dietaryFacilityUnits],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [closing],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  const after = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T22:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: [...dietaryFacilityUnits],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [closing],
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "javier", unitId: "naval", roleKey: "COOK" }],
    existingOccurrences: [],
  });
  assert.equal(before.length, 3);
  assert.equal(after.length, 3);
  assert.deepEqual(
    before.map((r) => r.occurrenceKey).sort(),
    after.map((r) => r.occurrenceKey).sort(),
  );
  const naval = after.find((r) => r.unitId === "naval")!;
  assert.equal(
    naval.occurrenceKey,
    buildOccurrenceKey({
      sourceKind: "WORK_PLAN",
      workPlanStableKey: "servery_closing_checks",
      workPlanVersion: 1,
      workItemKey: "station_reset",
      operationalDate: "2026-09-27",
      unitId: "naval",
      spaceId: "naval-space",
    }),
  );
  assert.ok(after.some((r) => r.unitId === "lighthouse"));
  assert.ok(after.some((r) => r.unitId === "central"));
});

test("custom department operational-type Work is generic", () => {
  const clinic = plan({
    id: "clinic_rounds",
    stableKey: "clinic_rounds",
    name: "Clinic rounds",
    applicabilities: [operationalTypeApp("treatment_room")],
    items: [item({ id: "round", itemKey: "round", label: "Treatment round" })],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dept_aquatics",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["pool", "clinic"],
    spaces: [
      { id: "pool-deck", spaceType: "PUBLIC_AREA", unitId: "pool", operationalTypeKey: "pool_deck" },
      { id: "tx-1", spaceType: "SERVICE_AREA", unitId: "clinic", operationalTypeKey: "treatment_room" },
    ],
    publishedPlans: [clinic],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.unitId, "clinic");
  assert.equal(reqs[0]!.spaceId, "tx-1");
});

test("SPACE_TYPE PATIENT_ROOM is unchanged beside operational-type Work", () => {
  const spacePlan = plan({
    id: "evs",
    stableKey: "routine_room_clean",
    name: "Routine Room Clean",
    applicabilities: [
      {
        kind: "SPACE_TYPE",
        unitId: null,
        spaceId: null,
        spaceType: "PATIENT_ROOM",
        assetId: null,
        assetType: null,
      },
    ],
    items: [item({ id: "surfaces", itemKey: "surfaces", label: "Clean surfaces" })],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "evs",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["wing-a"],
    spaces: [
      { id: "r1", spaceType: "PATIENT_ROOM", unitId: "wing-a", operationalTypeKey: "occupied_resident_room" },
      { id: "hall", spaceType: "PUBLIC_AREA", unitId: "wing-a", operationalTypeKey: "public_area" },
    ],
    publishedPlans: [spacePlan],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.spaceId, "r1");
});

test("Meal Service Support preset uses Service Phase windows not full meal Cycle", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "kitchen"],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [mealSupportServicePhase],
    publishedCycles: [
      breakfastServiceWindow({
        participatingUnitIds: ["naval"],
        participatingSpaceIds: ["naval-space"],
      }),
      {
        stableKey: "breakfast",
        label: "Breakfast",
        startLocal: "05:30",
        endLocal: "10:00",
        startsAt: new Date("2026-09-27T09:30:00.000Z"),
        endsAt: new Date("2026-09-27T14:00:00.000Z"),
        participatingUnitIds: ["naval"],
        participatingSpaceIds: ["naval-space"],
      },
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.cycleStableKey, "breakfast_service");
  assert.equal(reqs[0]!.windowStartLocal, "07:10");
  assert.equal(reqs[0]!.windowEndLocal, "09:00");
  assert.equal(reqs[0]!.unitId, "naval");
});

test("Service Phase Meal Support yields three independent meal requirements", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [mealSupportServicePhase],
    publishedCycles: [
      breakfastServiceWindow({
        participatingUnitIds: ["naval"],
        participatingSpaceIds: ["naval-space"],
      }),
      {
        stableKey: "lunch_service",
        label: "Service",
        startLocal: "11:30",
        endLocal: "13:30",
        startsAt: new Date("2026-09-27T15:30:00.000Z"),
        endsAt: new Date("2026-09-27T17:30:00.000Z"),
        participatingUnitIds: ["naval"],
        participatingSpaceIds: ["naval-space"],
      },
      {
        stableKey: "dinner_service",
        label: "Service",
        startLocal: "17:00",
        endLocal: "19:00",
        startsAt: new Date("2026-09-27T21:00:00.000Z"),
        endsAt: new Date("2026-09-27T23:00:00.000Z"),
        participatingUnitIds: ["naval"],
        participatingSpaceIds: ["naval-space"],
      },
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.deepEqual(
    reqs.map((r) => r.cycleStableKey).sort(),
    ["breakfast_service", "dinner_service", "lunch_service"],
  );
  assert.equal(reqs.length, 3);
  assert.equal(new Set(reqs.map((r) => r.occurrenceKey)).size, 3);
});

test("existing facility Meal Support bound to breakfast roots remains unchanged", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T11:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow({ participatingUnitIds: ["naval"] })],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.cycleStableKey, "breakfast");
  assert.equal(reqs[0]!.windowStartLocal, "06:00");
  assert.equal(reqs[0]!.windowEndLocal, "09:00");
});

test("missing breakfast_service stable key yields zero requirements without root fallback", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [mealSupportServicePhase],
    publishedCycles: [
      breakfastWindow({
        participatingUnitIds: ["naval"],
        participatingSpaceIds: ["naval-space"],
      }),
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 0);
});

test("renamed Service Phase display label still binds by stableKey", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [mealSupportServicePhase],
    publishedCycles: [
      breakfastServiceWindow({
        label: "Meal Distribution",
        participatingUnitIds: ["naval"],
        participatingSpaceIds: ["naval-space"],
      }),
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.cycleStableKey, "breakfast_service");
});

test("Service Phase Meal Support remains assignment-independent", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T12:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse"],
    spaces: dietaryFacilitySpaces,
    publishedPlans: [mealSupportServicePhase],
    publishedCycles: [
      breakfastServiceWindow({
        participatingUnitIds: ["naval", "lighthouse"],
        participatingSpaceIds: ["naval-space", "lh-space"],
      }),
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r) => r.assignedEmployeeId === null));
});

test("generic nested Phase-bound Work uses Phase window without Dietary branching", () => {
  const guestSupport = plan({
    id: "plan_guest",
    stableKey: "guest_support",
    name: "Guest Support",
    items: [
      item({
        id: "greet",
        itemKey: "greet_guests",
        label: "Guest Support",
        scheduleKind: "OPERATIONAL_CYCLE",
        cycleStableKeys: ["active_service"],
      }),
    ],
  });
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "hospitality",
    operationalDateKey: "2026-09-27",
    now: new Date("2026-09-27T16:00:00.000Z"),
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["lobby"],
    publishedPlans: [guestSupport],
    publishedCycles: [
      {
        stableKey: "morning_operations",
        label: "Morning Operations",
        startLocal: "07:00",
        endLocal: "12:00",
        startsAt: new Date("2026-09-27T11:00:00.000Z"),
        endsAt: new Date("2026-09-27T16:00:00.000Z"),
        participatingUnitIds: ["lobby"],
      },
      {
        stableKey: "active_service",
        label: "Active Service",
        startLocal: "08:00",
        endLocal: "11:00",
        startsAt: new Date("2026-09-27T12:00:00.000Z"),
        endsAt: new Date("2026-09-27T15:00:00.000Z"),
        participatingUnitIds: ["lobby"],
      },
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.cycleStableKey, "active_service");
  assert.equal(reqs[0]!.windowStartLocal, "08:00");
  assert.equal(reqs[0]!.windowEndLocal, "11:00");
});

test("builder preserves multiple cycle checkboxes and defaults Work Plans on with rollback", () => {
  const builder = readFileSync(
    join(process.cwd(), "src/components/department-work/work-plan-builder-panel.tsx"),
    "utf8",
  );
  assert.match(builder, /Recommended work/);
  assert.match(builder, /Create blank Work Plan/);
  assert.match(builder, /cycleStableKeys/);
  assert.doesNotMatch(builder, /cycleStableKeys\?\.\[0\]/);
  assert.match(builder, /work-plan-item-cycles-/);
  assert.match(builder, /work-plan-applies-to/);
  assert.doesNotMatch(builder, /DepartmentRoomArchetype/);

  const flags = readFileSync(join(process.cwd(), "src/lib/feature-flags.ts"), "utf8");
  assert.match(flags, /parseEnvFlag\(process\.env\.DIETARY_WORK_PLANS_ENABLED, true\)/);

  const resolver = readFileSync(
    join(process.cwd(), "src/lib/department-work/resolve-requirements.ts"),
    "utf8",
  );
  assert.doesNotMatch(resolver, /departmentKey === ["']DIETARY["']/);
  assert.doesNotMatch(resolver, /name\.includes\(["']Servery["']\)/);

  const review = readFileSync(
    join(process.cwd(), "src/lib/operational-review/load-operational-review-day-facts.ts"),
    "utf8",
  );
  assert.doesNotMatch(review, /loadPublishedWorkPlansForDate/);
  assert.doesNotMatch(review, /resolveUnitWorkRequirements/);

  const today = readFileSync(join(process.cwd(), "src/app/(protected)/today/page.tsx"), "utf8");
  assert.doesNotMatch(today, /resolveUnitWorkRequirements/);
});
