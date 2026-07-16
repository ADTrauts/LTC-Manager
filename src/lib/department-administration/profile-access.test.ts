import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isDepartmentOperationalProfilesEnabled } from "@/lib/feature-flags";

import { validateExperienceConfiguration } from "./configuration";
import { checkProfileWriteAccess } from "./profile-access";

const BASE = {
  flagEnabled: true,
  role: "MANAGER" as const,
  sessionFacilityId: "f1",
  targetFacilityId: "f1",
};

describe("profile write access", () => {
  it("allows Manager+ in the same facility with the flag on", () => {
    assert.equal(checkProfileWriteAccess(BASE), null);
    assert.equal(
      checkProfileWriteAccess({ ...BASE, role: "FACILITY_ADMINISTRATOR" }),
      null,
    );
    assert.equal(checkProfileWriteAccess({ ...BASE, role: "GM" }), null);
  });

  it("rejects when the feature flag is off", () => {
    const denial = checkProfileWriteAccess({ ...BASE, flagEnabled: false });
    assert.equal(denial?.code, "feature_disabled");
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

describe("feature flag default", () => {
  it("DEPARTMENT_OPERATIONAL_PROFILES_ENABLED defaults to disabled", () => {
    const prior = process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED;
    delete process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED;
    try {
      assert.equal(isDepartmentOperationalProfilesEnabled(), false);
    } finally {
      if (prior !== undefined) {
        process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED = prior;
      }
    }
  });

  it("flag on/off parsing follows repository convention", () => {
    const prior = process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED;
    try {
      process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED = "true";
      assert.equal(isDepartmentOperationalProfilesEnabled(), true);
      process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED = "false";
      assert.equal(isDepartmentOperationalProfilesEnabled(), false);
    } finally {
      if (prior === undefined) {
        delete process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED;
      } else {
        process.env.DEPARTMENT_OPERATIONAL_PROFILES_ENABLED = prior;
      }
    }
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
