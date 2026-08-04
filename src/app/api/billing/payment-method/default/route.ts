import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

const payloadSchema = z.object({
  paymentMethodId: z.string().min(3),
});

export async function POST(request: Request) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment method payload." }, { status: 400 });
  }

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: { id: true, stripeCustomerId: true },
  });
  if (!facility?.stripeCustomerId) {
    return NextResponse.json({ error: "Stripe customer is not ready." }, { status: 400 });
  }

  const stripe = getStripeServerClient();
  await stripe.paymentMethods.attach(parsed.data.paymentMethodId, {
    customer: facility.stripeCustomerId,
  });
  await stripe.customers.update(facility.stripeCustomerId, {
    invoice_settings: { default_payment_method: parsed.data.paymentMethodId },
  });

  await prisma.facility.update({
    where: { id: facility.id },
    data: {
      stripeDefaultPaymentMethodId: parsed.data.paymentMethodId,
      onboardingCurrentStep: "complete",
      onboardingStartedAt: new Date(),
    },
  });

  await trackEvent("billing.default_payment_method.saved", {
    facilityId: facility.id,
    paymentMethodId: parsed.data.paymentMethodId,
  });

  return NextResponse.json({ ok: true });
}
