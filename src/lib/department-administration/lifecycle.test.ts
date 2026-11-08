import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assertProfileEditable,
  assertProfileTransition,
  canTransitionProfileStatus,
  isProfileDeletable,
  isProfileEditable,
  nextProfileVersion,
  planProfileActivation,
} from "./lifecycle";

describe("profile lifecycle — versions", () => {
  it("creates draft version 1 when no versions exist", () => {
    assert.equal(nextProfileVersion([]), 1);
  });

  it("creates subsequent draft versions after the max", () => {
    assert.equal(nextProfileVersion([1]), 2);
    assert.equal(nextProfileVersion([1, 2, 5]), 6);
  });
});

describe("profile lifecycle — transitions", () => {
  it("DRAFT is editable; other states are not", () => {
    assert.equal(isProfileEditable("DRAFT"), true);
    assert.equal(isProfileEditable("CERTIFIED"), false);
    assert.equal(isProfileEditable("ACTIVE"), false);
    assert.equal(isProfileEditable("RETIRED"), false);
    assert.doesNotThrow(() => assertProfileEditable("DRAFT"));
    assert.throws(() => assertProfileEditable("ACTIVE"));
  });

  it("DRAFT cannot activate directly", () => {
    assert.equal(canTransitionProfileStatus("DRAFT", "ACTIVE"), false);
    assert.throws(() => assertProfileTransition("DRAFT", "ACTIVE"));
  });

  it("valid DRAFT certifies", () => {
    assert.equal(canTransitionProfileStatus("DRAFT", "CERTIFIED"), true);
  });

  it("CERTIFIED activates", () => {
    assert.equal(canTransitionProfileStatus("CERTIFIED", "ACTIVE"), true);
  });

  it("ACTIVE only retires; RETIRED is terminal", () => {
    assert.equal(canTransitionProfileStatus("ACTIVE", "RETIRED"), true);
    assert.equal(canTransitionProfileStatus("ACTIVE", "DRAFT"), false);
    assert.equal(canTransitionProfileStatus("ACTIVE", "CERTIFIED"), false);
    assert.equal(canTransitionProfileStatus("RETIRED", "ACTIVE"), false);
    assert.equal(canTransitionProfileStatus("RETIRED", "DRAFT"), false);
  });

  it("certified/active/retired history is never deletable", () => {
    assert.equal(isProfileDeletable("DRAFT"), true);
    assert.equal(isProfileDeletable("CERTIFIED"), false);
    assert.equal(isProfileDeletable("ACTIVE"), false);
    assert.equal(isProfileDeletable("RETIRED"), false);
  });
});

describe("profile lifecycle — activation planning", () => {
  const base = { facilityId: "f1", departmentId: "d1" } as const;

  it("second activation retires the previous ACTIVE", () => {
    const plan = planProfileActivation(
      [
        { id: "p1", status: "ACTIVE", ...base },
        { id: "p2", status: "CERTIFIED", ...base },
      ],
      "p2",
    );
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.activateId, "p2");
    assert.deepEqual(plan.retireIds, ["p1"]);
  });

  it("keeps only one ACTIVE per facility department", () => {
    const plan = planProfileActivation(
      [
        { id: "p1", status: "ACTIVE", ...base },
        { id: "p2", status: "ACTIVE", facilityId: "f1", departmentId: "d2" },
        { id: "p3", status: "CERTIFIED", ...base },
      ],
      "p3",
    );
    // Other department's ACTIVE profile is untouched.
    assert.deepEqual(plan.retireIds, ["p1"]);
  });

  it("refuses to activate a DRAFT", () => {
    const plan = planProfileActivation(
      [{ id: "p1", status: "DRAFT", ...base }],
      "p1",
    );
    assert.ok(plan.errors.length > 0);
  });

  it("refuses to activate an unknown profile", () => {
    const plan = planProfileActivation([], "missing");
    assert.deepEqual(plan.errors, ["Profile not found"]);
  });

  it("retains history — activation plans never delete profiles", () => {
    const plan = planProfileActivation(
      [
        { id: "p1", status: "RETIRED", ...base },
        { id: "p2", status: "ACTIVE", ...base },
        { id: "p3", status: "CERTIFIED", ...base },
      ],
      "p3",
    );
    // p1 (RETIRED history) is untouched; p2 transitions to RETIRED, not deleted.
    assert.deepEqual(plan.retireIds, ["p2"]);
  });
});
