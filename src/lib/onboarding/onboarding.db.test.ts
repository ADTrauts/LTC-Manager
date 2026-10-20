import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { addDepartmentsToFacilitySubscription } from "@/lib/billing/add-departments";
import { recoverLicensedDepartmentInstallation, applyFacilitySubscription } from "@/lib/billing/apply-stripe-event";
import { syncFacilityBillingFromStripe, applyResolvedStripeSubscription, syncStripeSubscriptionById } from "@/lib/billing/reconcile-from-stripe";
import { applyCheckoutSessionId } from "@/lib/billing/sync-from-stripe";
import { handleStripeBillingEvent } from "@/lib/billing/webhook-handlers";
import { loadFacilityDepartmentCatalog, loadCustomerOperableDepartments } from "@/lib/department-products";
import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import { resolveCycleAuthority } from "@/lib/operational-cycles/cycle-authority";
import { resolveWorkAuthority } from "@/lib/department-work/authority";
import { resolveEvidenceAuthority } from "@/lib/operational-evidence/evidence-authority";
import { saveFacilityOnboarding } from "./transitions";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
const skip = url ? false : "Requires migrated disposable ONBOARDING_TEST_DATABASE_URL.";
async function run(body: (db: PrismaClient) => Promise<void>) {
  const db = new PrismaClient({ datasources: { db: { url: url! } } });
  try { await body(db); } finally { await db.$disconnect(); }
}
async function fixture(db: PrismaClient) {
  const id = randomUUID();
  const org = await db.organization.create({ data: { name: `ONB02 ${id}` } });
  const facility = await db.facility.create({ data: { organizationId: org.id, displayName: `ONB02 ${id}`, timezone: "America/New_York", stripeCustomerId: `cus_${id}` } });
  let current = { id: `sub_${id}`, status: "active" as Stripe.Subscription.Status, cancel_at_period_end: false, customer: facility.stripeCustomerId!, metadata: { facilityId: facility.id, departmentKeys: "DIETARY", interval: "MONTHLY", setupPath: "SELF_SERVE" }, default_payment_method: null };
  let checkout = { id: `cs_${id}`, mode: "subscription", status: "complete", payment_status: "paid", metadata: { facilityId: facility.id }, customer: facility.stripeCustomerId, subscription: current.id };
  const stripe = {
    subscriptions: { retrieve: async () => structuredClone(current), list: async () => ({ data: [structuredClone(current)] }) },
    checkout: { sessions: { retrieve: async () => structuredClone(checkout) } },
    customers: { retrieve: async () => ({ id: facility.stripeCustomerId, invoice_settings: {} }) },
  } as unknown as Stripe;
  const deps = { db, stripe };
  const set = (status: Stripe.Subscription.Status, keys = "DIETARY") => { current = { ...current, status, metadata: { ...current.metadata, departmentKeys: keys } }; };
  const event = (type: string, object: unknown) => handleStripeBillingEvent({ id: `evt_${randomUUID()}`, type, data: { object } } as Stripe.Event, deps);
  const sync = () => syncFacilityBillingFromStripe(facility.id, deps);
  const snapshot = () => db.facilityBilling.findUniqueOrThrow({ where: { facilityId: facility.id }, include: { entitlements: true } });
  const returnSync = () => applyCheckoutSessionId({ checkoutSessionId: checkout.id, expectedFacilityId: facility.id }, deps);
  const session = { uid: "test-actor", facilityId: facility.id, role: "MANAGER", authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", sessionVersion: 0 } as FacilitySession;
  return { facility, deps, set, event, sync, snapshot, returnSync, session,
    scheduleCancellation: () => { current = { ...current, cancel_at_period_end: true }; },
    get current() { return structuredClone(current); },
    setCheckout: (patch: Partial<typeof checkout>) => { checkout = { ...checkout, ...patch }; },
  };
}

test("SQL: finish is idempotent journey acknowledgement, preserves history and never licenses zero Departments", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const started = new Date("2025-01-01"), completed = new Date("2025-02-01");
  await db.facility.update({ where: { id: f.facility.id }, data: { onboardingStartedAt: started, onboardingCompletedAt: completed } });
  const rows = await Promise.all([saveFacilityOnboarding(db, { facilityId: f.facility.id, finish: true }), saveFacilityOnboarding(db, { facilityId: f.facility.id, step: "billing" })]);
  for (const row of rows) { assert.deepEqual(row.onboardingCompletedAt, completed); assert.deepEqual(row.onboardingStartedAt, started); assert.equal(row.onboardingCurrentStep, "complete"); }
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 0);
  assert.equal(await db.facilityDepartmentEntitlement.count({ where: { facilityId: f.facility.id } }), 0);
  assert.deepEqual(await loadCustomerOperableDepartments(db, f.facility.id), []);
}));

