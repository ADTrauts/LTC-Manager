import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  facilityStripeSyncResult,
  parseLicensedDepartmentKeysFromMetadata,
  planStripeSubscriptionReconciliation,
  selectSubscriptionForFacilitySync,
  type LocalBillingMirror,
} from "./reconcile-from-stripe";
import {
  isStripeTestMode,
  stripeCustomerDashboardUrl,
  stripeSubscriptionDashboardUrl,
} from "./stripe-dashboard";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const emptyLocal: LocalBillingMirror = {
  status: null,
  stripeSubscriptionId: null,
  interval: null,
  setupPath: null,
  departmentKeys: [],
};

function sub(input: {
  id?: string;
  status?: string;
  facilityId?: string;
  departmentKeys?: string;
  interval?: string;
  setupPath?: string;
}) {
  return {
    id: input.id ?? "sub_1",
    status: input.status ?? "active",
    metadata: {
      ...(input.facilityId ? { facilityId: input.facilityId } : {}),
      ...(input.departmentKeys !== undefined ? { departmentKeys: input.departmentKeys } : {}),
      ...(input.interval ? { interval: input.interval } : {}),
      ...(input.setupPath ? { setupPath: input.setupPath } : {}),
    },
  };
}

test("ACTIVE subscription with departmentKeys plans a local apply", () => {
  const plan = planStripeSubscriptionReconciliation({
    facilityId: "fac_1",
    subscription: sub({
      facilityId: "fac_1",
      departmentKeys: "DIETARY,PLANT",
      interval: "ANNUAL",
      setupPath: "SELF_SERVE",
    }),
    local: emptyLocal,
  });
  assert.equal(plan.action, "apply");
  if (plan.action !== "apply") return;
  assert.equal(plan.status, "ACTIVE");
  assert.deepEqual(plan.departmentKeys, ["DIETARY", "PLANT"]);
});

test("canceled subscription reconciles without requiring departmentKeys", () => {
  const plan = planStripeSubscriptionReconciliation({
    facilityId: "fac_1",
    subscription: sub({ status: "canceled", facilityId: "fac_1" }),
    local: {
      status: "ACTIVE",
      stripeSubscriptionId: "sub_1",
      interval: "ANNUAL",
      setupPath: "SELF_SERVE",
      departmentKeys: ["DIETARY"],
    },
  });
  assert.equal(plan.action, "apply");
  if (plan.action !== "apply") return;
  assert.equal(plan.status, "CANCELED");
  assert.deepEqual(plan.departmentKeys, []);
});

test("past_due maps according to existing billing rules", () => {
  const plan = planStripeSubscriptionReconciliation({
    facilityId: "fac_1",
    subscription: sub({
      status: "past_due",
      facilityId: "fac_1",
      departmentKeys: "DIETARY",
    }),
    local: emptyLocal,
  });
  assert.equal(plan.action, "apply");
  if (plan.action !== "apply") return;
  assert.equal(plan.status, "PAST_DUE");
});

test("departmentKeys shrink plans apply with the reduced set", () => {
  const plan = planStripeSubscriptionReconciliation({
    facilityId: "fac_1",
    subscription: sub({
      facilityId: "fac_1",
      departmentKeys: "DIETARY",
    }),
    local: {
      status: "ACTIVE",
      stripeSubscriptionId: "sub_1",
      interval: "ANNUAL",
      setupPath: "SELF_SERVE",
      departmentKeys: ["DIETARY", "PLANT"],
    },
  });
  assert.equal(plan.action, "apply");
  if (plan.action !== "apply") return;
  assert.deepEqual(plan.departmentKeys, ["DIETARY"]);
});

test("metadata for a different facility is rejected with no apply", () => {
  const plan = planStripeSubscriptionReconciliation({
    facilityId: "fac_1",
    subscription: sub({
      facilityId: "fac_OTHER",
      departmentKeys: "DIETARY",
    }),
    local: emptyLocal,
  });
  assert.deepEqual(plan, { action: "reject", code: "METADATA_FACILITY_MISMATCH" });
});

test("missing departmentKeys on ACTIVE fails safely", () => {
  const plan = planStripeSubscriptionReconciliation({
    facilityId: "fac_1",
    subscription: sub({ facilityId: "fac_1", departmentKeys: "" }),
    local: emptyLocal,
  });
  assert.deepEqual(plan, { action: "reject", code: "METADATA_INCOMPLETE" });
});

test("unknown department keys fail safely", () => {
  assert.deepEqual(parseLicensedDepartmentKeysFromMetadata("DIETARY,NOT_A_PRODUCT"), {
    ok: false,
    code: "UNKNOWN_DEPARTMENT_KEYS",
  });
  const plan = planStripeSubscriptionReconciliation({
    facilityId: "fac_1",
    subscription: sub({ facilityId: "fac_1", departmentKeys: "EVS" }),
    local: emptyLocal,
  });
  assert.deepEqual(plan, { action: "reject", code: "UNKNOWN_DEPARTMENT_KEYS" });
});

