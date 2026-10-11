import { prisma } from "@/lib/prisma";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";

export type PersistDefaultPaymentMethodDeps = {
  isConfigured?: () => boolean;
  retrieveSubscription?: (
    subscriptionId: string,
  ) => Promise<{ default_payment_method?: string | { id: string } | null }>;
  retrieveCustomer?: (customerId: string) => Promise<{
    deleted?: boolean;
    invoice_settings?: { default_payment_method?: string | { id: string } | null };
  }>;
  updateFacility?: (facilityId: string, paymentMethodId: string) => Promise<void>;
};

/**
 * Copies Stripe's current default payment method onto Facility.
 * Read-only against Stripe. Does not create, attach, or change cards.
 */
export async function persistDefaultPaymentMethod(
  facilityId: string,
  subscriptionId: string | null,
  customerId: string | null,
  deps: PersistDefaultPaymentMethodDeps = {},
): Promise<string | null> {
  const isConfigured = deps.isConfigured ?? isStripeSecretConfigured;
  if (!isConfigured()) return null;

  const retrieveSubscription = deps.retrieveSubscription ?? defaultRetrieveSubscription;
  const retrieveCustomer = deps.retrieveCustomer ?? defaultRetrieveCustomer;
  const updateFacility = deps.updateFacility ?? defaultUpdateFacility;

  let paymentMethodId: string | null = null;

  if (subscriptionId) {
    const subscription = await retrieveSubscription(subscriptionId);
    paymentMethodId = idFromExpandable(subscription.default_payment_method);
  }

  if (!paymentMethodId && customerId) {
    const customer = await retrieveCustomer(customerId);
    if (!customer.deleted) {
      paymentMethodId = idFromExpandable(customer.invoice_settings?.default_payment_method);
    }
  }

  if (!paymentMethodId) return null;

  await updateFacility(facilityId, paymentMethodId);
  return paymentMethodId;
}

export function idFromExpandable(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function defaultRetrieveSubscription(subscriptionId: string) {
  return getStripeServerClient().subscriptions.retrieve(subscriptionId);
}

async function defaultRetrieveCustomer(customerId: string) {
  return getStripeServerClient().customers.retrieve(customerId);
}

async function defaultUpdateFacility(facilityId: string, paymentMethodId: string) {
  await prisma.facility.update({
    where: { id: facilityId },
    data: { stripeDefaultPaymentMethodId: paymentMethodId },
  });
}
