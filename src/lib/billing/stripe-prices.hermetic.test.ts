import assert from "node:assert/strict";
import test from "node:test";

import { areAllCatalogPricesConfigured, stripePriceIdForOffering } from "./stripe-prices";

test("maps catalog offerings to configured Stripe Price IDs", () => {
  const env = {
    STRIPE_PRICE_FACILITY_ANNUAL: "price_facility_year",
    STRIPE_PRICE_SETUP_FIRST_DEPT: "price_setup_first",
  };
  assert.equal(stripePriceIdForOffering("FACILITY", "ANNUAL", env), "price_facility_year");
  assert.equal(stripePriceIdForOffering("SETUP_FIRST", undefined, env), "price_setup_first");
  assert.equal(stripePriceIdForOffering("WHOLE_FACILITY", "MONTHLY", env), null);
});

test("all catalog Price IDs must be present before checkout is offered", () => {
  assert.equal(areAllCatalogPricesConfigured({}), false);
  assert.equal(
    areAllCatalogPricesConfigured({
      STRIPE_PRICE_FACILITY_MONTHLY: "p1",
      STRIPE_PRICE_FACILITY_ANNUAL: "p2",
      STRIPE_PRICE_ADDITIONAL_DEPT_MONTHLY: "p3",
      STRIPE_PRICE_ADDITIONAL_DEPT_ANNUAL: "p4",
      STRIPE_PRICE_WHOLE_FACILITY_MONTHLY: "p5",
      STRIPE_PRICE_WHOLE_FACILITY_ANNUAL: "p6",
      STRIPE_PRICE_SETUP_FIRST_DEPT: "p7",
      STRIPE_PRICE_SETUP_ADDITIONAL_DEPT: "p8",
    }),
    true,
  );
});
