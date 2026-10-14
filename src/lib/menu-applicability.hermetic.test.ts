import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { DepartmentActionableLocation } from "@/lib/department-administration/department-locations";
import { DEFAULT_MENU_PERIODS } from "@/lib/menu-cycle";
import {
  evaluateMenuApplicabilityAttention,
  expandAllDepartmentLocations,
  expandRoomsByOperationalType,
  expandRoomsUnderNeighborhood,
  isEligibleMenuCycleIdentity,
  menuLocationMatches,
  menuLocationTargetKey,
  normalizeMenuLocationTarget,
  overlappingActiveMenus,
  resolveMenuPeriodKeys,
  selectEligibleMenuCycleIdentities,
  suggestMenuPeriodKey,
  uniqueMenuLocationTargets,
  validateMenuCycleAssignments,
  validateMenuLocationAssignments,
  type EligibleMenuOperationalCycle,
  type MenuCycleIdentityRow,
} from "@/lib/menu-applicability";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function location(
  partial: Partial<DepartmentActionableLocation> &
    Pick<DepartmentActionableLocation, "id" | "kind" | "displayName">,
): DepartmentActionableLocation {
  return {
    source: partial.kind === "room" ? "space_responsibility" : "unit_responsibility",
    name: partial.displayName,
    floorName: "Floor 1",
    parentUnitId: partial.kind === "room" ? "botanical" : "floor-1",
    parentNeighborhoodName: partial.kind === "room" ? "Botanical Gardens" : null,
    parentNeighborhoodId: partial.kind === "room" ? "botanical" : null,
    isActive: true,
    patternKey: null,
    patternLabel: null,
    hasPattern: false,
    hasOverrides: false,
    status: "assigned",
    unitType: partial.kind === "neighborhood" ? "OTHER" : null,
    hierarchyRole: partial.kind === "neighborhood" ? "NEIGHBORHOOD" : null,
    spaceTypeLabel: null,
    roomTypeKey: null,
    roomTypeLabel: null,
    recommendedPatternKey: null,
    ...partial,
  };
}

const botanical = location({ id: "botanical", kind: "neighborhood", displayName: "Botanical Gardens" });
const servery = location({
  id: "botanical-servery",
  kind: "room",
  displayName: "Botanical Gardens Servery",
  parentNeighborhoodId: "botanical",
  patternKey: "archetype:servery",
  patternLabel: "Servery",
  hasPattern: true,
});
const cafe = location({
  id: "cafe",
  kind: "room",
  displayName: "Retail Café",
  parentNeighborhoodId: "botanical",
  patternKey: "archetype:retail",
  patternLabel: "Retail",
  hasPattern: true,
});
const actionable = [botanical, servery, cafe];

const breakfast: EligibleMenuOperationalCycle = {
  stableKey: "breakfast",
  label: "Breakfast",
  mealType: "BREAKFAST",
  displaySequence: 10,
  version: 2,
};

const lunch: EligibleMenuOperationalCycle = {
  stableKey: "lunch",
  label: "Lunch",
  mealType: "LUNCH",
  displaySequence: 20,
  version: 1,
};

function cycleRow(partial: Partial<MenuCycleIdentityRow> & Pick<MenuCycleIdentityRow, "stableKey" | "status">): MenuCycleIdentityRow {
  return {
    label: partial.stableKey,
    mealType: null,
    displaySequence: 100,
    version: 1,
    nodeKind: "PERIOD",
    parentStableKey: null,
    ...partial,
  };
}

test("XOR location targets reject both, neither, and accept unit or space", () => {
  assert.deepEqual(normalizeMenuLocationTarget({ unitId: "botanical" }), {
    unitId: "botanical",
    spaceId: null,
  });
  assert.deepEqual(normalizeMenuLocationTarget({ spaceId: "botanical-servery" }), {
    unitId: null,
    spaceId: "botanical-servery",
  });
  assert.throws(() => normalizeMenuLocationTarget({}), /exactly one/);
  assert.throws(() => normalizeMenuLocationTarget({ unitId: "a", spaceId: "b" }), /exactly one/);
});

test("valid Department neighborhood and room assignments are accepted", () => {
  const next = validateMenuLocationAssignments({
    next: [
      { unitId: "botanical", spaceId: null },
      { unitId: null, spaceId: "botanical-servery" },
    ],
    actionable,
  });
  assert.deepEqual(
    next.map((row) => menuLocationTargetKey(row)),
    ["unit:botanical", "space:botanical-servery"],
  );
});

