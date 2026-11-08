import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateExperienceConfiguration } from "./configuration";
import { checkPatternAuthoringAccess, checkProfileWriteAccess } from "./profile-access";

const BASE = {
  role: "MANAGER" as const,
  sessionFacilityId: "f1",
  targetFacilityId: "f1",
};

describe("profile write access", () => {
  it("allows Manager+ in the same facility", () => {
    assert.equal(checkProfileWriteAccess(BASE), null);
    assert.equal(
      checkProfileWriteAccess({ ...BASE, role: "FACILITY_ADMINISTRATOR" }),
      null,
    );
    assert.equal(checkProfileWriteAccess({ ...BASE, role: "GM" }), null);
  });

  it("rejects roles below Manager", () => {
    for (const role of ["SUPERVISOR", "LEAD_TEAM_MEMBER", "STAFF"] as const) {
      const denial = checkProfileWriteAccess({ ...BASE, role });
      assert.equal(denial?.code, "insufficient_role", role);
    }
  });

  it("rejects cross-facility access", () => {
    const denial = checkProfileWriteAccess({
      ...BASE,
      targetFacilityId: "f2",
    });
    assert.equal(denial?.code, "cross_facility");
  });
});

describe("pattern authoring access", () => {
  const patternBase = {
    role: "MANAGER" as const,
    authMethod: "PASSWORD" as const,
    sessionFacilityId: "f1",
    targetFacilityId: "f1",
  };

  it("allows Manager+ password sessions without the Profiles flag", () => {
    assert.equal(checkPatternAuthoringAccess(patternBase), null);
    assert.equal(
      checkPatternAuthoringAccess({ ...patternBase, role: "FACILITY_ADMINISTRATOR" }),
      null,
    );
  });

  it("rejects Quick PIN even for Manager+", () => {
    const denial = checkPatternAuthoringAccess({
      ...patternBase,
      authMethod: "QUICK_PIN",
    });
    assert.equal(denial?.code, "quick_pin");
  });

  it("rejects roles below Manager", () => {
    const denial = checkPatternAuthoringAccess({ ...patternBase, role: "SUPERVISOR" });
    assert.equal(denial?.code, "insufficient_role");
  });

  it("rejects cross-facility access", () => {
    const denial = checkPatternAuthoringAccess({
      ...patternBase,
      targetFacilityId: "f2",
    });
    assert.equal(denial?.code, "cross_facility");
  });
});

describe("bounded experience configuration", () => {
  it("accepts flat primitives and primitive arrays", () => {
    assert.deepEqual(
      validateExperienceConfiguration({
        mealPeriods: ["BREAKFAST", "LUNCH"],
        maxTrays: 40,
        selfService: false,
        note: "east wing",
      }),
      [],
    );
    assert.deepEqual(validateExperienceConfiguration(null), []);
  });

  it("rejects nested objects, functions-in-disguise, and oversized values", () => {
    assert.ok(
      validateExperienceConfiguration({ nested: { a: 1 } }).length > 0,
    );
    assert.ok(validateExperienceConfiguration([1, 2, 3]).length > 0);
    assert.ok(
      validateExperienceConfiguration({ big: "x".repeat(501) }).length > 0,
    );
    assert.ok(
      validateExperienceConfiguration({ mixed: ["a", 1] }).length > 0,
    );
    assert.ok(
      validateExperienceConfiguration({ "bad key!": true }).length > 0,
    );
  });
});
