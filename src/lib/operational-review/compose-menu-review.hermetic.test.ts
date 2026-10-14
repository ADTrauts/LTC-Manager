import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { MenuRuntimeCandidateFact, MenuRuntimeItemFact } from "@/lib/menu-runtime";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";

import { composeOperationalReviewDay } from "./compose-operational-review-day";
import { composeOperationalReviewRange } from "./compose-operational-review-range";
import { presentOperationalReviewDay } from "./present-operational-review-day";
import type { OperationalReviewDayFacts } from "./types";

const TODAY = "2026-10-14";
const PAST = "2026-10-13";
const FACILITY = "facility-a";
const DEPARTMENT = "dietary";
const SERVERY = "botanical-servery";
const NEIGHBORHOOD = "botanical";
const LUNCH_PERIODS = [{ key: "LUNCH", label: "Lunch", categories: ["Entrees"] }];
const ANCHOR = new Date("2026-01-04T00:00:00.000Z");

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function cycle(
  overrides: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "id" | "label">,
): OperationalCycleDefinition & { departmentId: string } {
  return {
    stableKey: overrides.stableKey ?? overrides.id,
    parentStableKey: overrides.parentStableKey ?? null,
    nodeKind: "PERIOD",
    version: 1,
    description: null,
    cycleType: "SERVICE",
    displaySequence: 100,
    startLocal: "11:30",
    endLocal: "13:30",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: "LUNCH",
    locationMode: "EXPLICIT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    applicableOperationalTypeKeys: [],
    expectedMilestones: [],
    status: "PUBLISHED",
    roomTypeKey: null,
    unitIds: [],
    spaceIds: [SERVERY],
    milestoneTimes: [],
    keyTimeGroups: [],
    departmentId: DEPARTMENT,
    ...overrides,
  };
}

const lunch = cycle({ id: "lunch", label: "Lunch", stableKey: "lunch" });

function settings(periodConfigJson: unknown = LUNCH_PERIODS) {
  return {
    cycleLengthWeeks: 3 as const,
    weekStartsOn: "SUNDAY" as const,
    cycleAnchorDate: ANCHOR,
    periodConfigJson,
  };
}

function candidate(overrides: Partial<MenuRuntimeCandidateFact> = {}): MenuRuntimeCandidateFact {
  return {
    menuId: "menu-resident",
    menuName: "Fall / Winter Resident Menu",
    departmentId: DEPARTMENT,
    facilityId: FACILITY,
    status: "ACTIVE",
    location: { unitId: null, spaceId: SERVERY },
    cycleStableKey: "lunch",
    menuPeriodKey: "LUNCH",
    cycleSettings: settings(),
    ...overrides,
  };
}

function item(overrides: Partial<MenuRuntimeItemFact> = {}): MenuRuntimeItemFact {
  return {
    id: "item-turkey",
    menuId: "menu-resident",
    weekNumber: 2,
    dayIndex: 3,
    mealPeriodKey: "LUNCH",
    category: "Entrees",
    itemName: "Roast Turkey",
    portionValue: "4",
    portionUnit: "oz",
    entryType: "FIXED",
    displayOrder: 10,
    ...overrides,
  };
}

function facts(overrides: Partial<OperationalReviewDayFacts> = {}): OperationalReviewDayFacts {
  return {
    facilityId: FACILITY,
    facilityLabel: "Terrace View",
    departmentId: DEPARTMENT,
    departmentIds: [DEPARTMENT],
    serviceDate: TODAY,
    timezone: "America/New_York",
    now: new Date("2026-10-14T16:00:00.000Z"),
    todayKey: TODAY,
    spaces: [
      {
        spaceId: SERVERY,
        displayLabel: "Botanical Gardens Servery",
        parentUnitId: NEIGHBORHOOD,
        parentUnitLabel: "Botanical Gardens",
      },
    ],
    profiles: [],
    otBindings: [],
    attachmentSegments: [],
    evidenceRecords: [],
    coverageTemplates: [],
    assignments: [],
    plans: [],
    cycles: [lunch],
    publishedCyclesForLogs: [],
    serveryMilestoneActuals: [],
    keyTimeActuals: [],
    scheduledPresence: [],
    presenceExceptions: [],
    assetImpacts: [],
    legacySubmissionPresent: false,
    menuDepartmentIds: [DEPARTMENT],
    menuCandidates: [],
    menuItems: [],
    ...overrides,
  };
}

