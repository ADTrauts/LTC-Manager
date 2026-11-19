import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { handleStripeBillingEvent } from "@/lib/billing/webhook-handlers";
import { getStripeServerClient, isStripeSecretConfigured } from "@/lib/stripe";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret || !isStripeSecretConfigured()) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeServerClient();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    await handleStripeBillingEvent(event);
  } catch (error) {
    console.error("billing.webhook.failed", {
      type: event.type,
      id: event.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
