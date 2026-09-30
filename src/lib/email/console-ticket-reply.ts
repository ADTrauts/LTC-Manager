import {
  sendTemplatedEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

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
  facilityDisplayName: string;
  subject: string;
  replyBody: string;
}): {
  display_name: string;
  facility_name: string;
  subject: string;
  reply_html: string;
  reply_text: string;
} {
  const reply = input.replyBody.trim();
  return {
    display_name: input.displayName.trim() || "there",
    facility_name: input.facilityDisplayName.trim() || "your facility",
    subject: input.subject.trim() || "your Vssyl request",
    reply_html: escapeHtml(reply).replaceAll("\n", "<br />"),
    reply_text: reply,
  };
}

export async function sendConsoleTicketReplyEmail(
  input: {
    to: string;
    displayName: string;
    facilityDisplayName: string;
    subject: string;
    replyBody: string;
  },
  options?: Parameters<typeof sendTemplatedEmail>[1],
): Promise<SendTransactionalEmailResult> {
  return sendTemplatedEmail(
    {
      to: input.to,
      templateAlias: CONSOLE_TICKET_REPLY_TEMPLATE_ALIAS,
      templateModel: buildConsoleTicketReplyTemplateModel(input),
      tag: "console-ticket-reply",
    },
    options,
  );
}
