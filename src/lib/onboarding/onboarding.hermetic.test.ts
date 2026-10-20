import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveCommercialEntitlement } from "@/lib/department-products/eligibility";
import { deriveFacilityDepartmentCatalog } from "@/lib/department-products/facility-catalog";
import { selectCustomerOperableDepartments } from "@/lib/department-products/load-facility-catalog";
import { getDepartmentProduct, matchEntitlementStatusForProduct } from "@/lib/department-products/registry";
import { billingStatusFromStripeSubscription } from "@/lib/billing/status";
import { onboardingCommercialStatus } from "./status";

for (const enforced of [false, true]) test(`commercial matrix agrees in catalog and picker; enforcement=${enforced}`, () => {
  const departments = [{ id: "d", key: "DIETARY", isActive: true }];
  for (const status of ["UNMANAGED", "INCOMPLETE", "ACTIVE", "PAST_DUE", "UNPAID", "PAUSED", "CANCELED"] as const) {
    for (const entitlementStatus of ["ACTIVE", "REVOKED", null] as const) {
      const entitlements = entitlementStatus ? [{ departmentKey: "DIETARY", status: entitlementStatus }] : [];
      const expected = entitlementStatus !== "REVOKED" && !["INCOMPLETE", "UNPAID", "PAUSED", "CANCELED"].includes(status) &&
        (entitlementStatus === "ACTIVE" || (!enforced && status !== "PAST_DUE"));
      assert.equal(resolveCommercialEntitlement({ releaseStatus: "AVAILABLE", billingStatus: status, entitlementStatus, entitlementsEnforced: enforced, installed: true }), expected, `${status}/${entitlementStatus}`);
      assert.equal(deriveFacilityDepartmentCatalog({ departments, entitlements, billingStatus: status, entitlementsEnforced: enforced })[0]!.operable, expected);
      assert.equal(selectCustomerOperableDepartments(departments, { entitlements, billingStatus: status, entitlementsEnforced: enforced }).length, expected ? 1 : 0);
    }
  }
});

test("unpaid and paused are suspension states, never past-due grace", () => {
  assert.equal(billingStatusFromStripeSubscription("unpaid"), "UNPAID");
  assert.equal(billingStatusFromStripeSubscription("paused"), "PAUSED");
  assert.equal(billingStatusFromStripeSubscription("past_due"), "PAST_DUE");
  for (const releaseStatus of ["DEVELOPMENT", "RETIRED"] as const) {
    assert.equal(resolveCommercialEntitlement({ releaseStatus, entitlementStatus: null, billingStatus: "UNMANAGED", entitlementsEnforced: false, installed: true }), false);
  }
});

test("payment, installation and operation availability are independent derived facts", () => {
  const catalog = [{ licensed: true, installed: false, operable: false }];
  assert.equal(onboardingCommercialStatus({ billingStatus: "ACTIVE", catalog }), "INSTALLATION_PENDING");
  assert.equal(onboardingCommercialStatus({ billingStatus: "INCOMPLETE", catalog }), "PAYMENT_PENDING");
  assert.equal(onboardingCommercialStatus({ billingStatus: "UNPAID", catalog }), "PAYMENT_REQUIRED");
  assert.equal(onboardingCommercialStatus({ billingStatus: null, catalog: [] }), "NOT_LICENSED");
});

test("all runtime journey writes delegate to the transition owner; cards cannot advance setup", () => {
  for (const file of ["src/app/api/onboarding/state/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /(?:save|transition)FacilityOnboarding/);
    assert.doesNotMatch(source, /onboardingCompletedAt:\s*new Date|onboardingStartedAt:\s*new Date/);
  }
  for (const file of ["src/lib/billing/webhook-handlers.ts", "src/app/api/billing/payment-method/default/route.ts", "src/app/api/onboarding/locations/route.ts", "src/app/api/onboarding/managers/route.ts", "src/app/setup/page.tsx"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /onboardingCurrentStep|onboardingCompletedAt|onboardingStartedAt/);
  }
});


test("canonical persisted revocation cannot be bypassed by a stale Product alias grant", () => {
  const product = getDepartmentProduct("DIETARY")!;
  assert.equal(matchEntitlementStatusForProduct([
    { departmentKey: "DIETARY", status: "REVOKED" },
    { departmentKey: "HEALTHCARE_FOOD_NUTRITION", status: "ACTIVE" },
  ], product), "REVOKED");
  assert.equal(matchEntitlementStatusForProduct([
    { departmentKey: "DIETARY", status: "ACTIVE" },
    { departmentKey: "HEALTHCARE_FOOD_NUTRITION", status: "REVOKED" },
  ], product), "ACTIVE");
});
