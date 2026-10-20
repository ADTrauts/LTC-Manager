import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";

import { applyFacilitySubscription, recoverLicensedDepartmentInstallation, SubscriptionMirrorConflict } from "./apply-stripe-event";
import type { BillingInterval, BillingSetupPath } from "./catalog";
import type { FacilityBillingStatus } from "./entitlement";
import { persistDefaultPaymentMethod } from "./persist-default-payment-method";
import { billingStatusFromStripeSubscription, parseCheckoutDepartmentKeys } from "./status";
import {
  getDepartmentProduct,
  isDepartmentProductCommerciallyRecognized,
} from "@/lib/department-products";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export type FacilityStripeSyncCode =
  | "INSTALLATION_PENDING"
  | "SYNCHRONIZED"
  | "ALREADY_MATCHES"
  | "NO_SUBSCRIPTION"
  | "METADATA_INCOMPLETE"
  | "METADATA_FACILITY_MISMATCH"
  | "UNKNOWN_DEPARTMENT_KEYS"
  | "CONFLICTING_SUBSCRIPTIONS"
  | "STRIPE_UNAVAILABLE"
  | "FACILITY_NOT_FOUND"
  | "UNSAFE";

export type FacilityStripeSyncResult = {
  ok: boolean;
  code: FacilityStripeSyncCode;
  message: string;
  changed: boolean;
};

export type LocalBillingMirror = {
  status: FacilityBillingStatus | null;
  stripeSubscriptionId: string | null;
  interval: BillingInterval | null;
  setupPath: BillingSetupPath | null;
  departmentKeys: string[];
  revision?: string | null;
};

export type StripeSubscriptionReconciliationPlan =
  | { action: "reject"; code: Exclude<FacilityStripeSyncCode, "SYNCHRONIZED" | "ALREADY_MATCHES"> }
  | { action: "noop"; code: "ALREADY_MATCHES" }
  | {
      action: "apply";
      status: Exclude<FacilityBillingStatus, "UNMANAGED">;
      stripeSubscriptionId: string;
      departmentKeys: string[];
      interval: BillingInterval | null;
      setupPath: BillingSetupPath | null;
    };

const MESSAGES: Record<FacilityStripeSyncCode, string> = {
  INSTALLATION_PENDING: "Billing synchronized; installation is pending. Retry Sync from Stripe without another checkout or charge.",
  SYNCHRONIZED: "Billing synchronized successfully.",
  ALREADY_MATCHES: "Local billing already matches Stripe.",
  NO_SUBSCRIPTION: "No Stripe subscription exists for this facility.",
  METADATA_INCOMPLETE: "Stripe subscription found, but facility metadata is incomplete.",
  METADATA_FACILITY_MISMATCH: "Stripe data could not be reconciled safely.",
  UNKNOWN_DEPARTMENT_KEYS: "Stripe data could not be reconciled safely.",
  CONFLICTING_SUBSCRIPTIONS: "Stripe data could not be reconciled safely.",
  STRIPE_UNAVAILABLE: "Stripe data could not be reconciled safely.",
  FACILITY_NOT_FOUND: "Stripe data could not be reconciled safely.",
  UNSAFE: "Stripe data could not be reconciled safely.",
};

export function facilityStripeSyncResult(
  code: FacilityStripeSyncCode,
  changed = false,
): FacilityStripeSyncResult {
  const ok = code === "SYNCHRONIZED" || code === "ALREADY_MATCHES";
  return { ok, code, message: MESSAGES[code], changed };
}

/**
 * Pure Stripe → Vssyl plan. Webhooks and Console manual sync must share this.
 * Never mutates Stripe or the database.
 */
