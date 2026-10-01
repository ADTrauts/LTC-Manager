/**
 * Postmark inbound webhook payloads, shaped like Postmark's documented inbound JSON.
 * https://postmarkapp.com/developer/webhooks/inbound-webhook
 */
import { randomUUID } from "node:crypto";

export type PostmarkInboundFixtureOptions = {
  messageId?: string;
  fromEmail?: string;
  fromName?: string;
  mailboxHash?: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  strippedTextReply?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  references?: string[];
  extraHeaders?: Array<{ Name: string; Value: string }>;
  attachments?: boolean;
  inboundAddress?: string;
};

export function postmarkInboundPayload(options: PostmarkInboundFixtureOptions = {}) {
  const fromEmail = options.fromEmail ?? "ada.lovelace@example.com";
  const fromName = options.fromName ?? "Ada Lovelace";
  const hash = options.mailboxHash ?? "";
  const inbound = options.inboundAddress ?? "support@reply.vssyl.test";
  const [local, domain] = inbound.split("@");
  const to = hash ? `${local}+${hash}@${domain}` : inbound;
  const rfcMessageId = options.rfcMessageId ?? `CAE${randomUUID().replaceAll("-", "")}@mail.example.com`;

  const headers: Array<{ Name: string; Value: string }> = [
    { Name: "Return-Path", Value: `<${fromEmail}>` },
    { Name: "Received", Value: "by mx.postmarkapp.com (Postfix) with ESMTPS id 4F2; Thu, 1 Oct 2026 09:00:00 -0400" },
    { Name: "X-Spam-Checker-Version", Value: "SpamAssassin 3.4.6 on p-pm-inboundg01a-aws-useast1a" },
    { Name: "X-Spam-Status", Value: "No" },
    { Name: "X-Spam-Score", Value: "-0.1" },
    { Name: "X-Spam-Tests", Value: "DKIM_SIGNED,DKIM_VALID,SPF_PASS" },
    { Name: "MIME-Version", Value: "1.0" },
    { Name: "Message-ID", Value: `<${rfcMessageId}>` },
  ];
  if (options.inReplyTo) headers.push({ Name: "In-Reply-To", Value: `<${options.inReplyTo}>` });
  if (options.references?.length) {
    headers.push({ Name: "References", Value: options.references.map((id) => `<${id}>`).join(" ") });
  }
  headers.push(...(options.extraHeaders ?? []));

  return {
    FromName: fromName,
    MessageStream: "inbound",
    From: fromEmail,
    FromFull: { Email: fromEmail, Name: fromName, MailboxHash: "" },
    To: `"Vssyl Support" <${to}>`,
    ToFull: [{ Email: to, Name: "Vssyl Support", MailboxHash: hash }],
    Cc: "\"Grace Hopper\" <grace@example.com>",
    CcFull: [{ Email: "grace@example.com", Name: "Grace Hopper", MailboxHash: "" }],
    Bcc: "",
    BccFull: [],
    OriginalRecipient: to,
    Subject: options.subject ?? "Cooler logs are not saving",
    MessageID: options.messageId ?? randomUUID(),
    ReplyTo: "",
    MailboxHash: hash,
    Date: "Thu, 1 Oct 2026 09:00:00 -0400",
    TextBody:
      options.textBody ??
      "Hi,\n\nThe walk-in cooler log won't save on the kitchen tablet.\n\nThanks,\nAda\n\nOn Wed, Vssyl Support wrote:\n> Earlier reply",
    HtmlBody:
      options.htmlBody ??
      "<html><body><p>Hi,</p><p>The walk-in cooler log won't save on the kitchen tablet.</p><p>Thanks,<br>Ada</p></body></html>",
    StrippedTextReply: options.strippedTextReply ?? "Hi,\n\nThe walk-in cooler log won't save on the kitchen tablet.\n\nThanks,\nAda",
    Tag: "",
    Headers: headers,
    Attachments:
      options.attachments === false
        ? []
        : [
            {
              Name: "screenshot.png",
              Content: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
              ContentType: "image/png",
              ContentLength: 68,
              ContentID: "",
            },
            {
              Name: "invoice.pdf",
              Content: "JVBERi0xLjQKJcfsj6IKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmoK",
              ContentType: "application/pdf",
              ContentLength: 48,
              ContentID: "",
            },
          ],
  };
}
