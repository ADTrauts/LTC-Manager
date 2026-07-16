import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEPARTMENT_RESPONSIBILITY_PRESETS,
  CUSTOM_RESPONSIBILITY_PRESET_KEY,
  findResponsibilityPreset,
  listPresetsForDepartment,
  recommendResponsibilityPresetKey,
  capabilitiesForPreset,
  capabilitiesMatchPreset,
  assertKnownCapabilities,
} from "./department-responsibility-presets";
import { CAPABILITY_KEYS } from "./load-facility-hierarchy";
import { SPACE_TYPE_PRESETS } from "./space-type-presets";

describe("department responsibility presets — registry", () => {
  it("is a single flat registry with Dietary, EVS, and Plant presets", () => {
    const byDept = {
      DIETARY: listPresetsForDepartment("DIETARY"),
      EVS: listPresetsForDepartment("EVS"),
      PLANT: listPresetsForDepartment("PLANT"),
    };
    assert.ok(byDept.DIETARY.length >= 4);
    assert.ok(byDept.EVS.length >= 3);
    assert.ok(byDept.PLANT.length >= 3);
    assert.equal(
      DEPARTMENT_RESPONSIBILITY_PRESETS.length,
      byDept.DIETARY.length + byDept.EVS.length + byDept.PLANT.length,
    );
  });

  it("every preset capability is a known CAPABILITY_KEYS value", () => {
    for (const preset of DEPARTMENT_RESPONSIBILITY_PRESETS) {
      assert.ok(
        assertKnownCapabilities(preset.defaultCapabilities),
        `${preset.key} has unknown capabilities`,
      );
    }
  });

  it("every recommendedSpaceTypes entry exists in SPACE_TYPE_PRESETS", () => {
    const spaceKeys = new Set(SPACE_TYPE_PRESETS.map((p) => p.key));
    for (const preset of DEPARTMENT_RESPONSIBILITY_PRESETS) {
      for (const spaceKey of preset.recommendedSpaceTypes) {
        assert.ok(
          spaceKeys.has(spaceKey),
          `${preset.key} recommends unknown space type ${spaceKey}`,
        );
      }
    }
  });

  it("each department has exactly one Custom preset with empty capabilities", () => {
    for (const dept of ["DIETARY", "EVS", "PLANT"] as const) {
      const customs = listPresetsForDepartment(dept).filter(
        (p) => p.label === "Custom",
      );
      assert.equal(customs.length, 1);
      assert.deepEqual(customs[0]!.defaultCapabilities, []);
    }
  });

  it("CUSTOM_RESPONSIBILITY_PRESET_KEY is reserved naming convention only", () => {
    // Custom presets are department-scoped (dietary_custom, etc.); the constant
    // documents the concept — it is not a single global registry key.
    assert.equal(CUSTOM_RESPONSIBILITY_PRESET_KEY, "custom");
    assert.equal(findResponsibilityPreset("custom"), undefined);
  });
});

describe("department responsibility presets — recommendations", () => {
  it("suggests Food Service Room for Dietary + Servery", () => {
    assert.equal(
      recommendResponsibilityPresetKey("DIETARY", "servery"),
      "dietary_food_service_room",
    );
  });

  it("suggests Resident Room for EVS + Resident Room space type", () => {
    assert.equal(
      recommendResponsibilityPresetKey("EVS", "resident_room"),
      "evs_resident_room",
    );
  });

  it("suggests Mechanical Room for Plant + Mechanical", () => {
    assert.equal(
      recommendResponsibilityPresetKey("PLANT", "mechanical_room"),
      "plant_mechanical_room",
    );
  });

  it("falls back to Custom when no space recommendation matches", () => {
    assert.equal(
      recommendResponsibilityPresetKey("DIETARY", "mechanical_room"),
      "dietary_custom",
    );
    assert.equal(recommendResponsibilityPresetKey("EVS", null), "evs_custom");
  });

  it("returns null for unknown departments (no auto-assign)", () => {
    assert.equal(recommendResponsibilityPresetKey("UNKNOWN", "servery"), null);
  });
});

describe("department responsibility presets — capability selection", () => {
  it("Food Service Room selects the documented Dietary capabilities", () => {
    assert.deepEqual(capabilitiesForPreset("dietary_food_service_room"), [
      "SERVICE_OPERATIONS",
      "MEAL_SERVICE",
      "FOOD_SAFETY",
      "SERVICE_LOGS",
      "CLEANING",
      "KNOWLEDGE",
    ]);
  });

  it("Production Kitchen selects documented capabilities", () => {
    const caps = capabilitiesForPreset("dietary_production_kitchen");
    assert.ok(caps.includes("FOOD_SAFETY"));
    assert.ok(caps.includes("ASSET_MANAGEMENT"));
    assert.ok(caps.includes("REPAIRS"));
  });

  it("Custom preset selects nothing", () => {
    assert.deepEqual(capabilitiesForPreset("dietary_custom"), []);
    assert.deepEqual(capabilitiesForPreset("evs_custom"), []);
    assert.deepEqual(capabilitiesForPreset("plant_custom"), []);
  });

  it("changing preset replaces the capability set", () => {
    const food = capabilitiesForPreset("dietary_food_service_room");
    const storage = capabilitiesForPreset("dietary_storage_area");
    assert.notDeepEqual(food, storage);
    assert.deepEqual(storage, ["CLEANING", "ASSET_MANAGEMENT", "REPAIRS"]);
  });

  it("editing after preset diverges without requiring a new preset", () => {
    const presetKey = "evs_resident_room";
    const fromPreset = capabilitiesForPreset(presetKey);
    assert.ok(capabilitiesMatchPreset(fromPreset, presetKey));

    // Admin unchecks ROOM_STATUS — still a valid capability list to save.
    const edited = fromPreset.filter((c) => c !== "ROOM_STATUS");
    assert.ok(!capabilitiesMatchPreset(edited, presetKey));
    assert.ok(assertKnownCapabilities(edited));
  });

  it("unknown preset key yields empty capabilities (safe Custom fallback)", () => {
    assert.deepEqual(capabilitiesForPreset("does_not_exist"), []);
  });
});

describe("department responsibility presets — persistence contract", () => {
  it("preset keys are UX-only and never appear in CAPABILITY_KEYS", () => {
    for (const preset of DEPARTMENT_RESPONSIBILITY_PRESETS) {
      assert.ok(!(CAPABILITY_KEYS as readonly string[]).includes(preset.key));
    }
  });

  it("saved payload shape remains departmentId + capabilities only", () => {
    // Document the save contract: what the form posts (and the action persists).
    const preset = findResponsibilityPreset("plant_mechanical_room")!;
    const savePayload = {
      spaceId: "space_example",
      departmentId: "dept_example",
      capabilities: [...preset.defaultCapabilities],
    };
    assert.deepEqual(Object.keys(savePayload).sort(), [
      "capabilities",
      "departmentId",
      "spaceId",
    ]);
    assert.ok(!("presetKey" in savePayload));
    assert.ok(!("preset" in savePayload));
  });
});