test("other-facility, other-department, floor, building, and staged locations are rejected", () => {
  for (const target of [
    { unitId: "other-facility-room", spaceId: null },
    { unitId: "evs-only", spaceId: null },
    { unitId: "floor-1", spaceId: null },
    { unitId: "building-1", spaceId: null },
    { unitId: "staged", spaceId: null },
  ]) {
    assert.throws(
      () => validateMenuLocationAssignments({ next: [target], actionable }),
      /not an actionable location/,
    );
  }
});

test("inactive locations cannot be newly assigned but may be retained", () => {
  const inactive = location({
    id: "closed",
    kind: "room",
    displayName: "Closed servery",
    isActive: false,
  });
  assert.throws(
    () => validateMenuLocationAssignments({ next: [{ unitId: null, spaceId: "closed" }], actionable: [...actionable, inactive] }),
    /not available/,
  );
  const retained = validateMenuLocationAssignments({
    next: [{ unitId: null, spaceId: "closed" }],
    existing: [{ unitId: null, spaceId: "closed" }],
    actionable: [...actionable, inactive],
  });
  assert.equal(retained[0]?.spaceId, "closed");
});

test("duplicate locations collapse to one assignment", () => {
  const next = uniqueMenuLocationTargets([
    { unitId: null, spaceId: "botanical-servery" },
    { unitId: null, spaceId: "botanical-servery" },
  ]);
  assert.equal(next.length, 1);
});

test("neighborhood assignment does not imply the child servery", () => {
  const neighborhood = { unitId: "botanical", spaceId: null };
  assert.equal(menuLocationMatches(neighborhood, { unitId: "botanical", spaceId: null }), true);
  assert.equal(menuLocationMatches(neighborhood, { unitId: null, spaceId: "botanical-servery" }), false);
});

test("eligible cycles are published root PERIOD identities only", () => {
  const rows = [
    cycleRow({ stableKey: "breakfast", status: "PUBLISHED", label: "Breakfast", version: 1 }),
    cycleRow({ stableKey: "breakfast", status: "PUBLISHED", label: "Breakfast", version: 2 }),
    cycleRow({ stableKey: "brunch", status: "PUBLISHED", label: "Brunch" }),
    cycleRow({ stableKey: "draft_only", status: "DRAFT", label: "Draft brunch" }),
    cycleRow({
      stableKey: "breakfast_prep",
      status: "PUBLISHED",
      label: "Prep",
      parentStableKey: "breakfast",
      nodeKind: "PERIOD",
    }),
    cycleRow({
      stableKey: "breakfast_ready",
      status: "PUBLISHED",
      label: "Ready",
      parentStableKey: "breakfast",
      nodeKind: "KEY_TIME",
    }),
    cycleRow({ stableKey: "retired_only", status: "RETIRED", label: "Old tea" }),
  ];
  const eligible = selectEligibleMenuCycleIdentities(rows);
  assert.deepEqual(
    eligible.map((row) => `${row.stableKey}:${row.version}`),
    ["breakfast:2", "brunch:1"],
  );
  assert.equal(isEligibleMenuCycleIdentity(cycleRow({ stableKey: "draft_only", status: "DRAFT" })), false);
  assert.equal(
    isEligibleMenuCycleIdentity(
      cycleRow({ stableKey: "breakfast_ready", status: "PUBLISHED", nodeKind: "KEY_TIME", parentStableKey: "breakfast" }),
    ),
    false,
  );
});

test("future published root cycles remain eligible and republish keeps the same stableKey", () => {
  const future = selectEligibleMenuCycleIdentities([
    cycleRow({ stableKey: "happy_hour", status: "PUBLISHED", label: "Happy Hour", version: 1 }),
  ]);
  assert.deepEqual(future.map((row) => row.stableKey), ["happy_hour"]);
  const afterPublish = validateMenuCycleAssignments({
    next: [{ cycleStableKey: "breakfast", menuPeriodKey: "BREAKFAST" }],
    existing: [{ cycleStableKey: "breakfast", menuPeriodKey: "BREAKFAST" }],
    eligible: [{ ...breakfast, version: 3 }],
    periodKeys: ["BREAKFAST", "LUNCH", "DINNER"],
  });
  assert.equal(afterPublish[0]?.cycleStableKey, "breakfast");
});

