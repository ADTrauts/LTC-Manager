import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsoleTicketReplyTemplateModel,
  CONSOLE_TICKET_REPLY_TEMPLATE_ALIAS,
} from "./console-ticket-reply";

test("console ticket reply template alias is stable", () => {
  assert.equal(CONSOLE_TICKET_REPLY_TEMPLATE_ALIAS, "console-ticket-reply");
});

test("console ticket reply escapes HTML and keeps line breaks", () => {
  const model = buildConsoleTicketReplyTemplateModel({
    displayName: " Ada ",
    facilityDisplayName: " Terrace View ",
    subject: " Billing ",
    replyBody: "Line one\n<script>alert(1)</script>",
  });
  assert.equal(model.display_name, "Ada");
  assert.equal(model.facility_name, "Terrace View");
  assert.equal(model.subject, "Billing");
  assert.equal(model.reply_html, "Line one<br />&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(model.reply_text, "Line one\n<script>alert(1)</script>");
});
