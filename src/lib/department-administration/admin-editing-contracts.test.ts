import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assertProfileEditable,
  canTransitionProfileStatus,
  materializeBaselineProfilePlan,
} from "@/lib/department-administration";
import { EXPERIENCE_TOOL_KEYS, isExperienceKey } from "@/lib/experiences";

/**
 * Wave 14C regression: UI editing must not invent Experiences or bypass lifecycle.
 * Draft-edit service rules are covered here as pure contracts the UI depends on.
 */
describe("Department Administration editing contracts", () => {
  it("does not invent Knowledge/Logs/Forms as Experiences", () => {
    for (const departmentKey of ["DIETARY", "EVS", "PLANT"] as const) {
      const plan = materializeBaselineProfilePlan(departmentKey);
      const keys = plan.areas.flatMap((a) => [...a.experienceKeys]);
      for (const tool of EXPERIENCE_TOOL_KEYS) {
        assert.equal(isExperienceKey(tool), false);
        assert.ok(!keys.includes(tool));
      }
    }
  });

  it("only DRAFT profiles are editable for Area/Archetype/Room mutations", () => {
    assert.doesNotThrow(() => assertProfileEditable("DRAFT"));
    assert.throws(() => assertProfileEditable("ACTIVE"));
    assert.throws(() => assertProfileEditable("CERTIFIED"));
    assert.throws(() => assertProfileEditable("RETIRED"));
  });

  it("certify then activate remains the only path to ACTIVE", () => {
    assert.equal(canTransitionProfileStatus("DRAFT", "ACTIVE"), false);
    assert.equal(canTransitionProfileStatus("DRAFT", "CERTIFIED"), true);
    assert.equal(canTransitionProfileStatus("CERTIFIED", "ACTIVE"), true);
  });
});