test("other department, phase, key point, unknown, and draft-only cycles are rejected", () => {
  assert.throws(
    () =>
      validateMenuCycleAssignments({
        next: [{ cycleStableKey: "evs_rounds", menuPeriodKey: "BREAKFAST" }],
        eligible: [breakfast, lunch],
        periodKeys: ["BREAKFAST", "LUNCH"],
      }),
    /not available/,
  );
  assert.throws(
    () =>
      validateMenuCycleAssignments({
        next: [{ cycleStableKey: "breakfast_prep", menuPeriodKey: "BREAKFAST" }],
        eligible: [breakfast, lunch],
        periodKeys: ["BREAKFAST", "LUNCH"],
      }),
    /not available/,
  );
});

test("period mapping accepts Breakfast→BREAKFAST and explicit Breakfast→LUNCH", () => {
  assert.equal(
    suggestMenuPeriodKey({ mealType: "BREAKFAST", label: "Breakfast", periods: DEFAULT_MENU_PERIODS }),
    "BREAKFAST",
  );
  const mapped = validateMenuCycleAssignments({
    next: [{ cycleStableKey: "breakfast", menuPeriodKey: "LUNCH" }],
    eligible: [breakfast],
    periodKeys: resolveMenuPeriodKeys(DEFAULT_MENU_PERIODS),
  });
  assert.equal(mapped[0]?.menuPeriodKey, "LUNCH");
});

test("unknown menuPeriodKey is rejected; removed period is retained as Needs Attention", () => {
  assert.throws(
    () =>
      validateMenuCycleAssignments({
        next: [{ cycleStableKey: "breakfast", menuPeriodKey: "BRUNCH" }],
        eligible: [breakfast],
        periodKeys: ["BREAKFAST", "LUNCH", "DINNER"],
      }),
    /not configured/,
  );
  const retained = validateMenuCycleAssignments({
    next: [{ cycleStableKey: "breakfast", menuPeriodKey: "BRUNCH" }],
    existing: [{ cycleStableKey: "breakfast", menuPeriodKey: "BRUNCH" }],
    eligible: [breakfast],
    periodKeys: ["BREAKFAST", "LUNCH", "DINNER"],
  });
  assert.equal(retained[0]?.menuPeriodKey, "BRUNCH");
  const attention = evaluateMenuApplicabilityAttention({
    status: "ACTIVE",
    locations: [{ unitId: null, spaceId: "botanical-servery" }],
    cycles: [{ cycleStableKey: "breakfast", menuPeriodKey: "BRUNCH" }],
    actionable,
    eligible: [breakfast],
    periodKeys: ["BREAKFAST", "LUNCH", "DINNER"],
  });
  assert.ok(attention.some((row) => row.code === "PERIOD_MISSING"));
});

test("Menu A locations and cycles do not affect Menu B overlap unless they actually share both", () => {
  const peers = [
    {
      id: "menu_b",
      name: "Cafe Menu",
      status: "ACTIVE" as const,
      locations: [{ unitId: null, spaceId: "cafe" }],
      cycles: [{ cycleStableKey: "lunch", menuPeriodKey: "LUNCH" }],
    },
  ];
  assert.deepEqual(
    overlappingActiveMenus({
      menuId: "menu_a",
      locations: [{ unitId: null, spaceId: "botanical-servery" }],
      cycles: [{ cycleStableKey: "lunch", menuPeriodKey: "LUNCH" }],
      peers,
    }),
    [],
  );
  assert.deepEqual(
    overlappingActiveMenus({
      menuId: "menu_a",
      locations: [{ unitId: null, spaceId: "cafe" }],
      cycles: [{ cycleStableKey: "lunch", menuPeriodKey: "LUNCH" }],
      peers,
    }),
    [{ menuId: "menu_b", name: "Cafe Menu" }],
  );
});

test("INACTIVE preserves applicability and is not an overlap peer", () => {
  const attention = evaluateMenuApplicabilityAttention({
    status: "INACTIVE",
    locations: [{ unitId: null, spaceId: "botanical-servery" }],
    cycles: [{ cycleStableKey: "lunch", menuPeriodKey: "LUNCH" }],
    actionable,
    eligible: [lunch],
    periodKeys: ["LUNCH"],
    menuId: "menu_a",
    peers: [
      {
        id: "menu_b",
        name: "Other",
        status: "INACTIVE",
        locations: [{ unitId: null, spaceId: "botanical-servery" }],
        cycles: [{ cycleStableKey: "lunch", menuPeriodKey: "LUNCH" }],
      },
    ],
  });
  assert.equal(attention.some((row) => row.code === "ACTIVE_WITHOUT_LOCATIONS"), false);
  assert.equal(attention.some((row) => row.code === "OVERLAP"), false);
});

