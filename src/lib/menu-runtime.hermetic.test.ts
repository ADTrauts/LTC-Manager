import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import {
  assertResolveApplicableMenusInput,
  MenuRuntimeRequestError,
  normalizeRequestedCycleToRootPeriod,
  presentTodaysMenuBlock,
  resolveApplicableMenusFromFacts,
  type MenuRuntimeCandidateFact,
  type MenuRuntimeItemFact,
  type ResolveApplicableMenusFromFactsInput,
} from "@/lib/menu-runtime";

const SERVICE_DATE = "2026-10-14";
const FACILITY = "facility-a";
const DEPARTMENT = "dietary";
const SERVERY = "botanical-servery";
const NEIGHBORHOOD = "botanical";
const LUNCH_PERIODS = [
  { key: "LUNCH", label: "Lunch", categories: ["Entrees", "Sides", "Dessert"] },
];
const ANCHOR = new Date("2026-01-04T00:00:00.000Z");

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function cycle(
  overrides: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "id" | "label">,
): OperationalCycleDefinition {
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
    ...overrides,
  };
}

const lunch = cycle({ id: "lunch", label: "Lunch", stableKey: "lunch" });
const lunchPrep = cycle({
  id: "lunch-prep",
  label: "Lunch Prep",
  stableKey: "lunch_prep",
  parentStableKey: "lunch",
  startLocal: "10:30",
  endLocal: "11:30",
});
const trayPass = cycle({
  id: "tray-pass",
  label: "Tray Pass",
  stableKey: "tray_pass",
  nodeKind: "KEY_TIME",
  parentStableKey: "lunch",
  startLocal: null,
  endLocal: null,
});

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

function resolve(
  overrides: Partial<ResolveApplicableMenusFromFactsInput> = {},
) {
  return resolveApplicableMenusFromFacts({
    facilityId: FACILITY,
    departmentId: DEPARTMENT,
    serviceDateKey: SERVICE_DATE,
    location: { unitId: null, spaceId: SERVERY },
    cycleStableKey: "lunch",
    locationActionable: true,
    publishedCycles: [lunch],
    candidates: [candidate()],
    items: [
      item(),
      item({
        id: "item-potatoes",
        itemName: "Mashed Potatoes",
        category: "Sides",
        displayOrder: 20,
      }),
      item({
        id: "item-beans",
        itemName: "Green Beans",
        category: "Sides",
        displayOrder: 30,
      }),
      item({
        id: "item-pie",
        itemName: "Apple Pie",
        category: "Dessert",
        displayOrder: 40,
        portionValue: null,
        portionUnit: null,
      }),
    ],
    ...overrides,
  });
}

test("happy path resolves Botanical Gardens Servery Lunch items for 2026-10-14", () => {
  const result = resolve();
  assert.equal(result.matches.length, 1);
  assert.equal(result.ambiguous, false);
  assert.deepEqual(result.issues, []);
  const menu = result.matches[0]!;
  assert.equal(menu.menuId, "menu-resident");
  assert.equal(menu.status, "ACTIVE");
  assert.equal(menu.requestedCycleStableKey, "lunch");
  assert.equal(menu.cycleStableKey, "lunch");
  assert.equal(menu.serviceDateKey, SERVICE_DATE);
  assert.equal(menu.weekNumber, 2);
  assert.equal(menu.dayIndex, 3);
  assert.equal(menu.menuPeriodKey, "LUNCH");
  assert.deepEqual(
    menu.categories.map((category) => category.name),
    ["Entrees", "Sides", "Dessert"],
  );
  assert.deepEqual(
    menu.categories.flatMap((category) => category.items.map((row) => row.itemName)),
    ["Roast Turkey", "Mashed Potatoes", "Green Beans", "Apple Pie"],
  );
  assert.equal(menu.categories[0]!.items[0]!.portionValue, "4");
  assert.equal(menu.categories[0]!.items[0]!.portionUnit, "oz");
  assert.equal(menu.categories[0]!.items[0]!.entryType, "FIXED");
});