test("SQL: unpaid/open/expired checkout retrieval performs no licensing or setup mutation", { skip }, () => run(async (db) => {
  const f = await fixture(db), before = await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } });
  for (const patch of [{ status: "open", payment_status: "unpaid" }, { status: "complete", payment_status: "unpaid" }, { status: "expired", payment_status: "unpaid" }]) {
    f.setCheckout(patch); const result = await f.returnSync(); assert.notEqual(result.code, "RECONCILED");
  }
  assert.deepEqual(await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } }), before);
  assert.equal(await db.facilityBilling.count({ where: { facilityId: f.facility.id } }), 0);
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 0);
}));

test("SQL: representative Stripe sequence agrees across webhook, return, Console and Build/Run boundaries", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  await f.event("customer.subscription.created", f.current);
  const department = await db.department.findFirstOrThrow({ where: { facilityId: f.facility.id } });
  process.env.DIETARY_WORK_PLANS_ENABLED = "true";
  for (const [stripeStatus, mirrorStatus, allowed] of [
    ["active", "ACTIVE", true], ["past_due", "PAST_DUE", true], ["unpaid", "UNPAID", false],
    ["active", "ACTIVE", true], ["paused", "PAUSED", false], ["active", "ACTIVE", true], ["canceled", "CANCELED", false],
  ] as const) {
    f.set(stripeStatus);
    await f.event("customer.subscription.updated", { ...f.current, status: "active" }); // stale payload; retrieve current
    assert.equal((await f.snapshot()).status, mirrorStatus);
    assert.equal((await f.returnSync()).code, "RECONCILED");
    assert.equal((await f.sync()).ok, true);
    for (const enforced of ["false", "true"]) {
      process.env.BILLING_ENTITLEMENTS_ENABLED = enforced;
      assert.equal((await loadCustomerOperableDepartments(db, f.facility.id)).length, allowed ? 1 : 0);
      assert.equal((await loadFacilityDepartmentCatalog(db, f.facility.id))[0]!.operable, allowed);
      assert.equal(await isCustomerDepartmentAccessAllowed(db, f.session, department.id), allowed);
      assert.equal((await resolveCycleAuthority(f.session, f.facility.id, department.id)).canManage, allowed);
      assert.equal((await resolveWorkAuthority(f.session, f.facility.id, department.id)).canManage, allowed);
      const evidence = await resolveEvidenceAuthority(f.session, f.facility.id, department.id);
      if (!allowed) assert.equal(evidence.canSubmit, false);
    }
    assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 1);
  }
}));

test("SQL: grace cannot grant/install additional Products; active recovery installs exactly once under concurrent retries", { skip }, () => run(async (db) => {
  const f = await fixture(db); await f.sync();
  f.set("past_due", "DIETARY,PLANT"); await f.sync();
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 1);
  assert.deepEqual((await f.snapshot()).entitlements.filter((e) => e.status === "ACTIVE").map((e) => e.departmentKey), ["DIETARY"]);
  f.set("active", "DIETARY,PLANT");
  await Promise.all([f.sync(), f.sync()]); await f.sync();
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 2);
  assert.equal(await db.departmentOperatorRelationship.count({ where: { department: { facilityId: f.facility.id } } }), 2);
}));

