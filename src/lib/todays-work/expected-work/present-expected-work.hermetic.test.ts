import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { decideWorkAuthority } from "@/lib/department-work/authority";
import { resolveWorkRequirements } from "@/lib/department-work/resolve-requirements";
import type {
  PublishedCycleWindowForWorkResolve,
  PublishedWorkPlanForResolve,
  WorkRequirement,
} from "@/lib/department-work/types";
import { buildWorkPlanPresetDraft } from "@/lib/department-work/work-presets";

import {
  presentExpectedWorkFromRequirements,
  todaysExpectedWorkHasVisibleWork,
} from "./present-expected-work";

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

function lunchWindow(): PublishedCycleWindowForWorkResolve {
  return {
    stableKey: "lunch",
    label: "Lunch",
    startLocal: "11:30",
    endLocal: "13:30",
    startsAt: new Date("2026-09-27T15:30:00.000Z"),
    endsAt: new Date("2026-09-27T17:30:00.000Z"),
    departmentWide: false,
    participatingUnitIds: ["naval", "lighthouse"],
    participatingSpaceIds: [],
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
      cycleStableKeys: ["breakfast", "lunch", "dinner"],
    }),
    item({
      id: "sanitizer",
      itemKey: "sanitizer_check",
      label: "Sanitizer check",
      completionMode: "LINKED_EVIDENCE",
      linkedTemplateStableKey: "dishwasher_sanitizer_log",
      scheduleKind: "OPERATIONAL_CYCLE",
      cycleStableKeys: ["breakfast", "lunch", "dinner"],
    }),
  ],
});

const stationReset = plan({
  id: "plan_close",
  stableKey: "servery_closing_checks",
  name: "Servery Closing Checks",
  items: [
    item({
      id: "reset",
      itemKey: "station_reset",
      label: "Station reset",
      scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    }),
  ],
});

function resolveMealSupport(now: Date, extra?: Partial<Parameters<typeof resolveWorkRequirements>[0]>) {
  return resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now,
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse"],
    publishedPlans: [mealSupport],
    publishedCycles: [breakfastWindow(), lunchWindow()],
    confirmedAssignments: extra?.confirmedAssignments ?? [],
    existingOccurrences: extra?.existingOccurrences ?? [],
    unitNames: new Map([
      ["naval", "Naval Park"],
      ["lighthouse", "Lighthouse"],
    ]),
    ...extra,
  });
}

const breakfastRun = {
  currentOperations: [
    {
      parentLabel: "Breakfast",
      cycleLabel: "Breakfast",
      phaseLabel: null,
      windowLabel: "6:00–9:00",
      phases: [],
      cycleStableKeys: ["breakfast"],
    },
  ],
  nextOperation: {
    label: "Lunch",
    windowLabel: "11:30–13:30",
    minutesUntil: 270,
    cycleStableKey: "lunch",
  },
};

const betweenRun = {
  currentOperations: [] as typeof breakfastRun.currentOperations,
  nextOperation: breakfastRun.nextOperation,
};

function present(
  requirements: WorkRequirement[],
  overrides: Partial<Parameters<typeof presentExpectedWorkFromRequirements>[0]> = {},
) {
  return presentExpectedWorkFromRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    requirements,
    runPresentation: breakfastRun,
    workCapabilityEnabled: true,
    hasPublishedWorkPlans: true,
    canConfirmWork: true,
    canManageWorkPlans: false,
    workPlansHref: "/staffing/work-plans",
    locationOrder: new Map([
      ["naval", 10],
      ["lighthouse", 20],
    ]),
    ...overrides,
  });
}

const atBreakfast = new Date("2026-09-27T11:00:00.000Z"); // 07:00 ET
const betweenMeals = new Date("2026-09-27T14:00:00.000Z"); // 10:00 ET

test("Today consumes canonical WorkRequirement projection for active Breakfast without assignments", () => {
  const requirements = resolveMealSupport(atBreakfast);
  assert.equal(requirements.length, 8); // 2 units × 2 items × 2 cycles (breakfast+lunch)
  assert.ok(requirements.every((row) => row.assignedEmployeeId === null));

  const view = present(requirements);
  const group = view.currentGroups[0];
  assert.equal(group?.operationLabel, "Breakfast");
  assert.deepEqual(
    group?.locations.map((location) => location.locationName),
    ["Naval Park", "Lighthouse"],
  );
  for (const location of group!.locations) {
    assert.equal(location.plans[0]?.workPlanName, "Meal Service Support");
    assert.equal(location.plans[0]?.assignmentLabel, null);
    assert.deepEqual(
      location.plans[0]?.items.map((row) => row.label),
      ["Tray line check", "Sanitizer check"],
    );
  }
  assert.equal(view.currentGroups[0]?.locations[0]?.plans[0]?.items[0]?.canConfirm, true);
  assert.equal(view.currentGroups[0]?.locations[0]?.plans[0]?.items[1]?.canConfirm, false);
  assert.equal(
    view.currentGroups[0]?.locations[0]?.plans[0]?.items[1]?.statusLabel,
    "Needs linked evidence",
  );
});

