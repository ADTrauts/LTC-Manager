import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { persistDefaultPaymentMethod } from "./persist-default-payment-method";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

test("shared sync persists the Stripe subscription default payment method locally", async () => {
  const updates: Array<{ facilityId: string; paymentMethodId: string }> = [];
  const persisted = await persistDefaultPaymentMethod("fac_1", "sub_1", "cus_1", {
    isConfigured: () => true,
    retrieveSubscription: async (id) => {
      assert.equal(id, "sub_1");
      return { default_payment_method: "pm_sub" };
    },
    retrieveCustomer: async () => {
      throw new Error("customer should not be read when subscription has a default");
    },
    updateFacility: async (facilityId, paymentMethodId) => {
      updates.push({ facilityId, paymentMethodId });
    },
  });

  assert.equal(persisted, "pm_sub");
  assert.deepEqual(updates, [{ facilityId: "fac_1", paymentMethodId: "pm_sub" }]);
});

test("shared sync falls back to the Stripe customer invoice default payment method", async () => {
  const persisted = await persistDefaultPaymentMethod("fac_1", "sub_1", "cus_1", {
    isConfigured: () => true,
    retrieveSubscription: async () => ({ default_payment_method: null }),
    retrieveCustomer: async (id) => {
      assert.equal(id, "cus_1");
      return { invoice_settings: { default_payment_method: { id: "pm_cus" } } };
    },
    updateFacility: async () => {},
  });
  assert.equal(persisted, "pm_cus");
});

test("shared sync does not write when Stripe has no default payment method", async () => {
  let wrote = false;
  const persisted = await persistDefaultPaymentMethod("fac_1", "sub_1", "cus_1", {
    isConfigured: () => true,
    retrieveSubscription: async () => ({ default_payment_method: null }),
    retrieveCustomer: async () => ({ invoice_settings: { default_payment_method: null } }),
    updateFacility: async () => {
      wrote = true;
    },
  });
  assert.equal(persisted, null);
  assert.equal(wrote, false);
});

test("shared sync does not call Stripe when the secret is missing", async () => {
  const persisted = await persistDefaultPaymentMethod("fac_1", "sub_1", "cus_1", {
    isConfigured: () => false,
    retrieveSubscription: async () => {
      throw new Error("Stripe should not be contacted");
    },
    updateFacility: async () => {
      throw new Error("local write should not happen");
    },
  });
  assert.equal(persisted, null);
});

test("Harbor and admin billing share persistDefaultPaymentMethod through syncFacilityBillingFromStripe", () => {
  const reconcile = source("src/lib/billing/reconcile-from-stripe.ts");
  const checkout = source("src/lib/billing/sync-from-stripe.ts");
  const admin = source("src/app/(protected)/admin/billing/page.tsx");
  const persist = source("src/lib/billing/persist-default-payment-method.ts");

  assert.match(reconcile, /persistDefaultPaymentMethod\(/);
  assert.match(reconcile, /applyResolvedStripeSubscription/);
  assert.match(checkout, /persistDefaultPaymentMethod\(/);
  assert.match(admin, /syncFacilityBillingFromStripe/);
  assert.doesNotMatch(admin, /persistDefaultPaymentMethod/);
  assert.doesNotMatch(persist, /subscriptions\.update|subscriptions\.create|paymentMethods\.attach/);
});
