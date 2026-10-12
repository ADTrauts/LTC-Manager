import type Stripe from "stripe";

import { applyFacilitySubscription } from "./apply-stripe-event";
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

  const metadataFacilityId = input.subscription.metadata?.facilityId?.trim() || null;
  if (metadataFacilityId && metadataFacilityId !== input.facilityId) {
    return { action: "reject", code: "METADATA_FACILITY_MISMATCH" };
  }

  const parsedKeys = parseLicensedDepartmentKeysFromMetadata(
    input.subscription.metadata?.departmentKeys,
  );
  if (!parsedKeys.ok) {
    return { action: "reject", code: parsedKeys.code };
  }

  const requiresDepartmentKeys = status === "ACTIVE" || status === "PAST_DUE";
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
  subscription: Pick<Stripe.Subscription, "id" | "status" | "metadata">;
}): Promise<FacilityStripeSyncResult> {
  const local = await loadLocalBillingMirror(input.facilityId);
  const plan = planStripeSubscriptionReconciliation({
    facilityId: input.facilityId,
    subscription: input.subscription,
    local,
  });

  if (plan.action === "reject") {
    return facilityStripeSyncResult(plan.code);
  }
  if (plan.action === "noop") {
    return facilityStripeSyncResult("ALREADY_MATCHES");
  }

  await applyFacilitySubscription({
    facilityId: input.facilityId,
    status: plan.status,
    stripeSubscriptionId: plan.stripeSubscriptionId,
    ...(plan.interval ? { interval: plan.interval } : {}),
    ...(plan.setupPath ? { setupPath: plan.setupPath } : {}),
    ...(plan.departmentKeys.length > 0 ? { departmentKeys: plan.departmentKeys } : {}),
  });

  await trackEvent("billing.subscription.reconciled", {
    facilityId: input.facilityId,
    stripeSubscriptionId: plan.stripeSubscriptionId,
    status: plan.status,
  });

  return facilityStripeSyncResult("SYNCHRONIZED", true);
}

/**
 * Manual recovery path: resolve the facility's Stripe customer/subscription,
 * validate ownership, then run the same reconciliation as webhooks.
 */
export async function syncFacilityBillingFromStripe(
  facilityId: string,
): Promise<FacilityStripeSyncResult> {
  if (!isStripeSecretConfigured()) {
    return facilityStripeSyncResult("STRIPE_UNAVAILABLE");
  }

  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { id: true, stripeCustomerId: true },
  });
  if (!facility) {
    return facilityStripeSyncResult("FACILITY_NOT_FOUND");
  }

  const stripe = getStripeServerClient();

  let customerId = facility.stripeCustomerId ?? null;
  if (!customerId) {
    try {
      const matches = await stripe.customers.search({
        query: `metadata['facilityId']:'${facilityId}'`,
        limit: 1,
      });
      customerId = matches.data[0]?.id ?? null;
    } catch {
      return facilityStripeSyncResult("STRIPE_UNAVAILABLE");
    }
    if (!customerId) {
      return facilityStripeSyncResult("NO_SUBSCRIPTION");
    }
    await prisma.facility.update({
      where: { id: facilityId },
      data: { stripeCustomerId: customerId },
    });
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

  const selected = selectSubscriptionForFacilitySync(subscriptions.data);
  if (!selected.ok) {
    return facilityStripeSyncResult(selected.code);
  }

  const customerFacility = await prisma.facility.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (customerFacility && customerFacility.id !== facilityId) {
    return facilityStripeSyncResult("METADATA_FACILITY_MISMATCH");
  }

  const result = await applyResolvedStripeSubscription({
    facilityId,
    subscription: selected.subscription,
  });

  await persistDefaultPaymentMethod(facilityId, selected.subscription.id, customerId);
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
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.facilityId?.trim();
  if (fromMetadata) return fromMetadata;

  const existing = await prisma.facilityBilling.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { facilityId: true },
  });
  if (existing) return existing.facilityId;

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;

  const facility = await prisma.facility.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return facility?.id ?? null;
}

async function loadLocalBillingMirror(facilityId: string): Promise<LocalBillingMirror> {
  const billing = await prisma.facilityBilling.findUnique({
    where: { facilityId },
    select: {
      status: true,
      stripeSubscriptionId: true,
      interval: true,
      setupPath: true,
      entitlements: {
        where: { status: "ACTIVE" },
        select: { departmentKey: true },
        orderBy: { departmentKey: "asc" },
      },
    },
  });
  return {
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
  if (input.departmentKeys.length === 0) return true;
  const localKeys = [...input.local.departmentKeys].sort();
  const stripeKeys = [...input.departmentKeys].sort();
  if (localKeys.length !== stripeKeys.length) return false;
  return localKeys.every((key, index) => key === stripeKeys[index]);
}