test("partial completion and sparse occurrences stay truthful", () => {
  const open = resolveMealSupport(atBreakfast);
  const navalTray = open.find(
    (row) =>
      row.unitId === "naval" &&
      row.workItemKey === "tray_line_check" &&
      row.cycleStableKey === "breakfast",
  );
  assert.ok(navalTray);
  const requirements = resolveMealSupport(atBreakfast, {
    existingOccurrences: [
      {
        id: "occ_tray",
        occurrenceKey: navalTray.occurrenceKey,
        status: "COMPLETED",
        assignedEmployeeId: null,
        completedByLabel: "Pat",
        completedAt: atBreakfast,
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

  const breakfastRows = requirements.filter((row) => row.cycleStableKey === "breakfast");
  assert.equal(breakfastRows.filter((row) => row.occurrenceId).length, 1);
  assert.equal(breakfastRows.filter((row) => row.occurrenceId === null).length, 3);

  const view = present(requirements);
  const naval = view.currentGroups[0]?.locations.find((row) => row.unitId === "naval");
  const lighthouse = view.currentGroups[0]?.locations.find((row) => row.unitId === "lighthouse");
  const navalItems = naval?.plans[0]?.items ?? [];
  assert.equal(navalItems.find((row) => row.workItemKey === "tray_line_check")?.completed, true);
  assert.equal(navalItems.find((row) => row.workItemKey === "sanitizer_check")?.completed, false);
  assert.ok(lighthouse?.plans[0]?.items.every((row) => !row.completed));
});

test("assignment enriches ownership without creating or duplicating Work", () => {
  const without = present(resolveMealSupport(atBreakfast));
  const withAssignment = present(resolveMealSupport(atBreakfast), {
    assignments: [{ unitId: "naval", employeeDisplayName: "Javier" }],
  });

  const keys = (view: ReturnType<typeof present>) =>
    view.currentGroups.flatMap((group) =>
      group.locations.flatMap((location) =>
        location.plans.flatMap((plan) => plan.items.map((item) => item.occurrenceKey)),
      ),
    );

  assert.deepEqual(keys(without).sort(), keys(withAssignment).sort());
  const naval = withAssignment.currentGroups[0]?.locations.find((row) => row.unitId === "naval");
  const lighthouse = withAssignment.currentGroups[0]?.locations.find(
    (row) => row.unitId === "lighthouse",
  );
  assert.equal(naval?.plans[0]?.assignmentLabel, "Javier");
  assert.equal(lighthouse?.plans[0]?.assignmentLabel, null);
  assert.ok(lighthouse);
});

test("between meals does not keep Breakfast Work as current", () => {
  const requirements = resolveMealSupport(betweenMeals);
  const breakfastRows = requirements.filter((row) => row.cycleStableKey === "breakfast");
  assert.ok(breakfastRows.every((row) => row.state === "PAST_DUE_NOT_CONFIRMED"));

  const view = present(requirements, { runPresentation: betweenRun });
  assert.equal(view.currentGroups.length, 0);
  assert.equal(view.upcoming?.operationLabel, "Lunch");
  assert.ok(view.upcoming?.locations.some((row) => row.plans[0]?.workPlanName === "Meal Service Support"));
  const labels = JSON.stringify(view);
  assert.doesNotMatch(labels, /FAILED|VIOLATION|EMPLOYEE FAILED/i);
});

test("cycle-free Work appears without inventing an Operational Cycle", () => {
  const requirements = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: atBreakfast,
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse", "kitchen"],
    publishedPlans: [stationReset],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: new Map([
      ["naval", "Naval Park"],
      ["lighthouse", "Lighthouse"],
      ["kitchen", "Main Kitchen"],
    ]),
  });

  assert.ok(requirements.every((row) => row.cycleStableKey === null));
  assert.ok(requirements.some((row) => row.unitId === "kitchen"));

  const view = present(requirements);
  assert.equal(view.currentGroups.length, 0);
  assert.deepEqual(
    view.otherWork.map((row) => row.locationName),
    ["Naval Park", "Lighthouse", "Main Kitchen"],
  );
  assert.ok(view.otherWork.every((row) => row.plans[0]?.workPlanName === "Servery Closing Checks"));
});

test("no published Work Plans stays healthy and quiet", () => {
  const view = present([], {
    hasPublishedWorkPlans: false,
    canManageWorkPlans: false,
  });
  assert.equal(todaysExpectedWorkHasVisibleWork(view), false);
  assert.equal(view.configureHref, null);
  assert.equal(view.currentGroups.length, 0);
});

test("draft Work is excluded because the presenter only receives published projection", () => {
  const draftPlan = { ...mealSupport, status: "DRAFT" as const };
  const requirements = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: atBreakfast,
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse"],
    publishedPlans: [draftPlan],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: new Map([
      ["naval", "Naval Park"],
      ["lighthouse", "Lighthouse"],
    ]),
  });
  assert.equal(requirements.length, 0);
  const view = present(requirements, { hasPublishedWorkPlans: false, canManageWorkPlans: true });
  assert.equal(todaysExpectedWorkHasVisibleWork(view), false);
  assert.equal(view.configureHref, "/staffing/work-plans");
  assert.equal(view.configureLabel, "Configure recurring work");
});

