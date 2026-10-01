/**
 * Checks whether Postmark keeps the RFC Message-ID that support replies set through the
 * template API (Message-ID + X-PM-KeepID). Sends one real email.
 *
 *   POSTMARK_SERVER_TOKEN=... EMAIL_FROM=... \
 *     npx tsx scripts/verify/postmark-support-message-id.ts you@example.com
 *
 * Exit 0: the delivered message carries our Message-ID. Exit 1: Postmark replaced it, or the check
 * could not run.
 */
import { ServerClient } from "postmark";

import { getEmailFromAddress } from "@/lib/email";
import {
  formatMessageIdHeader,
  generateSupportInternetMessageId,
  messageIdDomainFromAddress,
} from "@/lib/support/identifiers";
import { postmarkSupportReplySender } from "@/lib/support/reply";

async function readMessageIdFromDump(client: ServerClient, providerMessageId: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const dump = await client.getOutboundMessageDump(providerMessageId);
      if (dump.Body) {
        const match = /^Message-ID:\s*(<[^>\r\n]+>)/im.exec(dump.Body);
        return match?.[1] ?? null;
      }
    } catch {
      // The dump is not available until Postmark has processed the message.
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Postmark did not return a message dump in time.");
}

async function main() {
  const to = process.argv[2];
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  if (!to || !token) {
    console.error("Usage: POSTMARK_SERVER_TOKEN=... npx tsx scripts/verify/postmark-support-message-id.ts <to>");
    process.exit(1);
  }

  const internetMessageId = generateSupportInternetMessageId(
    messageIdDomainFromAddress(getEmailFromAddress()),
  );
  const expected = formatMessageIdHeader(internetMessageId);
  const result = await postmarkSupportReplySender({
    to,
    displayName: "Message-ID check",
    facilityDisplayName: null,
    ticketNumber: "VSS-0000",
    emailSubject: "[VSS-0000] Message-ID verification",
    ticketSubject: "Message-ID verification",
    replyBody: "Automated check that Postmark keeps the support reply Message-ID. No action needed.",
    internetMessageId,
    metadata: {
      supportTicketId: "verification",
      supportTicketNumber: "VSS-0000",
      supportMessageId: "verification",
    },
  });
  if (!result.sent) {
    console.error(`Send failed: ${result.reason === "send_failed" ? result.error : result.reason}`);
    process.exit(1);
  }

  const actual = await readMessageIdFromDump(new ServerClient(token), result.messageId);
  console.log(`Postmark MessageID: ${result.messageId}`);
  console.log(`Expected Message-ID: ${expected}`);
  console.log(`Delivered Message-ID: ${actual ?? "(none)"}`);
  if (actual !== expected) {
    console.error("FAIL: Postmark did not keep the support reply Message-ID.");
    process.exit(1);
  }
  console.log("PASS: Postmark kept the support reply Message-ID.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