test("bulk helpers write explicit current IDs and do not invent a live rule", () => {
  const all = expandAllDepartmentLocations(actionable);
  assert.deepEqual(
    all.map((row) => menuLocationTargetKey(row)).sort(),
    ["space:botanical-servery", "space:cafe", "unit:botanical"],
  );
  const serveries = expandRoomsByOperationalType(actionable, "archetype:servery");
  assert.deepEqual(serveries, [{ unitId: null, spaceId: "botanical-servery" }]);
  const underNeighborhood = expandRoomsUnderNeighborhood(actionable, "botanical");
  assert.deepEqual(
    underNeighborhood.map((row) => row.spaceId).sort(),
    ["botanical-servery", "cafe"],
  );
  const later = location({ id: "new-servery", kind: "room", displayName: "New", patternKey: "archetype:servery" });
  assert.equal(
    expandRoomsByOperationalType(actionable, "archetype:servery").some((row) => row.spaceId === "new-servery"),
    false,
  );
  assert.equal(expandRoomsByOperationalType([...actionable, later], "archetype:servery").length, 2);
});

test("two ACTIVE menus may share a location and cycle; overlap is flagged not blocked", () => {
  const attention = evaluateMenuApplicabilityAttention({
    status: "ACTIVE",
    locations: [{ unitId: null, spaceId: "botanical-servery" }],
    cycles: [{ cycleStableKey: "lunch", menuPeriodKey: "LUNCH" }],
    actionable,
    eligible: [lunch],
    periodKeys: ["LUNCH"],
    menuId: "menu_a",
    peers: [
      {
        id: "menu_b",
        name: "Holiday supplement",
        status: "ACTIVE",
        locations: [{ unitId: null, spaceId: "botanical-servery" }],
        cycles: [{ cycleStableKey: "lunch", menuPeriodKey: "LUNCH" }],
      },
    ],
  });
  assert.ok(attention.some((row) => row.code === "OVERLAP" && row.otherMenuName === "Holiday supplement"));
});

test("ACTIVE menus with empty applicability surface Needs Attention", () => {
  const attention = evaluateMenuApplicabilityAttention({
    status: "ACTIVE",
    locations: [],
    cycles: [],
    actionable,
    eligible: [breakfast],
    periodKeys: ["BREAKFAST"],
  });
  assert.ok(attention.some((row) => row.code === "ACTIVE_WITHOUT_LOCATIONS"));
  assert.ok(attention.some((row) => row.code === "ACTIVE_WITHOUT_CYCLES"));
});

test("schema binds cycleStableKey rather than a versioned cycle row id", () => {
  const schema = source("prisma/schema.prisma");
  const migration = source("prisma/migrations/20261013200000_menu_applicability/migration.sql");
  assert.match(schema, /model MenuLocationApplicability/);
  assert.match(schema, /model MenuOperationalCycleApplicability/);
  assert.match(schema, /cycleStableKey String/);
  assert.match(schema, /menuPeriodKey  String/);
  assert.doesNotMatch(schema, /model MenuServiceSlot/);
  assert.doesNotMatch(migration, /DepartmentOperationalCycle/);
  assert.match(migration, /MenuLocationApplicability_target_xor/);
  assert.doesNotMatch(migration, /INSERT INTO "MenuLocationApplicability"/);
  assert.doesNotMatch(migration, /INSERT INTO "MenuOperationalCycleApplicability"/);
});

test("applicability writes reuse requireAuthorizedMenu and do not touch logs compatibility", () => {
  const actions = source("src/app/(protected)/menus/actions.ts");
  const detail = source("src/app/(protected)/menus/[menuId]/page.tsx");
  const logs = source("src/app/(protected)/logs/page.tsx");
  assert.match(actions, /saveMenuApplicabilityAction/);
  assert.match(actions, /requireAuthorizedMenu/);
  assert.match(actions, /loadDepartmentMenuLocations/);
  assert.match(actions, /loadEligibleMenuOperationalCycles/);
  assert.match(detail, /tab=applicability/);
  assert.match(detail, /MenuApplicabilityForm/);
  assert.match(detail, /loadMenu/);
  assert.doesNotMatch(detail, /loadFacilityMenuData/);
  assert.match(logs, /loadFacilityMenuData/);
  assert.doesNotMatch(logs, /loadMenuApplicability/);
});