test("exact location match is room-to-room only", () => {
  assert.equal(resolve().matches.length, 1);
  assert.equal(
    resolve({
      candidates: [candidate({ location: { unitId: NEIGHBORHOOD, spaceId: null } })],
    }).matches.length,
    0,
  );
  assert.equal(
    resolve({
      location: { unitId: NEIGHBORHOOD, spaceId: null },
      unitCycleScope: { id: NEIGHBORHOOD, unitType: "OTHER", spaceIds: [SERVERY] },
      publishedCycles: [cycle({ id: "lunch", label: "Lunch", spaceIds: [], unitIds: [NEIGHBORHOOD] })],
    }).issues.some((issue) => issue.code === "NO_APPLICABLE_MENU"),
    true,
  );
});

test("other Department, other Facility, and stale location do not match", () => {
  assert.equal(
    resolve({ candidates: [candidate({ departmentId: "evs" })] }).issues[0]?.code,
    "NO_APPLICABLE_MENU",
  );
  assert.equal(
    resolve({ candidates: [candidate({ facilityId: "facility-b" })] }).issues[0]?.code,
    "NO_APPLICABLE_MENU",
  );
  const stale = resolve({ locationActionable: false });
  assert.deepEqual(stale.matches, []);
  assert.equal(stale.issues[0]?.code, "LOCATION_NOT_ACTIONABLE");
});

test("Phase walks to root PERIOD and Key Point does not produce a Menu match", () => {
  const fromPhase = resolve({
    cycleStableKey: "lunch_prep",
    publishedCycles: [lunch, lunchPrep],
  });
  assert.equal(fromPhase.matches[0]?.requestedCycleStableKey, "lunch_prep");
  assert.equal(fromPhase.matches[0]?.cycleStableKey, "lunch");

  const walked = normalizeRequestedCycleToRootPeriod("lunch_prep", [lunch, lunchPrep]);
  assert.equal(walked?.root.stableKey, "lunch");
  assert.equal(normalizeRequestedCycleToRootPeriod("tray_pass", [lunch, trayPass]), null);

  const fromKeyPoint = resolve({
    cycleStableKey: "tray_pass",
    publishedCycles: [lunch, trayPass],
  });
  assert.deepEqual(fromKeyPoint.matches, []);
  assert.equal(fromKeyPoint.issues[0]?.code, "CYCLE_NOT_OCCURRING");
});