test("stale unmatched cycle keys do not fabricate current Work", () => {
  const stale = plan({
    id: "stale",
    stableKey: "legacy_opening",
    name: "Legacy Opening",
    items: [
      item({
        id: "legacy",
        itemKey: "legacy_open",
        label: "Legacy open",
        scheduleKind: "OPERATIONAL_CYCLE",
        cycleStableKeys: ["morning_prep"],
      }),
    ],
  });
  const requirements = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: atBreakfast,
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval"],
    publishedPlans: [stale],
    publishedCycles: [breakfastWindow({ participatingUnitIds: ["naval"] })],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: new Map([["naval", "Naval Park"]]),
  });
  assert.equal(requirements.length, 0);
  const view = present(requirements);
  assert.equal(view.currentGroups.length, 0);
});

test("department isolation: EVS Work is not mixed into a Dietary presentation", () => {
  const dietary = resolveMealSupport(atBreakfast);
  const evs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "evs",
    operationalDateKey: "2026-09-27",
    now: atBreakfast,
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["wing"],
    publishedPlans: [
      plan({
        id: "evs",
        stableKey: "routine_room_clean",
        name: "Routine Room Clean",
        items: [item({ id: "surfaces", itemKey: "surfaces", label: "Clean surfaces" })],
      }),
    ],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: new Map([["wing", "North Wing"]]),
  });

  const dietaryView = present(dietary);
  const evsView = present(evs, { departmentId: "evs", runPresentation: betweenRun });
  const dietaryText = JSON.stringify(dietaryView);
  const evsText = JSON.stringify(evsView);
  assert.doesNotMatch(dietaryText, /Routine Room Clean|North Wing/);
  assert.match(evsText, /Routine Room Clean/);
  assert.doesNotMatch(evsText, /Meal Service Support|Naval Park/);
});

test("one Meal Service Support plan still covers Breakfast and Lunch", () => {
  const preset = buildWorkPlanPresetDraft("MEAL_SERVICE_SUPPORT");
  assert.deepEqual(preset.items[0]?.cycleStableKeys, [
    "breakfast_service",
    "lunch_service",
    "dinner_service",
  ]);
  // Today fixtures still use existing facility-owned root bindings.
  const requirements = resolveMealSupport(atBreakfast);
  const view = present(requirements);
  assert.ok(view.currentGroups[0]?.locations[0]?.plans[0]?.workPlanName === "Meal Service Support");
  assert.equal(view.upcoming?.operationLabel, "Lunch");
  assert.ok(
    view.upcoming?.locations[0]?.plans.some((row) => row.workPlanName === "Meal Service Support"),
  );
});

test("feature flag off hides Work and Manager guidance", () => {
  const view = present(resolveMealSupport(atBreakfast), {
    workCapabilityEnabled: false,
    hasPublishedWorkPlans: false,
    canManageWorkPlans: true,
  });
  assert.equal(view.workCapabilityEnabled, false);
  assert.equal(todaysExpectedWorkHasVisibleWork(view), false);
  assert.equal(view.configureHref, null);
});

