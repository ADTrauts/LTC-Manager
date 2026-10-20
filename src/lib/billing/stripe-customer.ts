import { Prisma, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";
type CustomerInput = { facilityId: string; displayName: string; billingEmail: string | null; stripeCustomerId: string | null; fallbackEmail: string };
/** Canonical billing customer owner. Never creates a subscription or charges a card.
 * The live Facility row, rather than a caller's stale snapshot, serializes creation.
 * Customer creation uses a stable provider key; fee replay is separately durable per service order.
 */
export async function ensureFacilityStripeCustomer(input: CustomerInput, deps: { db?: PrismaClient; tx?: Prisma.TransactionClient; stripe?: Stripe } = {}): Promise<string> {
  const ensure = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id"=${input.facilityId} FOR UPDATE`);
    const facility = await tx.facility.findUniqueOrThrow({ where: { id: input.facilityId }, select: { stripeCustomerId: true, displayName: true, billingEmail: true } });
    if (facility.stripeCustomerId) return facility.stripeCustomerId;
    const stripe = deps.stripe ?? getStripeServerClient();
    const customer = await stripe.customers.create({ name: facility.displayName, email: facility.billingEmail ?? input.fallbackEmail, metadata: { facilityId: input.facilityId } },{ idempotencyKey: `facility-customer-${input.facilityId}`, timeout: 10000, maxNetworkRetries: 0 });
    await tx.facility.update({ where: { id: input.facilityId }, data: { stripeCustomerId: customer.id } });
    return customer.id;
  };
  return deps.tx ? ensure(deps.tx) : (deps.db ?? prisma).$transaction(ensure,{ timeout: 20000, maxWait: 30000 });
}
export function isStripeCheckoutConfigured(): boolean { return isStripeSecretConfigured(); }
