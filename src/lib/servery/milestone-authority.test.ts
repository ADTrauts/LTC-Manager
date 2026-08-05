import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, type AppRole } from "@/lib/access";

import {
  decideServeryMilestoneAuthority,
  describeMilestoneDenial,
  roleMayCorrectMilestones,
  type ServeryMilestoneAuthorityInput,
} from "./milestone-authority";

/** An actor who satisfies every scope requirement, so each test varies exactly one fact. */
function authorized(overrides: Partial<ServeryMilestoneAuthorityInput> = {}) {
  const base: ServeryMilestoneAuthorityInput = {
    action: "RECORD",
    role: "STAFF",
    authMethod: "PASSWORD",
    unitInSessionFacility: true,
    unitRunsMealService: true,
    dietaryDepartmentActive: true,
    actorInDietaryDepartment: true,
    actorActive: true,
    actorHasUnitAuthority: true,
    deviceBoundUnitId: null,
    targetUnitId: "unit-1",
  };
  return { ...base, ...overrides };
}

test("STAFF and LEAD_TEAM_MEMBER may record inside their own unit", () => {
  for (const role of ["STAFF", "LEAD_TEAM_MEMBER"] as AppRole[]) {
    const decision = decideServeryMilestoneAuthority(authorized({ role }));
    assert.equal(decision.allowed, true, `${role} may record`);
  }
});

test("SUPERVISOR and above may record on facility and department scope without a unit row", () => {
  for (const role of ["SUPERVISOR", "MANAGER", "GM", "FACILITY_ADMINISTRATOR"] as AppRole[]) {
    const decision = decideServeryMilestoneAuthority(
      authorized({ role, actorHasUnitAuthority: false }),
    );
    assert.equal(decision.allowed, true, `${role} may record on scope`);
  }
});

test("a frontline actor without unit authority is refused", () => {
  for (const role of ["STAFF", "LEAD_TEAM_MEMBER"] as AppRole[]) {
    const decision = decideServeryMilestoneAuthority(
      authorized({ role, actorHasUnitAuthority: false }),
    );
    assert.deepEqual(decision, { allowed: false, reason: "UNIT_AUTHORITY_REQUIRED" });
  }
});

test("Facility Administrator status alone does not grant frontline authority", () => {
  // The product decision this encodes: administering accounts is not the same as working a line.
  const decision = decideServeryMilestoneAuthority(
    authorized({ role: "FACILITY_ADMINISTRATOR", actorInDietaryDepartment: false }),
  );
  assert.deepEqual(decision, { allowed: false, reason: "DEPARTMENT_RELATIONSHIP_REQUIRED" });
});

test("a PIN session carries no more authority than the same role with a password", () => {
  for (const role of APP_ROLES) {
    const withPassword = decideServeryMilestoneAuthority(
      authorized({ role, authMethod: "PASSWORD" }),
    );
    const withPin = decideServeryMilestoneAuthority(authorized({ role, authMethod: "QUICK_PIN" }));
    assert.deepEqual(withPin, withPassword, `${role} decision does not depend on credential`);
  }
});

test("a PIN session does not widen a frontline actor's unit scope", () => {
  const decision = decideServeryMilestoneAuthority(
    authorized({ role: "STAFF", authMethod: "QUICK_PIN", actorHasUnitAuthority: false }),
  );
  assert.deepEqual(decision, { allowed: false, reason: "UNIT_AUTHORITY_REQUIRED" });
});

test("a unit outside the session facility is refused before anything else is considered", () => {
  for (const role of APP_ROLES) {
    const decision = decideServeryMilestoneAuthority(
      authorized({ role, unitInSessionFacility: false }),
    );
    assert.deepEqual(decision, { allowed: false, reason: "UNIT_OUT_OF_SCOPE" });
  }
});

test("a unit that does not run meal service is refused", () => {
  const decision = decideServeryMilestoneAuthority(authorized({ unitRunsMealService: false }));
  assert.deepEqual(decision, { allowed: false, reason: "UNIT_NOT_MEAL_SERVICE" });
});

test("an inactive dietary department blocks recording for every role", () => {
  for (const role of APP_ROLES) {
    const decision = decideServeryMilestoneAuthority(
      authorized({ role, dietaryDepartmentActive: false }),
    );
    assert.deepEqual(decision, { allowed: false, reason: "DEPARTMENT_UNAVAILABLE" });
  }
});

test("an inactive actor is refused for every role", () => {
  for (const role of APP_ROLES) {
    const decision = decideServeryMilestoneAuthority(authorized({ role, actorActive: false }));
    assert.deepEqual(decision, { allowed: false, reason: "ACTOR_INACTIVE" });
  }
});

test("a unit-locked tablet may not record for another unit", () => {
  const decision = decideServeryMilestoneAuthority(
    authorized({ role: "GM", deviceBoundUnitId: "unit-other", targetUnitId: "unit-1" }),
  );
  assert.deepEqual(decision, { allowed: false, reason: "DEVICE_UNIT_CONFLICT" });
});

test("a unit-locked tablet recording for its own unit is allowed", () => {
  const decision = decideServeryMilestoneAuthority(
    authorized({ deviceBoundUnitId: "unit-1", targetUnitId: "unit-1" }),
  );
  assert.equal(decision.allowed, true);
});

test("correcting requires supervisor or above", () => {
  for (const role of ["STAFF", "LEAD_TEAM_MEMBER"] as AppRole[]) {
    const decision = decideServeryMilestoneAuthority(authorized({ role, action: "CORRECT" }));
    assert.deepEqual(decision, { allowed: false, reason: "CORRECTION_ROLE_REQUIRED" });
    assert.equal(roleMayCorrectMilestones(role), false);
  }
  for (const role of ["SUPERVISOR", "MANAGER", "GM", "FACILITY_ADMINISTRATOR"] as AppRole[]) {
    const decision = decideServeryMilestoneAuthority(authorized({ role, action: "CORRECT" }));
    assert.equal(decision.allowed, true, `${role} may correct`);
    assert.equal(roleMayCorrectMilestones(role), true);
  }
});

test("every denial reason has neutral operator copy", () => {
  const reasons = [
    "UNSUPPORTED_ROLE",
    "UNIT_OUT_OF_SCOPE",
    "UNIT_NOT_MEAL_SERVICE",
    "DEPARTMENT_UNAVAILABLE",
    "DEPARTMENT_RELATIONSHIP_REQUIRED",
    "ACTOR_INACTIVE",
    "UNIT_AUTHORITY_REQUIRED",
    "DEVICE_UNIT_CONFLICT",
    "CORRECTION_ROLE_REQUIRED",
    "CORRECTION_REASON_REQUIRED",
  ] as const;
  for (const reason of reasons) {
    const copy = describeMilestoneDenial(reason);
    assert.ok(copy.length > 0, `${reason} has copy`);
    assert.doesNotMatch(copy, /error|exception|null|undefined/i, `${reason} copy is operator-facing`);
  }
});

test("an out-of-scope unit is reported as not found rather than forbidden", () => {
  // Existence of another facility's unit must not be disclosed through the denial reason.
  assert.equal(describeMilestoneDenial("UNIT_OUT_OF_SCOPE"), "This location was not found.");
});