test("Manager-only configuration guidance; Supervisor and Quick PIN do not get Build", () => {
  const manager = decideWorkAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "dietary",
  });
  const supervisor = decideWorkAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "dietary",
  });
  const pinManager = decideWorkAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "dietary",
    departmentExists: true,
    primaryDepartmentId: "dietary",
  });
  assert.equal(manager.canManage, true);
  assert.equal(supervisor.canManage, false);
  assert.equal(pinManager.canManage, false);
  assert.equal(pinManager.canComplete, true);
  assert.equal(pinManager.canPublish, false);

  const managerView = present([], {
    hasPublishedWorkPlans: false,
    canManageWorkPlans: manager.canManage,
    canConfirmWork: manager.canComplete,
  });
  const supervisorView = present([], {
    hasPublishedWorkPlans: false,
    canManageWorkPlans: supervisor.canManage,
    canConfirmWork: supervisor.canComplete,
  });
  const pinView = present([], {
    hasPublishedWorkPlans: false,
    canManageWorkPlans: pinManager.canManage,
    canConfirmWork: pinManager.canComplete,
  });
  assert.equal(managerView.configureHref, "/staffing/work-plans");
  assert.equal(supervisorView.configureHref, null);
  assert.equal(pinView.configureHref, null);
});

test("duplicate occurrence keys collapse", () => {
  const requirements = resolveMealSupport(atBreakfast);
  const view = present([...requirements, ...requirements]);
  const keys = view.currentGroups.flatMap((group) =>
    group.locations.flatMap((location) =>
      location.plans.flatMap((plan) => plan.items.map((row) => row.occurrenceKey)),
    ),
  );
  assert.equal(keys.length, new Set(keys).size);
});

test("Today does not show servery Work at Main Kitchen when operational type is servery", () => {
  const support = plan({
    ...mealSupport,
    applicabilities: [
      {
        kind: "OPERATIONAL_TYPE",
        unitId: null,
        spaceId: null,
        spaceType: null,
        assetId: null,
        assetType: null,
        operationalTypeKey: "servery",
      },
    ],
  });
  const requirements = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-09-27",
    now: atBreakfast,
    facilityTimezone: "America/New_York",
    candidateUnitIds: ["naval", "lighthouse", "main_kitchen", "retail", "dietitian", "central"],
    spaces: [
      { id: "naval-space", spaceType: "SERVICE_AREA", unitId: "naval", operationalTypeKey: "servery" },
      { id: "lh-space", spaceType: "SERVICE_AREA", unitId: "lighthouse", operationalTypeKey: "servery" },
      { id: "ct-space", spaceType: "SERVICE_AREA", unitId: "central", operationalTypeKey: "servery" },
      { id: "mk-space", spaceType: "PRODUCTION_AREA", unitId: "main_kitchen", operationalTypeKey: "main_kitchen" },
      { id: "retail-space", spaceType: "SERVICE_AREA", unitId: "retail", operationalTypeKey: "retail" },
      { id: "office-space", spaceType: "OFFICE", unitId: "dietitian", operationalTypeKey: "office_support" },
    ],
    publishedPlans: [support],
    publishedCycles: [breakfastWindow()],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: new Map([
      ["naval", "Naval Park"],
      ["lighthouse", "Lighthouse"],
      ["central", "Central Terminal"],
      ["main_kitchen", "Main Kitchen"],
      ["retail", "Retail"],
      ["dietitian", "Dietitian Office"],
    ]),
  });
  const view = present(requirements, {
    locationOrder: new Map([
      ["naval", 10],
      ["lighthouse", 20],
      ["central", 30],
      ["main_kitchen", 40],
    ]),
  });
  const names = view.currentGroups[0]?.locations.map((location) => location.locationName) ?? [];
  assert.deepEqual(names, ["Naval Park", "Lighthouse"]);
  assert.ok(!names.includes("Main Kitchen"));
  assert.ok(!names.includes("Retail"));
  assert.ok(!names.includes("Dietitian Office"));
  assert.ok(!names.includes("Central Terminal"));
});

test("presenter does not hardcode Dietary and does not require Job Flow", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/todays-work/expected-work/present-expected-work.ts"),
    "utf8",
  );
  assert.doesNotMatch(src, /DIETARY|isDepartmentJobFlowEnabled|isDietaryJobFlowEnabled/);
  assert.doesNotMatch(src, /UNASSIGNED_WORK|FAILED_WORK|NO_EMPLOYEE|MISSED_TASK/);
});
