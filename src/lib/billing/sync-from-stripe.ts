import type Stripe from "stripe";

import { syncStripeSubscriptionById, persistSyncPaymentMethod, type StripeSyncDependencies, type FacilityStripeSyncResult } from "./reconcile-from-stripe";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";

export {
  applyResolvedStripeSubscription,
  syncFacilityBillingFromStripe,
  type FacilityStripeSyncCode,
  type FacilityStripeSyncResult,
} from "./reconcile-from-stripe";

export type CheckoutSyncResult =
  | { code: "PAYMENT_PENDING" | "CHECKOUT_CANCELED" | "UNAVAILABLE" | "WRONG_FACILITY" }
  | { code: "RECONCILED"; result: FacilityStripeSyncResult };

/** A checkout return is a recovery trigger, never independent proof of a license.
 * Resolve the current subscription through the same owner as Console/webhooks.
 * Historical paid sessions cannot reactivate a subsequently canceled subscription.
 */
export async function applyCompletedCheckoutSession(
  session: Stripe.Checkout.Session,
  expectedFacilityId?: string,
  deps: StripeSyncDependencies = {},
): Promise<CheckoutSyncResult> {
  const facilityId = session.metadata?.facilityId ?? session.client_reference_id;
  if (!facilityId || (expectedFacilityId && facilityId !== expectedFacilityId)) {
    return { code: "WRONG_FACILITY" };
  }
  if (session.mode !== "subscription" || session.status === "expired") {
    return { code: "CHECKOUT_CANCELED" };
  }
  if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) {
    return { code: "PAYMENT_PENDING" };
  }
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return { code: "PAYMENT_PENDING" };

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) return { code: "WRONG_FACILITY" };
  const result = await syncStripeSubscriptionById(facilityId, subscriptionId, deps, customerId);
  if (result.ok) await persistSyncPaymentMethod(facilityId, subscriptionId, customerId, deps);
  return { code: "RECONCILED", result };
}

export async function applyCheckoutSessionId(input: {
  checkoutSessionId: string;
  expectedFacilityId: string;
}, deps: StripeSyncDependencies = {}): Promise<CheckoutSyncResult> {
  if (!deps.stripe && !isStripeSecretConfigured()) return { code: "UNAVAILABLE" };
  const stripe = deps.stripe ?? getStripeServerClient();
  const session = await stripe.checkout.sessions.retrieve(input.checkoutSessionId);
  return applyCompletedCheckoutSession(session, input.expectedFacilityId, deps);
}