export function planStripeSubscriptionReconciliation(input: {
  facilityId: string;
  subscription: Pick<Stripe.Subscription, "id" | "status" | "metadata">;
  local: LocalBillingMirror;
}): StripeSubscriptionReconciliationPlan {
  const status = billingStatusFromStripeSubscription(input.subscription.status);
  if (!status || status === "UNMANAGED") {
    return { action: "reject", code: "UNSAFE" };
  }

  if (input.local.stripeSubscriptionId && input.local.stripeSubscriptionId !== input.subscription.id &&
      !(["CANCELED", "INCOMPLETE"].includes(input.local.status ?? ""))) {
    return { action: "reject", code: "CONFLICTING_SUBSCRIPTIONS" };
  }
  const metadataFacilityId = input.subscription.metadata?.facilityId?.trim() || null;
  if (metadataFacilityId && metadataFacilityId !== input.facilityId) {
    return { action: "reject", code: "METADATA_FACILITY_MISMATCH" };
  }

  const requiresDepartmentKeys = status === "ACTIVE" || status === "PAST_DUE";
  const parsedKeys = requiresDepartmentKeys
    ? parseLicensedDepartmentKeysFromMetadata(input.subscription.metadata?.departmentKeys)
    : { ok: true as const, keys: [] as string[] };
  if (!parsedKeys.ok) {
    return { action: "reject", code: parsedKeys.code };
  }

  if (requiresDepartmentKeys && parsedKeys.keys.length === 0) {
    return { action: "reject", code: "METADATA_INCOMPLETE" };
  }

  const interval =
    input.subscription.metadata?.interval === "MONTHLY"
      ? ("MONTHLY" as const)
      : input.subscription.metadata?.interval === "ANNUAL"
        ? ("ANNUAL" as const)
        : null;
  const setupPath =
    input.subscription.metadata?.setupPath === "ASSISTED"
      ? ("ASSISTED" as const)
      : input.subscription.metadata?.setupPath === "SELF_SERVE"
        ? ("SELF_SERVE" as const)
        : null;

  if (
    localMatchesStripe({
      local: input.local,
      status,
      stripeSubscriptionId: input.subscription.id,
      departmentKeys: parsedKeys.keys,
      interval,
      setupPath,
    })
  ) {
    return { action: "noop", code: "ALREADY_MATCHES" };
  }

  return {
    action: "apply",
    status,
    stripeSubscriptionId: input.subscription.id,
    departmentKeys: parsedKeys.keys,
    interval,
    setupPath,
  };
}

/**
 * Canonical Stripe → Vssyl subscription reconciliation.
 * Used by webhook handlers and Console / admin manual sync.
 * Never mutates Stripe.
 */
export async function applyResolvedStripeSubscription(input: {
  facilityId: string;
  subscription: Pick<Stripe.Subscription, "id" | "status" | "metadata"> & Partial<Pick<Stripe.Subscription, "customer">>;
  expectedRevision?: string | null;
}, db: PrismaClient = prisma): Promise<FacilityStripeSyncResult> {
  const facility = await db.facility.findUnique({ where: { id: input.facilityId }, select: { stripeCustomerId: true } });
  if (!facility) return facilityStripeSyncResult("FACILITY_NOT_FOUND");
  const customerId = typeof input.subscription.customer === "string" ? input.subscription.customer : input.subscription.customer?.id;
  if (facility.stripeCustomerId && customerId && facility.stripeCustomerId !== customerId) {
    return facilityStripeSyncResult("METADATA_FACILITY_MISMATCH");
  }
  const local = await loadLocalBillingMirror(input.facilityId, db);
  if (input.expectedRevision !== undefined && input.expectedRevision !== local.revision) {
    return facilityStripeSyncResult("CONFLICTING_SUBSCRIPTIONS");
  }
  const plan = planStripeSubscriptionReconciliation({
    facilityId: input.facilityId,
    subscription: input.subscription,
    local,
  });

  if (plan.action === "reject") {
    return facilityStripeSyncResult(plan.code);
  }
  if (plan.action === "noop") {
    const recovery = await recoverLicensedDepartmentInstallation(db, input.facilityId);
    return facilityStripeSyncResult(recovery.installationPending ? "INSTALLATION_PENDING" : "ALREADY_MATCHES");
  }

  let applied: { installationPending: boolean };
  try { applied = await applyFacilitySubscription({
    facilityId: input.facilityId,
    status: plan.status,
    expectedRevision: input.expectedRevision !== undefined ? input.expectedRevision : local.revision ?? null,
    stripeSubscriptionId: plan.stripeSubscriptionId,
    ...(plan.interval ? { interval: plan.interval } : {}),
    ...(plan.setupPath ? { setupPath: plan.setupPath } : {}),
    departmentKeys: plan.departmentKeys,
  }, db); } catch (error) {
    if (error instanceof SubscriptionMirrorConflict) return facilityStripeSyncResult("CONFLICTING_SUBSCRIPTIONS");
    throw error;
  }

  await trackEvent("billing.subscription.reconciled", {
    facilityId: input.facilityId,
    stripeSubscriptionId: plan.stripeSubscriptionId,
    status: plan.status,
  });

  return facilityStripeSyncResult(applied.installationPending ? "INSTALLATION_PENDING" : "SYNCHRONIZED", true);
}