function compose(overrides: Partial<OperationalReviewDayFacts> = {}) {
  return composeOperationalReviewDay(facts(overrides));
}

test("no applicable Menu for an expected Lunch occurrence becomes MENU_NOT_CONFIGURED", () => {
  const model = compose();
  assert.equal(model.menu.availability.status, "evaluated");
  assert.deepEqual(
    model.menu.findings.map((row) => row.code),
    ["MENU_NOT_CONFIGURED"],
  );
  assert.equal(model.menu.findings[0]?.cycleStableKey, "lunch");
  assert.equal(model.menu.findings[0]?.spaceId, SERVERY);
  assert.equal(model.menu.findings[0]?.menuId, null);
});

test("empty resolved slot becomes MENU_CONTENT_MISSING with week and day", () => {
  const model = compose({
    menuCandidates: [candidate()],
    menuItems: [],
  });
  assert.deepEqual(
    model.menu.findings.map((row) => row.code),
    ["MENU_CONTENT_MISSING"],
  );
  assert.equal(model.menu.findings[0]?.menuId, "menu-resident");
  assert.equal(model.menu.findings[0]?.weekNumber, 2);
  assert.equal(model.menu.findings[0]?.dayIndex, 3);
});

test("missing cycle settings becomes MENU_ROTATION_UNCONFIGURED without fabricated rotation", () => {
  const model = compose({
    menuCandidates: [candidate({ cycleSettings: null })],
    menuItems: [item()],
  });
  assert.equal(model.menu.findings[0]?.code, "MENU_ROTATION_UNCONFIGURED");
  assert.equal(model.menu.findings[0]?.weekNumber, null);
  assert.equal(model.menu.findings[0]?.dayIndex, null);
});

test("removed period mapping becomes MENU_PERIOD_MAPPING_BROKEN and is not remapped", () => {
  const model = compose({
    menuCandidates: [
      candidate({
        menuPeriodKey: "BRUNCH",
        cycleSettings: settings([{ key: "LUNCH", label: "Lunch", categories: ["Entrees"] }]),
      }),
    ],
    menuItems: [item()],
  });
  assert.equal(model.menu.findings[0]?.code, "MENU_PERIOD_MAPPING_BROKEN");
  assert.equal(model.menu.findings[0]?.menuId, "menu-resident");
});

test("two ACTIVE matches become MENU_MULTIPLE_CONFIGURED with both names and no winner", () => {
  const model = compose({
    menuCandidates: [
      candidate(),
      candidate({ menuId: "menu-holiday", menuName: "Holiday Supplement" }),
    ],
    menuItems: [
      item(),
      item({ id: "holiday-pie", menuId: "menu-holiday", itemName: "Pumpkin Pie" }),
    ],
  });
  assert.deepEqual(
    model.menu.findings.map((row) => row.code),
    ["MENU_MULTIPLE_CONFIGURED"],
  );
  assert.deepEqual(model.menu.findings[0]?.peerMenuNames, [
    "Fall / Winter Resident Menu",
    "Holiday Supplement",
  ]);
  assert.equal(model.menu.findings[0]?.menuId, null);
});

test("a cycle that does not occur at the location produces zero Menu findings", () => {
  const model = compose({
    cycles: [cycle({ id: "lunch", label: "Lunch", spaceIds: ["other-servery"] })],
    menuCandidates: [candidate()],
    menuItems: [item()],
  });
  assert.deepEqual(model.menu.findings, []);
});

test("INACTIVE-only Menus behave as no applicable Menu", () => {
  const model = compose({
    menuCandidates: [candidate({ status: "INACTIVE" })],
    menuItems: [item()],
  });
  assert.equal(model.menu.findings[0]?.code, "MENU_NOT_CONFIGURED");
});

test("other Facility and Department Menu facts do not leak", () => {
  const model = compose({
    menuCandidates: [
      candidate({ facilityId: "facility-b" }),
      candidate({ departmentId: "evs", menuId: "menu-evs", menuName: "EVS Menu" }),
    ],
    menuItems: [item(), item({ id: "evs-item", menuId: "menu-evs" })],
  });
  assert.equal(model.menu.findings[0]?.code, "MENU_NOT_CONFIGURED");
});

