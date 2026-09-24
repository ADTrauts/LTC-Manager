import assert from "node:assert/strict";
import test from "node:test";

import { stripeRecurringLineItemsForQuote } from "./checkout-items";
import { quoteBilling } from "./quote";
import {
  mergeLicensedDepartmentKeys,
  subscriptionItemUpdates,
} from "./subscription-items";

const env = {
  STRIPE_PRICE_FACILITY_MONTHLY: "price_fac_mo",
  STRIPE_PRICE_FACILITY_ANNUAL: "price_fac_yr",
  STRIPE_PRICE_ADDITIONAL_DEPT_MONTHLY: "price_add_mo",
  STRIPE_PRICE_ADDITIONAL_DEPT_ANNUAL: "price_add_yr",
  STRIPE_PRICE_WHOLE_FACILITY_MONTHLY: "price_whole_mo",
  STRIPE_PRICE_WHOLE_FACILITY_ANNUAL: "price_whole_yr",
  STRIPE_PRICE_SETUP_FIRST_DEPT: "price_setup_first",
  STRIPE_PRICE_SETUP_ADDITIONAL_DEPT: "price_setup_add",
};

const catalogPriceIds = new Set([
  "price_fac_mo",
  "price_fac_yr",
  "price_add_mo",
  "price_add_yr",
  "price_whole_mo",
  "price_whole_yr",
]);

function recurringItems(departmentCount: number) {
  return stripeRecurringLineItemsForQuote(
    quoteBilling({
      departmentCount,
      interval: "MONTHLY",
      setupPath: "SELF_SERVE",
    }),
    env,
  );
}

test("merge keeps current departments and appends new ones once", () => {
  assert.deepEqual(mergeLicensedDepartmentKeys(["DIETARY"], ["EVS", "DIETARY", "PLANT"]), [
    "DIETARY",
    "EVS",
    "PLANT",
  ]);
});

test("adding a second department adds the additional-department price", () => {
  const updates = subscriptionItemUpdates(
    [{ id: "si_facility", priceId: "price_fac_mo", quantity: 1 }],
    recurringItems(2),
    catalogPriceIds,
  );
  assert.deepEqual(updates, [{ price: "price_add_mo", quantity: 1 }]);
});

test("adding a third department increases additional-department quantity", () => {
  const updates = subscriptionItemUpdates(
    [
      { id: "si_facility", priceId: "price_fac_mo", quantity: 1 },
      { id: "si_add", priceId: "price_add_mo", quantity: 1 },
    ],
    recurringItems(3),
    catalogPriceIds,
  );
  assert.deepEqual(updates, [{ id: "si_add", quantity: 2 }]);
});

test("crossing the whole-facility ceiling replaces add-on items", () => {
  const updates = subscriptionItemUpdates(
    [
      { id: "si_facility", priceId: "price_fac_mo", quantity: 1 },
      { id: "si_add", priceId: "price_add_mo", quantity: 4 },
    ],
    recurringItems(6),
    catalogPriceIds,
  );
  assert.deepEqual(updates, [
    { price: "price_whole_mo", quantity: 1 },
    { id: "si_facility", deleted: true },
    { id: "si_add", deleted: true },
  ]);
});

test("unknown Stripe items are left on the subscription", () => {
  const updates = subscriptionItemUpdates(
    [
      { id: "si_facility", priceId: "price_fac_mo", quantity: 1 },
      { id: "si_other", priceId: "price_unknown", quantity: 1 },
    ],
    recurringItems(1),
    catalogPriceIds,
  );
  assert.deepEqual(updates, []);
});

test("recurring line items omit one-time setup even on an assisted quote", () => {
  const items = stripeRecurringLineItemsForQuote(
    quoteBilling({
      departmentCount: 2,
      interval: "MONTHLY",
      setupPath: "ASSISTED",
    }),
    env,
  );
  assert.deepEqual(items, [
    { price: "price_fac_mo", quantity: 1 },
    { price: "price_add_mo", quantity: 1 },
  ]);
});
