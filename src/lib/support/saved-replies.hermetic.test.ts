import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  renderSupportSavedReply,
  SUPPORT_SAVED_REPLY_VARIABLES,
} from "./saved-replies";

test("saved reply variables resolve deterministically and leave unknown tokens", () => {
  const rendered = renderSupportSavedReply(
    "Hi {{customer.first_name}}, ticket {{ticket.number}} at {{facility.name}}. — {{staff.name}}\n{{unknown.token}}",
    {
      customerName: "Ada Lovelace",
      ticketNumber: 1002,
      facilityName: "Terrace View",
      staffName: "Harbor Staff",
    },
  );
  assert.equal(
    rendered,
    "Hi Ada, ticket VSS-1002 at Terrace View. — Harbor Staff\n{{unknown.token}}",
  );
  assert.ok(SUPPORT_SAVED_REPLY_VARIABLES.includes("customer.first_name"));
});

test("missing saved-reply variables become empty strings and do not throw", () => {
  const rendered = renderSupportSavedReply(
    "Hello {{customer.name}} {{customer.first_name}} ({{facility.name}})",
    {
      customerName: null,
      ticketNumber: 1002,
      facilityName: null,
      staffName: null,
    },
  );
  assert.equal(rendered, "Hello   ()");
});

test("saved reply insertion copies text; composer and send do not keep a template id", () => {
  const composer = readFileSync(
    join(process.cwd(), "src/components/harbor-console/support-reply-composer.tsx"),
    "utf8",
  );
  const reply = readFileSync(join(process.cwd(), "src/lib/support/reply.ts"), "utf8");
  assert.match(composer, /Insert/);
  assert.match(composer, /Replace draft/);
  assert.match(composer, /name="body"/);
  assert.equal(composer.includes("savedReplyId"), false);
  assert.equal(reply.includes("savedReplyId"), false);
  assert.equal(reply.includes("supportSavedReply"), false);
});

test("saved-reply management and actions require Harbor staff first", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/tickets/saved-replies/page.tsx"),
    "utf8",
  );
  const actions = readFileSync(join(process.cwd(), "src/app/console/(staff)/tickets/actions.ts"), "utf8");
  const pageBody = page.slice(page.indexOf("export default"));
  assert.ok(pageBody.indexOf("requireHarborStaff()") >= 0);
  assert.ok(pageBody.indexOf("listSupportSavedReplies") > pageBody.indexOf("requireHarborStaff()"));
  for (const name of [
    "createSupportSavedReplyAction",
    "updateSupportSavedReplyAction",
    "setSupportSavedReplyActiveAction",
  ]) {
    const start = actions.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, name);
    const slice = actions.slice(start, start + 400);
    assert.match(slice, /requireHarborStaff\(\)/);
  }
});
