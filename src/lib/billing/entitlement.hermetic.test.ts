import assert from "node:assert/strict";
import test from "node:test";
import { isDepartmentLicensed, type FacilityBillingStatus } from "./entitlement";
const dietary = [{ departmentKey: "DIETARY", status: "ACTIVE" as const }];

test("compatibility licensing delegates to canonical rollout, suspension and release rules", () => {
  for (const enforcementEnabled of [false, true]) {
    for (const billingStatus of ["INCOMPLETE", "CANCELED", "UNPAID", "PAUSED"] as FacilityBillingStatus[]) {
      assert.equal(isDepartmentLicensed({ enforcementEnabled, billingStatus, entitlements: dietary, departmentKey: "DIETARY", installed: true }), false);
    }
    assert.equal(isDepartmentLicensed({ enforcementEnabled, billingStatus: "ACTIVE", entitlements: dietary, departmentKey: "DIETARY", installed: true }), true);
    assert.equal(isDepartmentLicensed({ enforcementEnabled, billingStatus: "PAST_DUE", entitlements: dietary, departmentKey: "DIETARY", installed: true }), true);
    assert.equal(isDepartmentLicensed({ enforcementEnabled, billingStatus: "PAST_DUE", entitlements: dietary, departmentKey: "DIETARY", installed: false }), false);
    assert.equal(isDepartmentLicensed({ enforcementEnabled, billingStatus: "ACTIVE", entitlements: [{ departmentKey: "DIETARY", status: "REVOKED" }], departmentKey: "DIETARY", installed: true }), false);
    assert.equal(isDepartmentLicensed({ enforcementEnabled, billingStatus: "ACTIVE", entitlements: [{ departmentKey: "EVS", status: "ACTIVE" }], departmentKey: "EVS", installed: true }), false);
  }
  for (const installed of [false, true]) for (const enforcementEnabled of [false, true]) {
    assert.equal(isDepartmentLicensed({ enforcementEnabled, billingStatus: "UNMANAGED", entitlements: [], departmentKey: "DIETARY", installed }), installed && !enforcementEnabled);
  }
});
