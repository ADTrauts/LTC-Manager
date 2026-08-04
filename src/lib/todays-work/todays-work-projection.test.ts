/**
 * Wave 15I — Today's Work Projection cutover tests.
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { UnitType } from "@prisma/client";

import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
} from "@/lib/projection";
import { isProjectionTodaysWorkEnabled } from "@/lib/feature-flags";

import {
  adaptProjectionToTodaysWork,
  assembleExperienceWalkContributions,
  filterWalkListToProjectedUnits,
} from "@/lib/todays-work/projection";
import type { WalkListData, WalkListItem } from "@/lib/todays-work";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

function walkItem(unitId: string, name: string, score = 1): WalkListItem {
  return {
    unitId,
    unitName: name,
    unitType: "SERVERY" as UnitType,
    status: "blocked",
    reason: "test",
    href: `/unit/${unitId}`,
    failed: 1,
    missed: 0,
    pending: 0,
    openRepairCount: 0,
    staffingCount: 1,
    attentionScore: score,
  };
}

test("PROJECTION_TODAYS_WORK_ENABLED defaults to false", () => {
  withEnv("PROJECTION_TODAYS_WORK_ENABLED", undefined, () => {
    assert.equal(isProjectionTodaysWorkEnabled(), false);
  });
  withEnv("PROJECTION_TODAYS_WORK_ENABLED", "true", () => {
    assert.equal(isProjectionTodaysWorkEnabled(), true);
  });
});

test("Dietary — Experience contributors and projected Units", () => {
  const view = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  assert.ok(view.projectedUnitIds.includes("unit_kensington"));
  assert.ok(view.sections[0]?.areas.length);
  const experiences = view.sections.flatMap((s) =>
    s.areas.flatMap((a) => a.experiences.map((e) => e.experienceKey)),
  );
  assert.ok(experiences.includes("MEAL_SERVICE"));
  assert.ok(experiences.includes("TEMPERATURE_MONITORING"));
  assert.ok(view.sections[0]?.areas.every((a) => a.experiences.length > 0));
});

test("EVS — no Dietary Experiences", () => {
  const view = adaptProjectionToTodaysWork(EVS_GOLDEN_PROJECTION);
  const keys = view.sections.flatMap((s) =>
    s.areas.flatMap((a) => a.experiences.map((e) => e.experienceKey)),
  );
  assert.ok(keys.length > 0);
  assert.ok(!keys.includes("MEAL_SERVICE"));
});

test("Plant — policy without fake assignments", () => {
  const view = adaptProjectionToTodaysWork(PLANT_GOLDEN_PROJECTION);
  assert.equal(view.sections[0]?.plantPolicy?.createsRoomAssignments, false);
  const keys = view.sections.flatMap((s) =>
    s.areas.flatMap((a) => a.experiences.map((e) => e.experienceKey)),
  );
  assert.ok(!keys.includes("MEAL_SERVICE"));
});

test("Facility Overview — labeled department sections", () => {
  const view = adaptProjectionToTodaysWork(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  assert.equal(view.lensMode, "FACILITY");
  assert.ok(view.sections.every((s) => s.label != null));
  assert.ok(view.sections.length >= 1);
});

test("Permission narrowing — actions subset", () => {
  const full = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  const narrow = adaptProjectionToTodaysWork(PERMISSION_NARROWED_PROJECTION);
  const fullMeal = full.sections
    .flatMap((s) => s.areas.flatMap((a) => a.experiences))
    .find((e) => e.experienceKey === "MEAL_SERVICE");
  const narrowMeal = narrow.sections
    .flatMap((s) => s.areas.flatMap((a) => a.experiences))
    .find((e) => e.experienceKey === "MEAL_SERVICE");
  assert.ok(fullMeal && narrowMeal);
  for (const action of narrowMeal.actions) {
    assert.ok(narrowMeal.allowedActionKeys.includes(action.key));
  }
});

test("Ordering — Areas then Experiences preserved", () => {
  const view = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  const areas = view.sections[0]?.areas ?? [];
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i]!.order >= areas[i - 1]!.order);
  }
});

test("Walk filter never broadens beyond Projection", () => {
  const view = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  const walk: WalkListData = {
    items: [
      walkItem("unit_kensington", "Kensington", 10),
      walkItem("unit_not_projected", "Other", 99),
      walkItem("unit_ground_floor", "Ground", 5),
    ],
    summary: { total: 3, blocked: 3, inProgress: 0, ready: 0 },
    operationContext: {
      mealType: "LUNCH",
      mealLabel: "Lunch",
      serviceLabel: "Lunch",
      phase: "Execution",
      scheduledTimeLabel: null,
      minutesUntilService: null,
    },
    lookFirst: null,
  };
  const filtered = filterWalkListToProjectedUnits(walk, view.projectedUnitIds);
  assert.ok(filtered.items.every((i) => view.projectedUnitIds.includes(i.unitId)));
  assert.ok(!filtered.items.some((i) => i.unitId === "unit_not_projected"));
  assert.ok(filtered.summary.total <= walk.summary.total);
});

test("Experience walk contributions preserve Experience order", () => {
  const view = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  const items = [
    walkItem("unit_kensington", "Kensington", 10),
    walkItem("unit_ground_floor", "Ground", 1),
  ];
  const contributions = assembleExperienceWalkContributions(view, items);
  assert.ok(contributions.length > 0);
  for (let i = 1; i < contributions.length; i++) {
    const prev = contributions[i - 1]!;
    const next = contributions[i]!;
    if (prev.areaKey === next.areaKey) {
      assert.ok(next.order >= prev.order);
    }
  }
});

test("Projection failure empty view", () => {
  const view = adaptProjectionToTodaysWork(
    {
      ...DIETARY_GOLDEN_PROJECTION,
      locations: { roots: [], actionableIds: [], byId: {} },
      areas: [],
      experiences: [],
    },
    "boom",
  );
  assert.equal(view.error, "boom");
  assert.equal(view.projectedUnitIds.length, 0);
  assert.equal(view.sections.length, 0);
});

test("Tools embedded on contributors", () => {
  const view = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  const meal = view.sections
    .flatMap((s) => s.areas.flatMap((a) => a.experiences))
    .find((e) => e.experienceKey === "MEAL_SERVICE");
  assert.ok(meal);
  assert.ok(meal.tools.length > 0);
});
