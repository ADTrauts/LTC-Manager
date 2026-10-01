import { randomBytes, randomUUID } from "node:crypto";

const DEFAULT_MESSAGE_ID_DOMAIN = "vssyl.com";

/** 40 lowercase hex chars (160 bits). Must match SupportTicket_replyToken_format_check. */
export function generateSupportReplyToken(): string {
  return randomBytes(20).toString("hex");
}

/** Accepts `noreply@vssyl.com` or `Vssyl <noreply@vssyl.com>`. */
export function messageIdDomainFromAddress(fromAddress: string): string {
  const match = fromAddress.match(/@([A-Za-z0-9.-]+)>?\s*$/);
  return match?.[1]?.toLowerCase() || DEFAULT_MESSAGE_ID_DOMAIN;
}

/** RFC 5322 msg-id without angle brackets, as stored on SupportTicketMessage. */
export function generateSupportInternetMessageId(domain: string): string {
  return `support.${randomUUID()}@${domain}`;
}

export function formatMessageIdHeader(internetMessageId: string): string {
  return `<${internetMessageId}>`;
}

export function newClientSubmissionId(): string {
  return randomUUID();
}
