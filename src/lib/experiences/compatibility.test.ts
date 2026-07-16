import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CAPABILITY_KEYS } from "@/lib/facility-builder/load-facility-hierarchy";

import {
  COMPATIBILITY_MAPPINGS,
  assertCapabilitiesHaveCompatibility,
  assertCompatibilityTargetsValid,
  experienceKeyForCapability,
  experiencesFromCapabilities,
  findCompatibilityMapping,
  resolveLegacyConcept,
  toolKeyForCapability,
} from "./compatibility";
import { isExperienceKey } from "./registry";
import { isExperienceToolKey } from "./tools";

describe("compatibility mappings", () => {
  it("maps every CAPABILITY_KEYS value", () => {
    assert.deepEqual(assertCapabilitiesHaveCompatibility(), []);
    for (const key of CAPABILITY_KEYS) {
      assert.ok(findCompatibilityMapping(key), `missing mapping for ${key}`);
    }
  });

  it("only targets known Experiences and tools", () => {
    assert.deepEqual(assertCompatibilityTargetsValid(), []);
  });

  it("maps Repair to Work Orders Experience", () => {
    const resolved = resolveLegacyConcept("Repair");
    assert.equal(resolved.kind, "experience");
    if (resolved.kind === "experience") {
      assert.equal(resolved.experience.key, "WORK_ORDERS");
    }
    assert.equal(experienceKeyForCapability("REPAIRS"), "WORK_ORDERS");
  });

  it("maps Temperature Logs to Temperature Monitoring with Logs tool", () => {
    const resolved = resolveLegacyConcept("Temperature Logs");
    assert.equal(resolved.kind, "experience");
    if (resolved.kind === "experience") {
      assert.equal(resolved.experience.key, "TEMPERATURE_MONITORING");
      assert.equal(resolved.emphasizedTool?.key, "LOGS");
    }
  });

  it("maps Cleaning Lists to Cleaning Lists Experience", () => {
    const resolved = resolveLegacyConcept("Cleaning Lists");
    assert.equal(resolved.kind, "experience");
    if (resolved.kind === "experience") {
      assert.equal(resolved.experience.key, "CLEANING_LISTS");
    }
  });

  it("maps Assignments to Assignments Experience", () => {
    const resolved = resolveLegacyConcept("Assignments");
    assert.equal(resolved.kind, "experience");
    if (resolved.kind === "experience") {
      assert.equal(resolved.experience.key, "ASSIGNMENTS");
    }
  });

  it("maps Knowledge capability to the Knowledge tool, not an Experience", () => {
    const resolved = resolveLegacyConcept("KNOWLEDGE");
    assert.equal(resolved.kind, "tool");
    if (resolved.kind === "tool") {
      assert.equal(resolved.tool.key, "KNOWLEDGE");
    }
    assert.equal(toolKeyForCapability("KNOWLEDGE"), "KNOWLEDGE");
    assert.equal(experienceKeyForCapability("KNOWLEDGE"), undefined);
    assert.equal(isExperienceKey("KNOWLEDGE"), false);
    assert.equal(isExperienceToolKey("KNOWLEDGE"), true);
  });

  it("translates capability arrays into Experience keys without tools", () => {
    const keys = experiencesFromCapabilities([
      "MEAL_SERVICE",
      "FOOD_SAFETY",
      "KNOWLEDGE",
      "REPAIRS",
      "REPAIRS",
    ]);
    assert.deepEqual(keys, [
      "MEAL_SERVICE",
      "TEMPERATURE_MONITORING",
      "WORK_ORDERS",
    ]);
  });

  it("returns unmapped for unknown legacy keys", () => {
    const resolved = resolveLegacyConcept("Totally Unknown Module");
    assert.equal(resolved.kind, "unmapped");
  });

  it("matches legacy keys case-insensitively", () => {
    assert.equal(findCompatibilityMapping("meal_service")?.targetKey, "MEAL_SERVICE");
    assert.equal(findCompatibilityMapping("work orders")?.targetKey, "WORK_ORDERS");
    assert.equal(findCompatibilityMapping("temperature logs")?.targetKey, "TEMPERATURE_MONITORING");
  });

  it("keeps mapping list non-empty and free of duplicate normalized keys", () => {
    assert.ok(COMPATIBILITY_MAPPINGS.length >= CAPABILITY_KEYS.length);
    const normalized = COMPATIBILITY_MAPPINGS.map((m) =>
      m.legacyKey.trim().toUpperCase().replace(/[\s-]+/g, "_"),
    );
    assert.equal(new Set(normalized).size, normalized.length);
  });
});
