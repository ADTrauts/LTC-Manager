import assert from "node:assert/strict";
import test from "node:test";

import { BILLING_STRIPE_LOOKUP_KEYS, BILLING_STRIPE_PRODUCTS } from "./catalog";

test("customer-facing Stripe product names use Vssyl", () => {
  assert.equal(BILLING_STRIPE_PRODUCTS.FACILITY, "Vssyl — Facility");
  assert.equal(BILLING_STRIPE_PRODUCTS.ADDITIONAL_DEPARTMENT, "Vssyl — Additional department");
  assert.equal(BILLING_STRIPE_PRODUCTS.WHOLE_FACILITY, "Vssyl — Whole facility");
  assert.equal(BILLING_STRIPE_PRODUCTS.SETUP_FIRST, "Vssyl — Assisted setup (first department)");
  assert.equal(BILLING_STRIPE_PRODUCTS.SETUP_ADDITIONAL, "Vssyl — Assisted setup (additional department)");
});

test("Stripe lookup keys remain the retained ltc_* identifiers", () => {
  assert.equal(BILLING_STRIPE_LOOKUP_KEYS.FACILITY_MONTHLY, "ltc_facility_monthly");
  assert.equal(BILLING_STRIPE_LOOKUP_KEYS.FACILITY_ANNUAL, "ltc_facility_annual");
  assert.equal(BILLING_STRIPE_LOOKUP_KEYS.ADDITIONAL_DEPT_MONTHLY, "ltc_additional_dept_monthly");
  assert.equal(BILLING_STRIPE_LOOKUP_KEYS.ADDITIONAL_DEPT_ANNUAL, "ltc_additional_dept_annual");
  assert.equal(BILLING_STRIPE_LOOKUP_KEYS.WHOLE_FACILITY_MONTHLY, "ltc_whole_facility_monthly");
  assert.equal(BILLING_STRIPE_LOOKUP_KEYS.WHOLE_FACILITY_ANNUAL, "ltc_whole_facility_annual");
  assert.equal(BILLING_STRIPE_LOOKUP_KEYS.SETUP_FIRST, "ltc_setup_first");
  assert.equal(BILLING_STRIPE_LOOKUP_KEYS.SETUP_ADDITIONAL, "ltc_setup_additional");
});
