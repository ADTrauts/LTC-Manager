import type Stripe from "stripe";

import { applyFacilitySubscription } from "./apply-stripe-event";
import { applyCompletedCheckoutSession } from "./sync-from-stripe";
import {
  billingStatusFromStripeSubscription,
  checkoutSelectionFromMetadata,
  subscriptionIdFromStripeInvoice,
} from "./status";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

export async function handleStripeBillingEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "setup_intent.succeeded":
      await handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent);
      return;
    case "checkout.session.completed":
      await applyCompletedCheckoutSession(event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionChanged(event.data.object as Stripe.Subscription);
      return;
    case "invoice.paid":
      await handleInvoiceStatus(event.data.object as Stripe.Invoice, "ACTIVE");
      return;
    case "invoice.payment_failed":
      await handleInvoiceStatus(event.data.object as Stripe.Invoice, "PAST_DUE");
      return;
    default:
      return;
  }
}

async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent): Promise<void> {
  const facilityId = setupIntent.metadata?.facilityId ?? null;
  if (!facilityId) return;

  await prisma.facility.update({
    where: { id: facilityId },
    data: {
      onboardingCurrentStep: "complete",
      onboardingStartedAt: new Date(),
      stripeDefaultPaymentMethodId:
        typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : undefined,
    },
  });
  await trackEvent("billing.setup_intent.succeeded", {
    facilityId,
    setupIntentId: setupIntent.id,
  });
}

async function handleSubscriptionChanged(subscription: Stripe.Subscription): Promise<void> {
  const status = billingStatusFromStripeSubscription(subscription.status);
  if (!status || status === "UNMANAGED") return;

  const facilityId = await resolveFacilityIdFromSubscription(subscription);
  if (!facilityId) return;

  const selection = checkoutSelectionFromMetadata({
    facilityId,
    departmentKeys: subscription.metadata?.departmentKeys,
    interval: subscription.metadata?.interval,
    setupPath: subscription.metadata?.setupPath,
  });

  await applyFacilitySubscription({
    facilityId,
    status,
    stripeSubscriptionId: subscription.id,
    ...(subscription.metadata?.interval ? { interval: selection.interval } : {}),
    ...(subscription.metadata?.setupPath ? { setupPath: selection.setupPath } : {}),
    ...(selection.departmentKeys.length > 0 ? { departmentKeys: selection.departmentKeys } : {}),
  });

  await trackEvent("billing.subscription.updated", {
    facilityId,
    stripeSubscriptionId: subscription.id,
    status,
  });
}

async function handleInvoiceStatus(
  invoice: Stripe.Invoice,
  status: "ACTIVE" | "PAST_DUE",
): Promise<void> {
  const subscriptionId = subscriptionIdFromStripeInvoice(invoice);
  if (!subscriptionId) return;

  const billing = await prisma.facilityBilling.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { facilityId: true },
  });
  if (!billing) return;

  await applyFacilitySubscription({
    facilityId: billing.facilityId,
    status,
    stripeSubscriptionId: subscriptionId,
  });
}

async function resolveFacilityIdFromSubscription(
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