test("SQL: delayed installation is explicit, atomic and recoverable even when the billing mirror already matches", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const faulty = db.$extends({ query: { department: { async create() { throw new Error("injected install fault"); } } } }) as unknown as PrismaClient;
  const first = await applyResolvedStripeSubscription({ facilityId: f.facility.id, subscription: f.current }, faulty);
  assert.equal(first.code, "INSTALLATION_PENDING"); assert.equal(first.changed, true);
  assert.equal((await f.snapshot()).status, "ACTIVE");
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 0);
  assert.equal((await f.sync()).ok, true); assert.equal((await f.sync()).code, "ALREADY_MATCHES");
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 1);
  assert.equal(await db.departmentOperatorRelationship.count({ where: { department: { facilityId: f.facility.id } } }), 1);
}));

test("SQL: saved card webhook changes only card metadata, never setup, billing or entitlements", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  await f.event("setup_intent.succeeded", { id: "seti_test", metadata: { facilityId: f.facility.id }, customer: f.facility.stripeCustomerId, payment_method: "pm_test" });
  const facility = await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } });
  assert.equal(facility.stripeDefaultPaymentMethodId, "pm_test"); assert.equal(facility.onboardingCompletedAt, null); assert.equal(facility.onboardingCurrentStep, null);
  assert.equal(await db.facilityBilling.count({ where: { facilityId: f.facility.id } }), 0);
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 0);
}));

test("SQL: stale paid checkout and old invoice cannot reactivate canceled operation", { skip }, () => run(async (db) => {
  const f = await fixture(db); await f.sync(); f.set("canceled"); await f.sync();
  await f.returnSync(); await f.event("invoice.paid", { subscription: f.current.id });
  assert.equal((await f.snapshot()).status, "CANCELED");
  assert.equal((await loadCustomerOperableDepartments(db, f.facility.id)).length, 0);
}));

test("SQL: Stripe I/O snapshot cannot overwrite a concurrently changed mirror", { skip }, () => run(async (db) => {
  const f = await fixture(db); await f.sync(); const stale = f.current;
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>((r) => { entered = r; }), barrier = new Promise<void>((r) => { release = r; });
  const stripe = { subscriptions: { retrieve: async () => { entered(); await barrier; return stale; } } } as unknown as Stripe;
  const task = syncStripeSubscriptionById(f.facility.id, stale.id, { db, stripe });
  await waiting;
  await applyFacilitySubscription({ facilityId: f.facility.id, status: "CANCELED", stripeSubscriptionId: stale.id }, db);
  release();
  assert.equal((await task).code, "CONFLICTING_SUBSCRIPTIONS");
  assert.equal((await f.snapshot()).status, "CANCELED");
}));

test("SQL: cross-Facility checkout/customer, DEVELOPMENT metadata and revoked grandfathering fail closed", { skip }, () => run(async (db) => {
  const f = await fixture(db), foreign = await fixture(db);
  assert.equal((await applyCheckoutSessionId({ checkoutSessionId: "cs", expectedFacilityId: foreign.facility.id }, f.deps)).code, "WRONG_FACILITY");
  assert.equal((await applyResolvedStripeSubscription({ facilityId: foreign.facility.id, subscription: { ...f.current, metadata: { ...f.current.metadata, facilityId: foreign.facility.id } } }, db)).code, "METADATA_FACILITY_MISMATCH");
  f.setCheckout({ customer: foreign.facility.stripeCustomerId });
  const wrongCustomer = await f.returnSync();
  assert.equal(wrongCustomer.code, "RECONCILED");
  if (wrongCustomer.code === "RECONCILED") assert.equal(wrongCustomer.result.code, "METADATA_FACILITY_MISMATCH");
  assert.equal(await db.facilityBilling.count({ where: { facilityId: f.facility.id } }), 0);
  f.setCheckout({ customer: f.facility.stripeCustomerId });
  f.set("active", "EVS"); assert.equal((await f.sync()).ok, false);
  f.set("active", "PLANT"); await f.sync();
  await db.facilityDepartmentEntitlement.updateMany({ where: { facilityId: f.facility.id }, data: { status: "REVOKED" } });
  process.env.BILLING_ENTITLEMENTS_ENABLED = "false"; process.env.PLANT_OPERATIONS_ENABLED = "true";
  assert.deepEqual(await loadCustomerOperableDepartments(db, f.facility.id), []);
  assert.equal(await isPlantRuntimeEnabled(f.facility.id, { authKind: "user" }), false);
  assert.equal(await isPlantRuntimeEnabled(f.facility.id, { authKind: "harbor_staff" }), true);
}));


