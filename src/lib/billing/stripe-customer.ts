import { prisma } from "@/lib/prisma";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";

export async function ensureFacilityStripeCustomer(input: {
  facilityId: string;
  displayName: string;
  billingEmail: string | null;
  stripeCustomerId: string | null;
  fallbackEmail: string;
}): Promise<string> {
  if (input.stripeCustomerId) {
    return input.stripeCustomerId;
  }

  const stripe = getStripeServerClient();
  const customer = await stripe.customers.create({
    name: input.displayName,
    email: input.billingEmail ?? input.fallbackEmail,
    metadata: { facilityId: input.facilityId },
  });

  await prisma.facility.update({
    where: { id: input.facilityId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export function isStripeCheckoutConfigured(): boolean {
  return isStripeSecretConfigured();
}
