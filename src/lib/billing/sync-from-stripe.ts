import type Stripe from "stripe";

import { applyFacilitySubscription } from "./apply-stripe-event";
import { billingStatusFromStripeSubscription, checkoutSelectionFromMetadata } from "./status";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export async function applyCompletedCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "subscription") return;

  const selection = checkoutSelectionFromMetadata({
    facilityId: session.metadata?.facilityId ?? session.client_reference_id,
    departmentKeys: session.metadata?.departmentKeys,
    interval: session.metadata?.interval,
    setupPath: session.metadata?.setupPath,
  });
  if (!selection.facilityId) return;

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  await applyFacilitySubscription({
    facilityId: selection.facilityId,
    status: session.status === "complete" && session.payment_status === "paid" ? "ACTIVE" : "INCOMPLETE",
    interval: selection.interval,
    setupPath: selection.setupPath,
    stripeSubscriptionId: subscriptionId ?? null,
    departmentKeys: selection.departmentKeys,
  });

  if (customerId) {
    await prisma.facility.update({
      where: { id: selection.facilityId },
      data: { stripeCustomerId: customerId },
    });
  }

  await persistDefaultPaymentMethod(selection.facilityId, subscriptionId ?? null, customerId ?? null);

  await trackEvent("billing.checkout.completed", {
    facilityId: selection.facilityId,
    checkoutSessionId: session.id,
    stripeSubscriptionId: subscriptionId,
  });
}

export async function syncFacilityBillingFromStripe(facilityId: string): Promise<void> {
  if (!isStripeSecretConfigured()) return;

  const stripe = getStripeServerClient();
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { stripeCustomerId: true },
  });

  let customerId = facility?.stripeCustomerId ?? null;
  if (!customerId) {
    try {
      const matches = await stripe.customers.search({
        query: `metadata['facilityId']:'${facilityId}'`,
        limit: 1,
      });
      customerId = matches.data[0]?.id ?? null;
    } catch {
      return;
    }
    if (!customerId) return;
    await prisma.facility.update({
      where: { id: facilityId },
      data: { stripeCustomerId: customerId },
    });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  const current =
    subscriptions.data.find((row) => row.status === "active" || row.status === "trialing") ??
    subscriptions.data.find((row) => row.status === "past_due") ??
    subscriptions.data[0];
  if (!current) return;

  const status = billingStatusFromStripeSubscription(current.status);
  if (!status || status === "UNMANAGED") return;

  const selection = checkoutSelectionFromMetadata({
    facilityId,
    departmentKeys: current.metadata?.departmentKeys,
    interval: current.metadata?.interval,
    setupPath: current.metadata?.setupPath,
  });

  await applyFacilitySubscription({
    facilityId,
    status,
    stripeSubscriptionId: current.id,
    ...(current.metadata?.interval ? { interval: selection.interval } : {}),
    ...(current.metadata?.setupPath ? { setupPath: selection.setupPath } : {}),
    ...(selection.departmentKeys.length > 0 ? { departmentKeys: selection.departmentKeys } : {}),
  });

  await persistDefaultPaymentMethod(facilityId, current.id, customerId);
}

export async function applyCheckoutSessionId(input: {
  checkoutSessionId: string;
  expectedFacilityId: string;
}): Promise<boolean> {
  if (!isStripeSecretConfigured()) return false;
  const stripe = getStripeServerClient();
  const session = await stripe.checkout.sessions.retrieve(input.checkoutSessionId);
  const facilityId = session.metadata?.facilityId ?? session.client_reference_id;
  if (facilityId !== input.expectedFacilityId) return false;
  await applyCompletedCheckoutSession(session);
  return true;
}

async function persistDefaultPaymentMethod(
  facilityId: string,
  subscriptionId: string | null,
  customerId: string | null,
): Promise<void> {
  const stripe = getStripeServerClient();
  let paymentMethodId: string | null = null;

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    paymentMethodId = idFromExpandable(subscription.default_payment_method);
  }

  if (!paymentMethodId && customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      paymentMethodId = idFromExpandable(customer.invoice_settings.default_payment_method);
    }
  }

  if (!paymentMethodId) return;

  await prisma.facility.update({
    where: { id: facilityId },
    data: { stripeDefaultPaymentMethodId: paymentMethodId },
  });
}

function idFromExpandable(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
