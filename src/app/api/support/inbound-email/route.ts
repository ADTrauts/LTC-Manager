import { prisma } from "@/lib/prisma";
import { getSupportInboundCredentials, isSupportOwnAddress } from "@/lib/support/config";
import { processInboundSupportEmail } from "@/lib/support/inbound-service";
import { handleSupportInboundWebhook } from "@/lib/support/inbound-webhook";

export async function POST(request: Request) {
  return handleSupportInboundWebhook(request, {
    credentials: getSupportInboundCredentials(),
    process: (email, extras) =>
      processInboundSupportEmail(prisma, email, {
        isOwnAddress: (address) => isSupportOwnAddress(address),
        attachmentContents: extras?.attachmentContents,
      }),
  });
}
