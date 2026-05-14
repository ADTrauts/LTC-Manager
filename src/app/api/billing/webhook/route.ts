import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export async function POST(request: Request) {
  const stripe = getStripeServerClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  }

  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "setup_intent.succeeded") {
    const setupIntent = event.data.object;
    const facilityId = setupIntent.metadata?.facilityId ?? null;
    if (facilityId) {
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
  }

  return NextResponse.json({ received: true });
}
