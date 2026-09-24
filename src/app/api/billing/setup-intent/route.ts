import { NextResponse } from "next/server";

import { requireAtLeastRole } from "@/lib/access";
import { ensureFacilityStripeCustomer } from "@/lib/billing/stripe-customer";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export async function POST() {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

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

  const customerId = await ensureFacilityStripeCustomer({
    facilityId: facility.id,
    displayName: facility.displayName,
    billingEmail: facility.billingEmail,
    stripeCustomerId: facility.stripeCustomerId,
    fallbackEmail: session.email,
  });

  const stripe = getStripeServerClient();
  const intent = await stripe.setupIntents.create({
    customer: customerId,
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