/**
 * Manual recovery path: resolve the facility's Stripe customer/subscription,
 * validate ownership, then run the same reconciliation as webhooks.
 */
export async function syncFacilityBillingFromStripe(
  facilityId: string,
  deps: StripeSyncDependencies = {},
): Promise<FacilityStripeSyncResult> {
  if (!deps.stripe && !isStripeSecretConfigured()) {
    return facilityStripeSyncResult("STRIPE_UNAVAILABLE");
  }

  const db = deps.db ?? prisma;
  const facility = await db.facility.findUnique({
    where: { id: facilityId },
    select: { id: true, stripeCustomerId: true },
  });
  if (!facility) {
    return facilityStripeSyncResult("FACILITY_NOT_FOUND");
  }

  const stripe = deps.stripe ?? getStripeServerClient();

  let customerId = facility.stripeCustomerId ?? null;
  if (!customerId) {
    try {
      const matches = await stripe.customers.search({
        query: `metadata['facilityId']:'${facilityId}'`,
        limit: 2,
      });
      if (matches.data.length > 1 || matches.has_more) return facilityStripeSyncResult("CONFLICTING_SUBSCRIPTIONS");
      customerId = matches.data[0]?.id ?? null;
    } catch {
      return facilityStripeSyncResult("STRIPE_UNAVAILABLE");
    }
    if (!customerId) {
      return facilityStripeSyncResult("NO_SUBSCRIPTION");
    }
  }

  let subscriptions: Stripe.ApiList<Stripe.Subscription>;
  try {
    subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
  } catch {
    return facilityStripeSyncResult("STRIPE_UNAVAILABLE");
  }

  if (subscriptions.has_more) return facilityStripeSyncResult("CONFLICTING_SUBSCRIPTIONS");
  const selected = selectSubscriptionForFacilitySync(subscriptions.data);
  if (!selected.ok) {
    return facilityStripeSyncResult(selected.code);
  }

  const customerFacility = await db.facility.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (customerFacility && customerFacility.id !== facilityId) {
    return facilityStripeSyncResult("METADATA_FACILITY_MISMATCH");
  }

  const result = await syncStripeSubscriptionById(facilityId, selected.subscription.id, { ...deps, db, stripe }, customerId);

  if (result.ok) {
    await db.facility.updateMany({ where: { id: facilityId, stripeCustomerId: null }, data: { stripeCustomerId: customerId } });
    await persistSyncPaymentMethod(facilityId, selected.subscription.id, customerId, { ...deps, db, stripe });
  }
  return result;
}

export function selectSubscriptionForFacilitySync(
  subscriptions: ReadonlyArray<Pick<Stripe.Subscription, "id" | "status" | "metadata">>,
):
  | { ok: true; subscription: (typeof subscriptions)[number] }
  | { ok: false; code: "NO_SUBSCRIPTION" | "CONFLICTING_SUBSCRIPTIONS" } {
  const currentCandidates = subscriptions.filter(
    (row) =>
      row.status === "active" ||
      row.status === "trialing" ||
      row.status === "past_due",
  );
  if (currentCandidates.length > 1) {
    return { ok: false, code: "CONFLICTING_SUBSCRIPTIONS" };
  }

  const current =
    currentCandidates[0] ??
    subscriptions.find((row) => row.status === "incomplete") ??
    subscriptions[0];
  if (!current) {
    return { ok: false, code: "NO_SUBSCRIPTION" };
  }
  return { ok: true, subscription: current };
}

export function parseLicensedDepartmentKeysFromMetadata(
  value: string | undefined | null,
):
  | { ok: true; keys: string[] }
  | { ok: false; code: "UNKNOWN_DEPARTMENT_KEYS" } {
  const raw = parseCheckoutDepartmentKeys(value);
  if (raw.length === 0) {
    return { ok: true, keys: [] };
  }

  const keys: string[] = [];
  for (const key of raw) {
    const product = getDepartmentProduct(key);
    if (!product || !isDepartmentProductCommerciallyRecognized(product)) {
      return { ok: false, code: "UNKNOWN_DEPARTMENT_KEYS" };
    }
    keys.push(product.installationKey);
  }
  return { ok: true, keys: [...new Set(keys)] };
}

