import type Stripe from "stripe";

import { applyFacilitySubscription } from "./apply-stripe-event";
import { persistDefaultPaymentMethod } from "./persist-default-payment-method";
import { checkoutSelectionFromMetadata } from "./status";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export {
  applyResolvedStripeSubscription,
  syncFacilityBillingFromStripe,
  type FacilityStripeSyncCode,
  type FacilityStripeSyncResult,
} from "./reconcile-from-stripe";

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
