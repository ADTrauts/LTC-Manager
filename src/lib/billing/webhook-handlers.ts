import type Stripe from "stripe";
import { handleImplementationCheckout } from "./implementation-payment";

import {
  syncStripeSubscriptionById,
  type StripeSyncDependencies,
  resolveFacilityIdFromSubscription,
} from "./reconcile-from-stripe";
import { applyCompletedCheckoutSession } from "./sync-from-stripe";
import { subscriptionIdFromStripeInvoice } from "./status";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export async function handleStripeBillingEvent(event: Stripe.Event, deps: StripeSyncDependencies = {}): Promise<void> {
  switch (event.type) {
    case "setup_intent.succeeded":
      await handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent, deps);
      return;
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      if (await handleImplementationCheckout({ db: deps.db ?? prisma, stripe: deps.stripe },event.data.object as Stripe.Checkout.Session)) return;
      const result = await applyCompletedCheckoutSession(event.data.object as Stripe.Checkout.Session, undefined, deps);
      if (result.code === "RECONCILED" && ["INSTALLATION_PENDING", "CONFLICTING_SUBSCRIPTIONS"].includes(result.result.code)) {
        throw new Error("Department installation pending; retry webhook.");
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionChanged(event.data.object as Stripe.Subscription, deps);
      return;
    case "invoice.paid":
      await handleInvoiceStatus(event.data.object as Stripe.Invoice, deps);
      return;
    case "invoice.payment_failed":
      await handleInvoiceStatus(event.data.object as Stripe.Invoice, deps);
      return;
    default:
      return;
  }
}

async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent, deps: StripeSyncDependencies): Promise<void> {
  const facilityId = setupIntent.metadata?.facilityId ?? null;
  if (!facilityId) return;

  const db = deps.db ?? prisma;
  const facility = await db.facility.findUnique({ where: { id: facilityId }, select: { stripeCustomerId: true } });
  const customerId = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;
  if (!customerId || facility?.stripeCustomerId !== customerId) return;
  await db.facility.update({
    where: { id: facilityId },
    data: {
      stripeDefaultPaymentMethodId:
        typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : undefined,
    },
  });
  await trackEvent("billing.setup_intent.succeeded", {
    facilityId,
    setupIntentId: setupIntent.id,
  });
}

async function handleSubscriptionChanged(subscription: Stripe.Subscription, deps: StripeSyncDependencies): Promise<void> {
  const facilityId = await resolveFacilityIdFromSubscription(subscription, deps.db ?? prisma);
  if (!facilityId) return;

  // Stripe does not guarantee event order. Reconcile current state, not an old payload.
  const reconciled = await syncStripeSubscriptionById(facilityId, subscription.id, deps);
  if (["INSTALLATION_PENDING", "CONFLICTING_SUBSCRIPTIONS"].includes(reconciled.code)) throw new Error("Department installation pending; retry webhook.");

  if (reconciled.code === "SYNCHRONIZED" || reconciled.code === "ALREADY_MATCHES") {
    await trackEvent("billing.subscription.updated", {
      facilityId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      reconcileCode: reconciled.code,
    });
  }
}

async function handleInvoiceStatus(invoice: Stripe.Invoice, deps: StripeSyncDependencies): Promise<void> {
  const subscriptionId = subscriptionIdFromStripeInvoice(invoice);
  if (!subscriptionId) return;
  const subscription = await (deps.stripe ?? getStripeServerClient()).subscriptions.retrieve(subscriptionId);
  await handleSubscriptionChanged(subscription, deps);
}