test("today evaluates Menu; a past date is unsupported_menu_history with no fabricated findings", () => {
  const today = compose({
    menuCandidates: [candidate()],
    menuItems: [item()],
  });
  assert.equal(today.menu.availability.status, "evaluated");
  assert.deepEqual(today.menu.findings, []);

  const past = compose({
    serviceDate: PAST,
    todayKey: TODAY,
    menuDepartmentIds: [DEPARTMENT],
    menuCandidates: [candidate()],
    menuItems: [],
    cycles: [lunch],
  });
  assert.equal(past.menu.availability.status, "unavailable");
  assert.equal(past.menu.availability.reason, "unsupported_menu_history");
  assert.deepEqual(past.menu.findings, []);
});

test("Key Points do not independently create Menu contexts", () => {
  const model = compose({
    cycles: [
      lunch,
      cycle({
        id: "tray-pass",
        label: "Tray Pass",
        stableKey: "tray_pass",
        nodeKind: "KEY_TIME",
        parentStableKey: "lunch",
        startLocal: null,
        endLocal: null,
      }),
    ],
  });
  assert.equal(model.menu.findings.length, 1);
  assert.equal(model.menu.findings[0]?.cycleStableKey, "lunch");
});

test("a neighborhood Menu does not satisfy an exact room occurrence", () => {
  const model = compose({
    menuCandidates: [candidate({ location: { unitId: NEIGHBORHOOD, spaceId: null } })],
    menuItems: [item()],
  });
  assert.equal(model.menu.findings[0]?.code, "MENU_NOT_CONFIGURED");
});

test("range does not convert unavailable historical Menu days into misses", () => {
  const today = compose({ menuCandidates: [], menuItems: [] });
  const past = compose({
    serviceDate: PAST,
    todayKey: TODAY,
    menuCandidates: [],
    menuItems: [],
  });
  const range = composeOperationalReviewRange({
    days: [past, today],
    startServiceDate: PAST,
    endServiceDate: TODAY,
    todayKey: TODAY,
  });
  assert.equal(range.totals.menuEvaluatedDays, 1);
  assert.equal(range.totals.menuUnavailableDays, 1);
  assert.equal(range.totals.menuFindings, 1);
});

test("successful resolution is quiet in presenter summary and uses existing deep links for failures", () => {
  const quiet = presentOperationalReviewDay(
    compose({
      menuCandidates: [candidate()],
      menuItems: [item()],
    }),
  );
  assert.equal(quiet.menu.rows.length, 0);
  assert.equal(quiet.summaryItems.some((row) => row.id === "menu-exceptions"), false);

  const presented = presentOperationalReviewDay(
    compose({
      menuCandidates: [candidate()],
      menuItems: [],
    }),
  );
  assert.equal(presented.summaryItems.some((row) => row.label === "1 menu exception"), true);
  assert.equal(presented.menu.rows[0]?.message, "Fall / Winter Resident Menu has no items for today's Lunch.");
  assert.equal(presented.menu.rows[0]?.href, "/menus/menu-resident?tab=menu&week=2&day=3");
  assert.equal(presented.menu.rows[0]?.hrefLabel, "Open menu");
  assert.equal(presented.menu.rows[0]?.statusKind, "alert");

  const multiple = presentOperationalReviewDay(
    compose({
      menuCandidates: [
        candidate(),
        candidate({ menuId: "menu-holiday", menuName: "Holiday Supplement" }),
      ],
      menuItems: [item(), item({ id: "h", menuId: "menu-holiday" })],
    }),
  );
  assert.equal(multiple.menu.rows[0]?.message, "Multiple menus were configured for this service.");
  assert.equal(multiple.menu.rows[0]?.href, "/menus");
  assert.equal(multiple.menu.rows[0]?.statusKind, "progress");
});

test("this wave does not add Menu Review exceptions to Space Runtime", () => {
  const page = source("src/app/(protected)/unit/[unitId]/space-workspace-page.tsx");
  const adapter = source("src/lib/unit-workspace/space/from-runtime-state.ts");
  const block = source("src/components/unit-workspace/todays-menu-block.tsx");
  for (const text of [page, adapter, block]) {
    assert.equal(text.includes("MENU_NOT_CONFIGURED"), false);
    assert.equal(text.includes("composeReviewMenuDomain"), false);
    assert.equal(text.includes("review-menu"), false);
  }
});
