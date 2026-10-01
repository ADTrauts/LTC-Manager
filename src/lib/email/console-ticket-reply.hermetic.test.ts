import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsoleTicketReplyTemplateModel,
  CONSOLE_TICKET_REPLY_TEMPLATE_ALIAS,
  sendConsoleTicketReplyEmail,
} from "./console-ticket-reply";
import { resetPostmarkClientForTests } from "./send-transactional";

test("console ticket reply template alias is stable", () => {
  assert.equal(CONSOLE_TICKET_REPLY_TEMPLATE_ALIAS, "console-ticket-reply");
});

test("console ticket reply escapes HTML and keeps line breaks", () => {
  const model = buildConsoleTicketReplyTemplateModel({
    displayName: " Ada ",
    facilityDisplayName: " Terrace View ",
    ticketNumber: "VSS-1001",
    emailSubject: " [VSS-1001] Billing ",
    ticketSubject: " Billing ",
    replyBody: "Line one\n<script>alert(1)</script>",
  });
  assert.equal(model.display_name, "Ada");
  assert.equal(model.facility_name, "Terrace View");
  assert.equal(model.subject, "[VSS-1001] Billing");
  assert.equal(model.ticket_number, "VSS-1001");
  assert.equal(model.ticket_subject, "Billing");
  assert.equal(model.reply_html, "Line one<br />&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(model.reply_text, "Line one\n<script>alert(1)</script>");
});

test("console ticket reply tolerates tickets without a facility", () => {
  const model = buildConsoleTicketReplyTemplateModel({
    displayName: "",
    facilityDisplayName: null,
    ticketNumber: "VSS-1002",
    emailSubject: "[VSS-1002] Question",
    ticketSubject: "Question",
    replyBody: "Hi",
  });
  assert.equal(model.display_name, "there");
  assert.equal(model.facility_name, "your facility");
});

test("console ticket reply forwards headers and metadata to Postmark", async () => {
  resetPostmarkClientForTests();
  let sent: Record<string, unknown> | null = null;
  const result = await sendConsoleTicketReplyEmail(
    {
      to: "ada@example.com",
      displayName: "Ada",
      facilityDisplayName: null,
      ticketNumber: "VSS-1001",
      emailSubject: "[VSS-1001] Billing",
      ticketSubject: "Billing",
      replyBody: "Hello",
      headers: [
        { name: "Message-ID", value: "<support.abc@vssyl.com>" },
        { name: "X-PM-KeepID", value: "true" },
      ],
      metadata: { supportTicketId: "t1", supportTicketNumber: "VSS-1001", supportMessageId: "m1" },
    },
    {
      env: { POSTMARK_SERVER_TOKEN: "server-token" },
      client: {
        sendEmailWithTemplate: async (message) => {
          sent = message;
          return { MessageID: "pm-1" };
        },
      },
    },
  );
  assert.deepEqual(result, { sent: true, messageId: "pm-1" });
  assert.ok(sent);
  const message = sent as Record<string, unknown>;
  assert.equal(message.TemplateAlias, "console-ticket-reply");
  assert.deepEqual(message.Headers, [
    { Name: "Message-ID", Value: "<support.abc@vssyl.com>" },
    { Name: "X-PM-KeepID", Value: "true" },
  ]);
  assert.deepEqual(message.Metadata, {
    supportTicketId: "t1",
    supportTicketNumber: "VSS-1001",
    supportMessageId: "m1",
  });
  assert.equal((message.TemplateModel as Record<string, unknown>).subject, "[VSS-1001] Billing");
});