export async function resolveFacilityIdFromSubscription(
  subscription: Stripe.Subscription,
  db: PrismaClient = prisma,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.facilityId?.trim();
  if (fromMetadata) return fromMetadata;

  const existing = await db.facilityBilling.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { facilityId: true },
  });
  if (existing) return existing.facilityId;

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;

  const facility = await db.facility.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return facility?.id ?? null;
}

async function loadLocalBillingMirror(facilityId: string, db: PrismaClient): Promise<LocalBillingMirror> {
  const billing = await db.facilityBilling.findUnique({
    where: { facilityId },
    select: {
      status: true,
      stripeSubscriptionId: true,
      interval: true,
      setupPath: true,
      updatedAt: true,
      entitlements: {
        where: { status: "ACTIVE" },
        select: { departmentKey: true },
        orderBy: { departmentKey: "asc" },
      },
    },
  });
  return {
    revision: billing?.updatedAt.toISOString() ?? null,
    status: billing?.status ?? null,
    stripeSubscriptionId: billing?.stripeSubscriptionId ?? null,
    interval: billing?.interval ?? null,
    setupPath: billing?.setupPath ?? null,
    departmentKeys: (billing?.entitlements ?? []).map((row) => row.departmentKey).sort(),
  };
}

function localMatchesStripe(input: {
  local: LocalBillingMirror;
  status: Exclude<FacilityBillingStatus, "UNMANAGED">;
  stripeSubscriptionId: string;
  departmentKeys: string[];
  interval: BillingInterval | null;
  setupPath: BillingSetupPath | null;
}): boolean {
  if (input.local.status !== input.status) return false;
  if (input.local.stripeSubscriptionId !== input.stripeSubscriptionId) return false;
  if (input.interval && input.local.interval !== input.interval) return false;
  if (input.setupPath && input.local.setupPath !== input.setupPath) return false;
  if (!["ACTIVE", "PAST_DUE"].includes(input.status)) return input.local.departmentKeys.length === 0;
  if (input.departmentKeys.length === 0) return true;
  const localKeys = [...input.local.departmentKeys].sort();
  const stripeKeys = [...input.departmentKeys].sort();
  if (localKeys.length !== stripeKeys.length) return false;
  return localKeys.every((key, index) => key === stripeKeys[index]);
}

export type StripeSyncDependencies = { db?: PrismaClient; stripe?: Stripe };

/** Capture local revision before remote I/O. A concurrent mirror change must
 * reject this snapshot under the Facility lock rather than overwrite it.
 */
export async function syncStripeSubscriptionById(
  facilityId: string, subscriptionId: string, deps: StripeSyncDependencies = {}, expectedCustomerId?: string,
): Promise<FacilityStripeSyncResult> {
  const db = deps.db ?? prisma;
  const local = await loadLocalBillingMirror(facilityId, db);
  const stripe = deps.stripe ?? getStripeServerClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (expectedCustomerId && customerId !== expectedCustomerId) return facilityStripeSyncResult("METADATA_FACILITY_MISMATCH");
  return applyResolvedStripeSubscription({ facilityId, subscription, expectedRevision: local.revision ?? null }, db);
}

export async function persistSyncPaymentMethod(
  facilityId: string, subscriptionId: string, customerId: string, deps: StripeSyncDependencies,
) {
  const db = deps.db ?? prisma;
  const stripe = deps.stripe ?? getStripeServerClient();
  return persistDefaultPaymentMethod(facilityId, subscriptionId, customerId, {
    isConfigured: () => true,
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    retrieveCustomer: async (id) => {
      const customer = await stripe.customers.retrieve(id);
      return customer.deleted ? { deleted: true } : { deleted: false, invoice_settings: customer.invoice_settings };
    },
    updateFacility: async (id, paymentMethodId) => { await db.facility.update({ where: { id }, data: { stripeDefaultPaymentMethodId: paymentMethodId } }); },
  });
}
