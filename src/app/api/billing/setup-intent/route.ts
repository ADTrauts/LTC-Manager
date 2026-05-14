import { NextResponse } from "next/server";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export async function POST() {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "GM");

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      id: true,
      displayName: true,
      billingEmail: true,
      stripeCustomerId: true,
    },
  });

  if (!facility) {
    return NextResponse.json({ error: "Facility not found." }, { status: 404 });
  }

  const stripe = getStripeServerClient();
  let customerId = facility.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: facility.displayName,
      email: facility.billingEmail ?? session.email,
      metadata: { facilityId: facility.id },
    });
    customerId = customer.id;
    await prisma.facility.update({
      where: { id: facility.id },
      data: { stripeCustomerId: customer.id },
    });
  }

  const intent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: { facilityId: facility.id },
  });

  await trackEvent("billing.setup_intent.created", {
    facilityId: facility.id,
    stripeCustomerId: customerId,
    setupIntentId: intent.id,
  });

  return NextResponse.json({ clientSecret: intent.client_secret });
}