test("Operational Cycle occurrence rejects date, weekday, location, and retired-only identities", () => {
  const notEffective = resolve({
    publishedCycles: [
      cycle({
        id: "lunch",
        label: "Lunch",
        effectiveFrom: new Date("2026-11-01T00:00:00.000Z"),
      }),
    ],
  });
  assert.equal(notEffective.issues[0]?.code, "CYCLE_NOT_OCCURRING");

  const wrongWeekday = resolve({
    publishedCycles: [cycle({ id: "lunch", label: "Lunch", applicableDaysOfWeek: [0] })],
  });
  assert.equal(wrongWeekday.issues[0]?.code, "CYCLE_NOT_OCCURRING");

  const wrongRoom = resolve({
    publishedCycles: [cycle({ id: "lunch", label: "Lunch", spaceIds: ["other-servery"] })],
  });
  assert.equal(wrongRoom.issues[0]?.code, "CYCLE_NOT_OCCURRING");

  const retiredOutside = resolve({
    publishedCycles: [
      cycle({
        id: "lunch",
        label: "Lunch",
        status: "RETIRED",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ],
  });
  assert.equal(retiredOutside.issues[0]?.code, "CYCLE_NOT_OCCURRING");
});

test("same stableKey survives a republished Cycle version", () => {
  const republished = cycle({ id: "lunch-v2", label: "Lunch", stableKey: "lunch", version: 2 });
  const result = resolve({ publishedCycles: [republished] });
  assert.equal(result.matches[0]?.cycleStableKey, "lunch");
  assert.equal(result.matches.length, 1);
});

test("INACTIVE Menus are excluded and zero / one / many matches set ambiguous exactly", () => {
  const inactive = resolve({
    candidates: [candidate({ status: "INACTIVE" })],
  });
  assert.equal(inactive.matches.length, 0);
  assert.equal(inactive.ambiguous, false);
  assert.equal(inactive.issues[0]?.code, "NO_APPLICABLE_MENU");

  const one = resolve();
  assert.equal(one.matches.length, 1);
  assert.equal(one.ambiguous, false);
  assert.equal(one.issues.some((issue) => issue.code === "AMBIGUOUS_MENUS"), false);

  const many = resolve({
    candidates: [
      candidate(),
      candidate({ menuId: "menu-holiday", menuName: "Holiday Supplement" }),
    ],
    items: [
      item(),
      item({ id: "holiday-pie", menuId: "menu-holiday", itemName: "Pumpkin Pie", category: "Dessert" }),
    ],
  });
  assert.equal(many.matches.length, 2);
  assert.equal(many.ambiguous, true);
  assert.equal(many.issues.some((issue) => issue.code === "AMBIGUOUS_MENUS"), true);
  assert.deepEqual(
    many.matches.map((menu) => menu.menuId),
    ["menu-resident", "menu-holiday"],
  );
});

test("stored menuPeriodKey is authority, including non-name-equivalent mappings", () => {
  const brunch = cycle({ id: "brunch", label: "Brunch", stableKey: "brunch", mealType: "BREAKFAST" });
  const mapped = resolve({
    cycleStableKey: "brunch",
    publishedCycles: [brunch],
    candidates: [candidate({ cycleStableKey: "brunch", menuPeriodKey: "LUNCH" })],
  });
  assert.equal(mapped.matches[0]?.menuPeriodKey, "LUNCH");
  assert.equal(mapped.matches[0]?.categories.length, 3);

  const removed = resolve({
    candidates: [candidate({ menuPeriodKey: "BRUNCH", cycleSettings: settings([{ key: "LUNCH", label: "Lunch", categories: ["Entrees"] }]) })],
  });
  assert.equal(removed.matches.length, 1);
  assert.deepEqual(removed.matches[0]?.categories, []);
  assert.equal(removed.issues.some((issue) => issue.code === "PERIOD_MISSING"), true);
});

test("rotation wrap, week starts, and 3/4-week lengths stay civil-date safe", () => {
  const sundayThree = resolve();
  assert.equal(sundayThree.matches[0]?.weekNumber, 2);
  assert.equal(sundayThree.matches[0]?.dayIndex, 3);

  const wrap = resolve({
    serviceDateKey: "2026-01-25",
    items: [item({ weekNumber: 1, dayIndex: 0, itemName: "Wrapped Sunday" })],
  });
  assert.equal(wrap.matches[0]?.weekNumber, 1);
  assert.equal(wrap.matches[0]?.dayIndex, 0);

  const monday = resolve({
    serviceDateKey: "2026-01-05",
    candidates: [candidate({ cycleSettings: settings() && { ...settings(), weekStartsOn: "MONDAY" } })],
    items: [item({ weekNumber: 1, dayIndex: 0, itemName: "Monday start" })],
  });
  assert.equal(monday.matches[0]?.weekNumber, 1);
  assert.equal(monday.matches[0]?.dayIndex, 0);

  const four = resolve({
    serviceDateKey: "2026-01-25",
    candidates: [candidate({ cycleSettings: { ...settings(), cycleLengthWeeks: 4 } })],
    items: [item({ weekNumber: 4, dayIndex: 0, itemName: "Week four" })],
  });
  assert.equal(four.matches[0]?.weekNumber, 4);
});

test("empty slot and missing cycle settings remain matches, not NO_APPLICABLE_MENU", () => {
  const empty = resolve({ items: [] });
  assert.equal(empty.matches.length, 1);
  assert.deepEqual(empty.matches[0]?.categories, []);
  assert.equal(empty.issues[0]?.code, "EMPTY_SLOT");

  const missing = resolve({ candidates: [candidate({ cycleSettings: null })] });
  assert.equal(missing.matches.length, 1);
  assert.equal(missing.matches[0]?.weekNumber, null);
  assert.equal(missing.issues[0]?.code, "MISSING_CYCLE_SETTINGS");
});

test("Menu A items never leak into Menu B", () => {
  const result = resolve({
    candidates: [
      candidate(),
      candidate({ menuId: "menu-holiday", menuName: "Holiday Supplement" }),
    ],
    items: [
      item(),
      item({
        id: "holiday-only",
        menuId: "menu-holiday",
        itemName: "Pumpkin Pie",
        category: "Dessert",
        displayOrder: 1,
      }),
    ],
  });
  const resident = result.matches.find((menu) => menu.menuId === "menu-resident")!;
  const holiday = result.matches.find((menu) => menu.menuId === "menu-holiday")!;
  assert.ok(resident.categories.flatMap((category) => category.items.map((row) => row.itemName)).includes("Roast Turkey"));
  assert.ok(!resident.categories.flatMap((category) => category.items.map((row) => row.itemName)).includes("Pumpkin Pie"));
  assert.deepEqual(
    holiday.categories.flatMap((category) => category.items.map((row) => row.itemName)),
    ["Pumpkin Pie"],
  );
});

test("programmer misuse throws; ordinary gaps become issues", () => {
  assert.throws(
    () => assertResolveApplicableMenusInput({
      facilityId: "",
      departmentId: DEPARTMENT,
      serviceDateKey: SERVICE_DATE,
      location: { unitId: null, spaceId: SERVERY },
      cycleStableKey: "lunch",
    }),
    (error: unknown) => error instanceof MenuRuntimeRequestError && error.code === "INVALID_FACILITY",
  );
  assert.throws(
    () => assertResolveApplicableMenusInput({
      facilityId: FACILITY,
      departmentId: "",
      serviceDateKey: SERVICE_DATE,
      location: { unitId: null, spaceId: SERVERY },
      cycleStableKey: "lunch",
    }),
    (error: unknown) => error instanceof MenuRuntimeRequestError && error.code === "INVALID_DEPARTMENT",
  );
  assert.throws(
    () => assertResolveApplicableMenusInput({
      facilityId: FACILITY,
      departmentId: DEPARTMENT,
      serviceDateKey: "2026-13-40",
      location: { unitId: null, spaceId: SERVERY },
      cycleStableKey: "lunch",
    }),
    (error: unknown) => error instanceof MenuRuntimeRequestError && error.code === "INVALID_SERVICE_DATE",
  );
  assert.throws(
    () => assertResolveApplicableMenusInput({
      facilityId: FACILITY,
      departmentId: DEPARTMENT,
      serviceDateKey: SERVICE_DATE,
      location: { unitId: NEIGHBORHOOD, spaceId: SERVERY },
      cycleStableKey: "lunch",
    }),
    (error: unknown) => error instanceof MenuRuntimeRequestError && error.code === "INVALID_LOCATION",
  );
  assert.doesNotThrow(() => resolve({ candidates: [] }));
});

test("Today's Menu presentation stays quiet with no match and does not dump issue codes", () => {
  assert.equal(presentTodaysMenuBlock(resolve({ candidates: [] })), null);
  assert.equal(presentTodaysMenuBlock(resolve({ locationActionable: false })), null);
  const many = presentTodaysMenuBlock(
    resolve({
      candidates: [
        candidate(),
        candidate({ menuId: "menu-holiday", menuName: "Holiday Supplement" }),
      ],
    }),
  );
  assert.equal(many?.title, "Today's Menus");
  assert.match(many?.attention ?? "", /Multiple menus apply/);
  assert.equal(many?.attention?.includes("AMBIGUOUS_MENUS"), false);
  const incomplete = presentTodaysMenuBlock(resolve({ items: [] }));
  assert.equal(incomplete?.menus[0]?.incomplete, true);
  assert.equal(incomplete?.menus[0]?.incompleteLabel, "No items for this service");
});

test("Menu Runtime modules stay off legacy loaders, MealType matching, and wall-clock cycle selection", () => {
  const runtime = source("src/lib/menu-runtime.ts");
  const db = source("src/lib/menu-runtime-db.ts");
  const adapter = source("src/lib/unit-workspace/space/from-runtime-state.ts");
  const page = source("src/app/(protected)/unit/[unitId]/space-workspace-page.tsx");
  for (const text of [runtime, db]) {
    assert.equal(/from ["']@\/lib\/menu-db["']/.test(text), false);
    assert.equal(/\bmenuPeriodKeyForMealType\b/.test(text), false);
    assert.equal(/\bresolveOperationalCycle\s*\(/.test(text), false);
    assert.equal(/departmentOperationalCycle\.find/.test(text), false);
  }
  assert.equal(adapter.includes("resolveApplicableMenus"), false);
  assert.equal(adapter.includes("menu-runtime"), false);
  assert.match(page, /resolveApplicableMenus/);
  assert.match(page, /operation\.state === "ACTIVE"/);
});
