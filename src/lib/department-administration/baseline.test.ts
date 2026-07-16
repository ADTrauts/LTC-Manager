import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isExperienceKey, listOperationalAreasForDepartment } from "@/lib/experiences";

import { recommendArchetypeKey } from "./archetype-recommendation";
import {
  BASELINE_DEPARTMENT_KEYS,
  isBaselineDepartmentKey,
  materializeBaselineProfilePlan,
} from "./baseline";

describe("system department baselines", () => {
  it("Dietary baseline creates expected ordered Areas", () => {
    const plan = materializeBaselineProfilePlan("DIETARY");
    assert.deepEqual(
      plan.areas.map((a) => a.name),
      [
        "Service",
        "Food Safety",
        "Equipment",
        "People",
        "Documentation",
        "Production",
        "Quality",
      ],
    );
    const orders = plan.areas.map((a) => a.sortOrder);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  it("EVS baseline creates expected ordered Areas", () => {
    const plan = materializeBaselineProfilePlan("EVS");
    assert.deepEqual(
      plan.areas.map((a) => a.name),
      ["Cleaning", "Room Status", "Equipment", "Compliance", "People"],
    );
  });

  it("Plant baseline creates expected ordered Areas", () => {
    const plan = materializeBaselineProfilePlan("PLANT");
    assert.deepEqual(
      plan.areas.map((a) => a.name),
      [
        "Assets",
        "Work Orders",
        "Preventive Maintenance",
        "Utilities",
        "Compliance",
        "People",
      ],
    );
  });

  it("every baseline Experience key resolves from the registry", () => {
    for (const departmentKey of BASELINE_DEPARTMENT_KEYS) {
      const plan = materializeBaselineProfilePlan(departmentKey);
      for (const area of plan.areas) {
        for (const key of area.experienceKeys) {
          assert.ok(isExperienceKey(key), `${departmentKey}/${area.key}: ${key}`);
        }
      }
      for (const archetype of plan.archetypes) {
        for (const key of archetype.experienceKeys) {
          assert.ok(isExperienceKey(key), `${departmentKey}/${archetype.key}: ${key}`);
        }
      }
    }
  });

  it("places each Experience exactly once across baseline Areas", () => {
    for (const departmentKey of BASELINE_DEPARTMENT_KEYS) {
      const plan = materializeBaselineProfilePlan(departmentKey);
      const seen = new Set<string>();
      for (const area of plan.areas) {
        for (const key of area.experienceKeys) {
          assert.ok(!seen.has(key), `${departmentKey}: ${key} placed twice`);
          seen.add(key);
        }
      }
    }
  });

  it("never invents Knowledge/Logs/Forms as top-level Experiences", () => {
    for (const departmentKey of BASELINE_DEPARTMENT_KEYS) {
      const plan = materializeBaselineProfilePlan(departmentKey);
      const allKeys = plan.areas.flatMap((a) => [...a.experienceKeys]);
      for (const toolKey of ["KNOWLEDGE", "LOGS", "FORMS", "TASKS", "RECORDS"]) {
        assert.ok(
          !allKeys.includes(toolKey),
          `${departmentKey} baseline must not contain tool ${toolKey}`,
        );
      }
    }
  });

  it("archetype Experience keys always exist in baseline areas", () => {
    for (const departmentKey of BASELINE_DEPARTMENT_KEYS) {
      const plan = materializeBaselineProfilePlan(departmentKey);
      const areaKeys = new Set(plan.areas.flatMap((a) => [...a.experienceKeys]));
      for (const archetype of plan.archetypes) {
        for (const key of archetype.experienceKeys) {
          assert.ok(areaKeys.has(key), `${departmentKey}/${archetype.key}: ${key}`);
        }
      }
    }
  });

  it("mirrors the registry area structure without duplicating definitions", () => {
    const plan = materializeBaselineProfilePlan("DIETARY");
    const registryAreas = listOperationalAreasForDepartment("DIETARY");
    assert.equal(plan.areas.length, registryAreas.length);
    for (let i = 0; i < plan.areas.length; i++) {
      assert.equal(plan.areas[i]!.key, registryAreas[i]!.key);
      assert.deepEqual(
        [...plan.areas[i]!.experienceKeys],
        [...registryAreas[i]!.experienceKeys],
      );
    }
  });

  it("rejects unknown baseline departments", () => {
    assert.equal(isBaselineDepartmentKey("LAUNDRY"), false);
    assert.throws(() => materializeBaselineProfilePlan("LAUNDRY"));
  });
});

describe("archetype recommendations", () => {
  it("recommends department-appropriate archetypes from physical presets", () => {
    assert.equal(recommendArchetypeKey("DIETARY", "servery"), "servery");
    assert.equal(
      recommendArchetypeKey("EVS", "resident_room"),
      "occupied_resident_room",
    );
    assert.equal(
      recommendArchetypeKey("PLANT", "mechanical_room"),
      "mechanical_room",
    );
  });

  it("returns undefined for unknown types or departments (recommendation only)", () => {
    assert.equal(recommendArchetypeKey("DIETARY", "mechanical_room"), undefined);
    assert.equal(recommendArchetypeKey("LAUNDRY", "servery"), undefined);
    assert.equal(recommendArchetypeKey("EVS", null), undefined);
  });

  it("is pure — recommending does not persist anything", () => {
    // Function accepts only value inputs and returns a string; there is no
    // storage surface to mutate. Recommendation != binding by construction.
    const first = recommendArchetypeKey("DIETARY", "servery");
    const second = recommendArchetypeKey("DIETARY", "servery");
    assert.equal(first, second);
  });
});
