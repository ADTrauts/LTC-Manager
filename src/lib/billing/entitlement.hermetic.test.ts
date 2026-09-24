import assert from "node:assert/strict";
import test from "node:test";

import { isDepartmentLicensed } from "./entitlement";

const dietary = [{ departmentKey: "DIETARY", status: "ACTIVE" as const }];

test("unenforced entitlements never block a department", () => {
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: false,
      billingStatus: "CANCELED",
      entitlements: [],
      departmentKey: "EVS",
    }),
    true,
  );
});

test("UNMANAGED facilities stay grandfathered when enforcement is on", () => {
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: true,
      billingStatus: "UNMANAGED",
      entitlements: [],
      departmentKey: "DIETARY",
    }),
    true,
  );
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: true,
      billingStatus: null,
      entitlements: [],
      departmentKey: "DIETARY",
    }),
    true,
  );
});

test("ACTIVE subscriptions require an active entitlement row", () => {
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: true,
      billingStatus: "ACTIVE",
      entitlements: dietary,
      departmentKey: "DIETARY",
    }),
    true,
  );
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: true,
      billingStatus: "ACTIVE",
      entitlements: dietary,
      departmentKey: "EVS",
    }),
    false,
  );
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: true,
      billingStatus: "PAST_DUE",
      entitlements: dietary,
      departmentKey: "DIETARY",
    }),
    true,
  );
});

test("INCOMPLETE and CANCELED block licensed modules", () => {
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: true,
      billingStatus: "INCOMPLETE",
      entitlements: dietary,
      departmentKey: "DIETARY",
    }),
    false,
  );
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: true,
      billingStatus: "CANCELED",
      entitlements: dietary,
      departmentKey: "DIETARY",
    }),
    false,
  );
});

test("revoked rows do not license the department", () => {
  assert.equal(
    isDepartmentLicensed({
      enforcementEnabled: true,
      billingStatus: "ACTIVE",
      entitlements: [{ departmentKey: "EVS", status: "REVOKED" }],
      departmentKey: "EVS",
    }),
    false,
  );
});
