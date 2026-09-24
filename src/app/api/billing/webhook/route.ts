import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { handleStripeBillingEvent } from "@/lib/billing/webhook-handlers";
import { getStripeServerClient } from "@/lib/stripe";

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
