import {
  type EmailHeader,
  sendTemplatedEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

/** Postmark-hosted template. Its Subject must render `{{subject}}`, which carries `[VSS-n]`. */
export const CONSOLE_TICKET_REPLY_TEMPLATE_ALIAS = "console-ticket-reply";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildConsoleTicketReplyTemplateModel(input: {
  displayName: string;
  facilityDisplayName: string | null;
  ticketNumber: string;
  emailSubject: string;
  ticketSubject: string;
  replyBody: string;
}): {
  display_name: string;
  facility_name: string;
  subject: string;
  ticket_number: string;
  ticket_subject: string;
  reply_html: string;
  reply_text: string;
} {
  const reply = input.replyBody.trim();
  return {
    display_name: input.displayName.trim() || "there",
    facility_name: input.facilityDisplayName?.trim() || "your facility",
    subject: input.emailSubject.trim() || "Your Vssyl request",
    ticket_number: input.ticketNumber,
    ticket_subject: input.ticketSubject.trim(),
    reply_html: escapeHtml(reply).replaceAll("\n", "<br />"),
    reply_text: reply,
  };
}

export async function sendConsoleTicketReplyEmail(
  input: {
    to: string;
    displayName: string;
    facilityDisplayName: string | null;
    ticketNumber: string;
    emailSubject: string;
    ticketSubject: string;
    replyBody: string;
    from?: string;
    replyTo?: string | null;
    headers?: EmailHeader[];
    metadata?: Record<string, string>;
  },
  options?: Parameters<typeof sendTemplatedEmail>[1],
): Promise<SendTransactionalEmailResult> {
  return sendTemplatedEmail(
    {
      to: input.to,
      from: input.from,
      replyTo: input.replyTo,
      templateAlias: CONSOLE_TICKET_REPLY_TEMPLATE_ALIAS,
      templateModel: buildConsoleTicketReplyTemplateModel(input),
      tag: "console-ticket-reply",
      headers: input.headers,
      metadata: input.metadata,
    },
    options,
  );
}