test("SQL: scheduled cancellation retains valid access but cannot override unpaid or past-due purchase restrictions", { skip }, () => run(async (db) => {
  const f = await fixture(db); await f.sync(); f.scheduleCancellation(); await f.sync();
  assert.equal((await loadCustomerOperableDepartments(db, f.facility.id)).length, 1);
  f.set("past_due"); await f.sync();
  await assert.rejects(() => addDepartmentsToFacilitySubscription({ facilityId: f.facility.id, departmentKeysToAdd: ["PLANT"] }), /Manage billing/);
  assert.equal((await loadCustomerOperableDepartments(db, f.facility.id)).length, 1);
  f.set("unpaid"); await f.sync();
  assert.equal((await loadCustomerOperableDepartments(db, f.facility.id)).length, 0);
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 1);
}));

test("SQL: canceled old subscription cannot overwrite an active replacement", { skip }, () => run(async (db) => {
  const f = await fixture(db); await f.sync(); const old = f.current;
  await applyFacilitySubscription({ facilityId: f.facility.id, status: "CANCELED", stripeSubscriptionId: old.id }, db);
  const next = { ...old, id: `${old.id}_replacement` };
  assert.equal((await applyResolvedStripeSubscription({ facilityId: f.facility.id, subscription: next }, db)).ok, true);
  const stale = await applyResolvedStripeSubscription({ facilityId: f.facility.id, subscription: { ...old, status: "canceled" } }, db);
  assert.equal(stale.code, "CONFLICTING_SUBSCRIPTIONS");
  assert.equal((await f.snapshot()).stripeSubscriptionId, next.id);
}));

test("SQL: install recovery waiting on revocation rechecks current state before creating anything", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const faulty = db.$extends({ query: { department: { async create() { throw new Error("delayed"); } } } }) as unknown as PrismaClient;
  await applyResolvedStripeSubscription({ facilityId: f.facility.id, subscription: f.current }, faulty);
  let locked!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => { locked = r; }), barrier = new Promise<void>((r) => { release = r; });
  const writer = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Facility" WHERE "id" = ${f.facility.id} FOR UPDATE`;
    locked(); await barrier;
    await tx.facilityBilling.update({ where: { facilityId: f.facility.id }, data: { status: "CANCELED" } });
    await tx.facilityDepartmentEntitlement.updateMany({ where: { facilityId: f.facility.id }, data: { status: "REVOKED" } });
  });
  await ready; const install = recoverLicensedDepartmentInstallation(db, f.facility.id);
  release(); await writer; await install;
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 0);
}));


test("SQL: stale alias grants cannot install a canonically revoked Product", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const billing = await db.facilityBilling.create({ data: { facilityId: f.facility.id, status: "ACTIVE" } });
  await db.facilityDepartmentEntitlement.createMany({ data: [
    { facilityId: f.facility.id, facilityBillingId: billing.id, departmentKey: "DIETARY", status: "REVOKED" },
    { facilityId: f.facility.id, facilityBillingId: billing.id, departmentKey: "HEALTHCARE_FOOD_NUTRITION", status: "ACTIVE" },
  ] });
  await recoverLicensedDepartmentInstallation(db, f.facility.id);
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 0);
  assert.equal((await loadFacilityDepartmentCatalog(db, f.facility.id))[0]!.licensed, false);
}));
