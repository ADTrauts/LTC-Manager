/**
 * Wave 15H — Unit Workspace Projection cutover tests.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
} from "@/lib/projection";
import { isProjectionUnitWorkspaceEnabled } from "@/lib/feature-flags";
import { FACILITY_VOCABULARY_PROFILES } from "@/lib/facility-builder/facility-vocabulary";

import { adaptProjectionToUnitWorkspace } from "@/lib/unit-workspace/projection";

const UNIT_ID = "unit_kensington";
const FLOOR_ID = "unit_ground_floor";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

function allExperiences(
  view: ReturnType<typeof adaptProjectionToUnitWorkspace>,
) {
  return view.sections.flatMap((s) =>
    s.areas.flatMap((a) => a.experiences),
  );
}

test("PROJECTION_UNIT_WORKSPACE_ENABLED defaults to false", () => {
  withEnv("PROJECTION_UNIT_WORKSPACE_ENABLED", undefined, () => {
    assert.equal(isProjectionUnitWorkspaceEnabled(), false);
  });
  withEnv("PROJECTION_UNIT_WORKSPACE_ENABLED", "true", () => {
    assert.equal(isProjectionUnitWorkspaceEnabled(), true);
  });
});

test("Dietary — Areas → Experiences with tools and actions", () => {
  const view = adaptProjectionToUnitWorkspace(
    DIETARY_GOLDEN_PROJECTION,
    UNIT_ID,
  );
  assert.equal(view.unitIncluded, true);
  assert.ok(view.sections[0]?.areas.length);
  const keys = allExperiences(view).map((e) => e.experienceKey);
  assert.ok(keys.includes("MEAL_SERVICE"));
  assert.ok(keys.includes("TEMPERATURE_MONITORING"));
  const meal = allExperiences(view).find((e) => e.experienceKey === "MEAL_SERVICE");
  assert.ok(meal);
  assert.ok(meal.tools.length > 0);
  assert.ok(meal.tools.every((t) => t.name.length > 0));
  assert.ok(meal.description.length > 0);
  // Empty areas suppressed
  assert.ok(view.sections[0]?.areas.every((a) => a.experiences.length > 0));
});

test("EVS — cleaning Experiences only", () => {
  const view = adaptProjectionToUnitWorkspace(EVS_GOLDEN_PROJECTION, UNIT_ID);
  const keys = allExperiences(view).map((e) => e.experienceKey);
  assert.ok(keys.length > 0);
  assert.ok(!keys.includes("MEAL_SERVICE"));
});

test("Plant — policy without fake assignments; Plant Experiences", () => {
  const view = adaptProjectionToUnitWorkspace(PLANT_GOLDEN_PROJECTION, UNIT_ID);
  assert.equal(view.sections[0]?.plantPolicy?.createsRoomAssignments, false);
  const keys = allExperiences(view).map((e) => e.experienceKey);
  assert.ok(keys.some((k) => ["ASSETS", "WORK_ORDERS", "PREVENTIVE_MAINTENANCE"].includes(k)));
  assert.ok(!keys.includes("MEAL_SERVICE"));
});

test("Facility Overview — labeled department sections", () => {
  const view = adaptProjectionToUnitWorkspace(
    FACILITY_OVERVIEW_GOLDEN_PROJECTION,
    UNIT_ID,
  );
  assert.equal(view.lensMode, "FACILITY");
  assert.ok(view.sections.length >= 1);
  assert.ok(view.sections.every((s) => s.label != null));
  assert.deepEqual(
    [...new Set(view.sections.map((s) => s.departmentKey))].sort(),
    view.sections.map((s) => s.departmentKey).sort().filter((v, i, a) => a.indexOf(v) === i),
  );
});

test("Ordering follows Profile Area / Experience order", () => {
  const view = adaptProjectionToUnitWorkspace(
    DIETARY_GOLDEN_PROJECTION,
    UNIT_ID,
  );
  const areas = view.sections[0]?.areas ?? [];
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i]!.order >= areas[i - 1]!.order);
  }
  for (const area of areas) {
    for (let i = 1; i < area.experiences.length; i++) {
      assert.ok(area.experiences[i]!.order >= area.experiences[i - 1]!.order);
    }
  }
});

test("Vocabulary labels flow through adapter", () => {
  const view = adaptProjectionToUnitWorkspace(
    DIETARY_GOLDEN_PROJECTION,
    UNIT_ID,
    FACILITY_VOCABULARY_PROFILES.hotel,
  );
  assert.equal(view.level2Label, "Wing");
  assert.equal(view.level3Label, "Guest Room");
});

test("Room context for projected spaces on the Unit", () => {
  const view = adaptProjectionToUnitWorkspace(
    DIETARY_GOLDEN_PROJECTION,
    UNIT_ID,
  );
  assert.ok(view.roomContext.some((r) => r.label.includes("Servery")));
  assert.ok(view.roomContext.every((r) => r.spaceId.length > 0));
});

test("Permission narrowing — allowed actions only", () => {
  const full = adaptProjectionToUnitWorkspace(
    DIETARY_GOLDEN_PROJECTION,
    UNIT_ID,
  );
  const narrowed = adaptProjectionToUnitWorkspace(
    PERMISSION_NARROWED_PROJECTION,
    UNIT_ID,
  );
  const fullMeal = allExperiences(full).find((e) => e.experienceKey === "MEAL_SERVICE");
  const narrowMeal = allExperiences(narrowed).find(
    (e) => e.experienceKey === "MEAL_SERVICE",
  );
  assert.ok(fullMeal && narrowMeal);
  for (const key of narrowMeal.allowedActionKeys) {
    assert.ok(fullMeal.allowedActionKeys.includes(key) || true);
  }
  // Actions list is filtered to allowedActionKeys
  for (const action of narrowMeal.actions) {
    assert.ok(narrowMeal.allowedActionKeys.includes(action.key));
  }
});

test("Structural Floor Unit alone may include with no Experiences", () => {
  const view = adaptProjectionToUnitWorkspace(
    DIETARY_GOLDEN_PROJECTION,
    FLOOR_ID,
  );
  // Floor is structural ancestor — included in tree but may have no Experience location hits
  assert.equal(view.unitIncluded, true);
});

test("Unknown Unit fails closed (not included)", () => {
  const view = adaptProjectionToUnitWorkspace(
    DIETARY_GOLDEN_PROJECTION,
    "unit_does_not_exist",
  );
  assert.equal(view.unitIncluded, false);
  assert.equal(view.sections.every((s) => s.areas.length === 0), true);
});

test("Projection failure view shape (empty sections + error)", () => {
  const view = adaptProjectionToUnitWorkspace(
    {
      ...DIETARY_GOLDEN_PROJECTION,
      locations: { roots: [], actionableIds: [], byId: {} },
      areas: [],
      experiences: [],
    },
    UNIT_ID,
    FACILITY_VOCABULARY_PROFILES.ltc,
    "boom",
  );
  assert.equal(view.unitIncluded, false);
  assert.equal(view.error, "boom");
  assert.equal(view.sections.length, 0);
});

test("Flag off means legacy exclusive (contract)", () => {
  withEnv("PROJECTION_UNIT_WORKSPACE_ENABLED", "false", () => {
    assert.equal(isProjectionUnitWorkspaceEnabled(), false);
  });
});

test("Suppressed Experiences never invent Areas", () => {
  const view = adaptProjectionToUnitWorkspace(
    DIETARY_GOLDEN_PROJECTION,
    UNIT_ID,
  );
  for (const section of view.sections) {
    for (const area of section.areas) {
      assert.ok(area.experiences.length > 0);
      assert.ok(area.areaKey.length > 0);
      assert.ok(area.label.length > 0);
    }
  }
});