test("repeated matching sync is idempotent", () => {
  const plan = planStripeSubscriptionReconciliation({
    facilityId: "fac_1",
    subscription: sub({
      facilityId: "fac_1",
      departmentKeys: "DIETARY",
      interval: "ANNUAL",
      setupPath: "SELF_SERVE",
    }),
    local: {
      status: "ACTIVE",
      stripeSubscriptionId: "sub_1",
      interval: "ANNUAL",
      setupPath: "SELF_SERVE",
      departmentKeys: ["DIETARY"],
    },
  });
  assert.deepEqual(plan, { action: "noop", code: "ALREADY_MATCHES" });
  assert.equal(facilityStripeSyncResult("ALREADY_MATCHES").message, "Local billing already matches Stripe.");
});

test("conflicting current subscriptions fail selection", () => {
  assert.deepEqual(
    selectSubscriptionForFacilitySync([
      { id: "sub_a", status: "active" },
      { id: "sub_b", status: "past_due" },
    ]),
    { ok: false, code: "CONFLICTING_SUBSCRIPTIONS" },
  );
  assert.deepEqual(selectSubscriptionForFacilitySync([]), {
    ok: false,
    code: "NO_SUBSCRIPTION",
  });
});

test("operator copy covers the Console sync outcomes", () => {
  assert.equal(
    facilityStripeSyncResult("SYNCHRONIZED", true).message,
    "Billing synchronized successfully.",
  );
  assert.equal(
    facilityStripeSyncResult("NO_SUBSCRIPTION").message,
    "No Stripe subscription exists for this facility.",
  );
  assert.equal(
    facilityStripeSyncResult("METADATA_INCOMPLETE").message,
    "Stripe subscription found, but facility metadata is incomplete.",
  );
  assert.equal(
    facilityStripeSyncResult("UNSAFE").message,
    "Stripe data could not be reconciled safely.",
  );
});

test("Stripe Dashboard links are environment-aware and secret-free", () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  assert.equal(isStripeTestMode(), true);
  assert.equal(
    stripeCustomerDashboardUrl("cus_abc"),
    "https://dashboard.stripe.com/test/customers/cus_abc",
  );
  process.env.STRIPE_SECRET_KEY = "sk_live_123";
  assert.equal(isStripeTestMode(), false);
  assert.equal(
    stripeSubscriptionDashboardUrl("sub_abc"),
    "https://dashboard.stripe.com/subscriptions/sub_abc",
  );
  if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = previous;
});

test("webhook and Console sync share the same reconcile entrypoint", () => {
  const webhook = source("src/lib/billing/webhook-handlers.ts");
  const sync = source("src/lib/billing/reconcile-from-stripe.ts");
  const action = source("src/app/console/(staff)/customers/actions.ts");
  assert.match(webhook, /syncStripeSubscriptionById/);
  assert.match(sync, /planStripeSubscriptionReconciliation/);
  assert.match(sync, /applyFacilitySubscription/);
  assert.match(sync, /persistDefaultPaymentMethod/);
  assert.match(action, /syncFacilityBillingFromStripe/);
  assert.match(action, /requireHarborStaff/);
  assert.doesNotMatch(action, /subscriptions\.update|subscriptions\.create|checkout\.sessions\.create/);
  assert.doesNotMatch(sync, /subscriptions\.update|subscriptions\.create|checkout\.sessions\.create/);
  assert.doesNotMatch(webhook, /persistDefaultPaymentMethod/);
});

test("subscription mutation paths keep facilityId and departmentKeys metadata", () => {
  const checkout = source("src/app/(protected)/admin/billing/actions.ts");
  const add = source("src/lib/billing/add-departments.ts");
  assert.match(checkout, /subscription_data:\s*\{[\s\S]*facilityId: facility\.id/);
  assert.match(checkout, /departmentKeys: publishedKeys\.join\(",\"\)/);
  assert.match(add, /facilityId: facility\.id/);
  assert.match(add, /departmentKeys: mergedKeys\.join\(",\"\)/);
});

test("Console customer detail stays diagnostics-only", () => {
  const page = source("src/app/console/(staff)/customers/[facilityId]/page.tsx");
  const list = source("src/app/console/(staff)/customers/page.tsx");
  assert.match(page, /Licensing/);
  assert.match(page, /Billing/);
  assert.match(page, /Open in Stripe/);
  assert.match(page, /CustomerBillingSyncForm/);
  assert.match(page, /Stripe Customer ID/);
  assert.match(list, /console\/customers\/\$\{row\.id\}/);
  assert.doesNotMatch(page, /Set Active|COMPLIMENTARY|Apply coupon|Issue credit/);
});
