import assert from "node:assert/strict";
import test from "node:test";

import { catalogLineItemsForQuote } from "./line-items";
import { quoteBilling } from "./quote";
import {
  MissingStripePriceError,
  areStripePricesConfiguredForQuote,
  stripeCheckoutLineItemsForQuote,
} from "./checkout-items";

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

test("checkout line items carry Stripe Price IDs and catalog quantities", () => {
  const quote = quoteBilling({
    departmentCount: 3,
    interval: "ANNUAL",
    setupPath: "ASSISTED",
  });
  const items = stripeCheckoutLineItemsForQuote(quote, env);
  assert.deepEqual(items, [
    { price: "price_fac_yr", quantity: 1 },
    { price: "price_add_yr", quantity: 2 },
    { price: "price_setup_first", quantity: 1 },
    { price: "price_setup_add", quantity: 2 },
  ]);
  assert.equal(items.length, catalogLineItemsForQuote(quote).length);
});

test("whole-facility checkout uses the ceiling price instead of add-ons", () => {
  const quote = quoteBilling({
    departmentCount: 6,
    interval: "MONTHLY",
    setupPath: "SELF_SERVE",
  });
  assert.deepEqual(stripeCheckoutLineItemsForQuote(quote, env), [
    { price: "price_whole_mo", quantity: 1 },
  ]);
});

test("missing Price IDs fail closed instead of creating a $0 Checkout Session", () => {
  const quote = quoteBilling({
    departmentCount: 1,
    interval: "MONTHLY",
    setupPath: "SELF_SERVE",
  });
  assert.equal(areStripePricesConfiguredForQuote(quote, {}), false);
  assert.throws(
    () => stripeCheckoutLineItemsForQuote(quote, {}),
    (error: unknown) => error instanceof MissingStripePriceError && error.offering === "FACILITY",
  );
});
