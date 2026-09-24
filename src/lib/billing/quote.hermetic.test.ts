import assert from "node:assert/strict";
import test from "node:test";

import { BILLING_LIST } from "./catalog";
import { catalogLineItemsForQuote } from "./line-items";
import { listedMonthlyCentsForDepartments, quoteBilling, setupFeeCents } from "./quote";

test("listed monthly matches the working commercial model", () => {
  assert.equal(listedMonthlyCentsForDepartments(0), 0);
  assert.equal(listedMonthlyCentsForDepartments(1), 29_900);
  assert.equal(listedMonthlyCentsForDepartments(2), 44_800);
  assert.equal(listedMonthlyCentsForDepartments(3), 59_700);
  assert.equal(listedMonthlyCentsForDepartments(4), 74_600);
  assert.equal(listedMonthlyCentsForDepartments(5), 89_500);
  assert.equal(listedMonthlyCentsForDepartments(6), 99_900);
  assert.equal(listedMonthlyCentsForDepartments(10), BILLING_LIST.facilityCeilingMonthlyCents);
});

test("monthly quote is list; annual quote is 10% off 12 × list", () => {
  const annual = quoteBilling({
    departmentCount: 1,
    interval: "ANNUAL",
    setupPath: "SELF_SERVE",
  });
  assert.equal(annual.billedRecurringCents, 322_920);
  assert.equal(annual.setupFeeCents, 0);
  assert.equal(annual.offering, "FACILITY_PLUS_ADDONS");

  const monthly = quoteBilling({
    departmentCount: 1,
    interval: "MONTHLY",
    setupPath: "SELF_SERVE",
  });
  assert.equal(monthly.billedRecurringCents, 29_900);
});

test("three-department annual is 10% off the Dietary + EVS + Laundry list", () => {
  const quote = quoteBilling({
    departmentCount: 3,
    interval: "ANNUAL",
    setupPath: "SELF_SERVE",
  });
  assert.equal(quote.listedMonthlyCents, 59_700);
  assert.equal(quote.billedRecurringCents, 644_760);
  assert.equal(quote.additionalDepartmentQuantity, 2);
  assert.equal(quote.atFacilityCeiling, false);
});

test("self-setup has no implementation fee; assisted setup is first + extras", () => {
  assert.equal(setupFeeCents("SELF_SERVE", 3), 0);
  assert.equal(setupFeeCents("ASSISTED", 1), 150_000);
  assert.equal(setupFeeCents("ASSISTED", 3), 250_000);
});

test("ceiling uses the whole-facility offering instead of overflowing add-ons", () => {
  const quote = quoteBilling({
    departmentCount: 6,
    interval: "ANNUAL",
    setupPath: "ASSISTED",
  });
  assert.equal(quote.offering, "WHOLE_FACILITY");
  assert.equal(quote.additionalDepartmentQuantity, 0);
  assert.equal(quote.setupFeeCents, 400_000);

  const items = catalogLineItemsForQuote(quote);
  assert.deepEqual(
    items.map((item) => item.offering),
    ["WHOLE_FACILITY", "SETUP_FIRST", "SETUP_ADDITIONAL"],
  );
  const additionalSetup = items.find((item) => item.offering === "SETUP_ADDITIONAL");
  assert.equal(additionalSetup?.quantity, 5);
});

test("self-serve line items omit setup products", () => {
  const items = catalogLineItemsForQuote(
    quoteBilling({ departmentCount: 2, interval: "MONTHLY", setupPath: "SELF_SERVE" }),
  );
  assert.deepEqual(
    items.map((item) => ({ offering: item.offering, quantity: item.quantity })),
    [
      { offering: "FACILITY", quantity: 1 },
      { offering: "ADDITIONAL_DEPARTMENT", quantity: 1 },
    ],
  );
});
