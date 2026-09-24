import assert from "node:assert/strict";
import test from "node:test";

import { formatUsdCents } from "./format";
import {
  billingStatusFromStripeSubscription,
  parseCheckoutDepartmentKeys,
  subscriptionIdFromStripeInvoice,
} from "./status";
import { checkoutSelectionFromMetadata } from "./status";

test("annual list formats with cents", () => {
  assert.equal(formatUsdCents(322_920), "$3,229.20");
  assert.equal(formatUsdCents(29_900), "$299.00");
});

test("department keys stay unique and trimmed", () => {
  assert.deepEqual(parseCheckoutDepartmentKeys("DIETARY, EVS,DIETARY"), ["DIETARY", "EVS"]);
  assert.deepEqual(parseCheckoutDepartmentKeys(""), []);
});

test("Stripe subscription statuses map onto FacilityBillingStatus", () => {
  assert.equal(billingStatusFromStripeSubscription("active"), "ACTIVE");
  assert.equal(billingStatusFromStripeSubscription("past_due"), "PAST_DUE");
  assert.equal(billingStatusFromStripeSubscription("canceled"), "CANCELED");
  assert.equal(billingStatusFromStripeSubscription("incomplete"), "INCOMPLETE");
  assert.equal(billingStatusFromStripeSubscription("not_a_status"), null);
});

test("invoice subscription id reads both classic and parent shapes", () => {
  assert.equal(subscriptionIdFromStripeInvoice({ subscription: "sub_classic" }), "sub_classic");
  assert.equal(
    subscriptionIdFromStripeInvoice({
      parent: { subscription_details: { subscription: "sub_parent" } },
    }),
    "sub_parent",
  );
});

test("checkout metadata defaults interval and setup path", () => {
  const parsed = checkoutSelectionFromMetadata({
    facilityId: "fac_1",
    departmentKeys: "DIETARY,PLANT",
  });
  assert.equal(parsed.interval, "ANNUAL");
  assert.equal(parsed.setupPath, "SELF_SERVE");
  assert.deepEqual(parsed.departmentKeys, ["DIETARY", "PLANT"]);
});
