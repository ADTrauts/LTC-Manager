import { prisma } from "@/lib/prisma";
import { getSupportOutboundWebhookCredentials } from "@/lib/support/config";
import { applySupportDeliveryEvent } from "@/lib/support/delivery-events";
import { handleSupportDeliveryWebhook } from "@/lib/support/delivery-webhook";

export async function POST(request: Request) {
  return handleSupportDeliveryWebhook(request, {
    credentials: getSupportOutboundWebhookCredentials(),
    apply: (event) => applySupportDeliveryEvent(prisma, event),
  });
}
