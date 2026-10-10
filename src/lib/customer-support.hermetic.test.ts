import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  CUSTOMER_SUPPORT_BODY_PROMPT,
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_HREF,
  CUSTOMER_SUPPORT_SUBJECT,
  customerSupportMailtoHref,
} from "@/lib/customer-support";
import { PLATFORM_ROUTES } from "@/lib/route-registry/platform-routes";

const FORBIDDEN_CUSTOMER_SUPPORT = [
  "ticket submission",
  "category dropdown",
  "priority selector",
  "attachments",
  "ticket history",
  "ticket number",
  "/console/tickets",
  "chat",
  "AI assistant",
];

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("customer support — mailto uses support@vssyl.com and the default subject", () => {
  assert.equal(CUSTOMER_SUPPORT_EMAIL, "support@vssyl.com");
  assert.equal(CUSTOMER_SUPPORT_SUBJECT, "Vssyl Support Request");
  assert.equal(CUSTOMER_SUPPORT_BODY_PROMPT, "What can we help with?");
  assert.equal(CUSTOMER_SUPPORT_HREF, "/help");
  assert.equal(
    customerSupportMailtoHref(),
    "mailto:support@vssyl.com?subject=Vssyl%20Support%20Request&body=What%20can%20we%20help%20with%3F",
  );
});

test("customer support — Help & Support lives in the Internal account menu", () => {
  const menu = source("src/components/sign-out-controls.tsx");
  assert.match(menu, /account-menu-help/);
  assert.match(menu, /Help & Support/);
  assert.match(menu, /CUSTOMER_SUPPORT_HREF/);
  assert.doesNotMatch(menu, /reply\.vssyl\.com/);
  assert.doesNotMatch(menu, /console\/tickets/);

  const account = source("src/app/account/page.tsx");
  assert.doesNotMatch(account, /account-support-section/);
  assert.doesNotMatch(account, /CUSTOMER_SUPPORT_HREF/);
});

test("customer support — the help surface is mailto-only and does not expose Console tickets", () => {
  const panel = source("src/components/help/help-support-panel.tsx");
  const page = source("src/app/(protected)/help/page.tsx");
  const combined = `${panel}\n${page}`;

  assert.match(panel, /Help & Support/);
  assert.match(panel, /Need help with Vssyl\?/);
  assert.match(panel, /billing questions/);
  assert.match(panel, /We.ll respond by email/);
  assert.match(panel, /help-support-email/);
  assert.match(panel, /Email Support/);
  assert.match(panel, /customerSupportMailtoHref/);
  assert.doesNotMatch(page, /console\/tickets/);
  assert.doesNotMatch(combined, /reply\.vssyl\.com/);

  for (const phrase of FORBIDDEN_CUSTOMER_SUPPORT) {
    assert.equal(
      combined.toLowerCase().includes(phrase.toLowerCase()),
      false,
      `customer help must not include "${phrase}"`,
    );
  }
});

test("customer support — /help is authenticated facility access, not Console staff", () => {
  const help = PLATFORM_ROUTES.find((route) => route.pattern === "/help");
  assert.equal(help?.access.kind, "AUTHENTICATED");
  assert.equal(help?.module, "account");

  const tickets = PLATFORM_ROUTES.find((route) => route.pattern === "/console/tickets");
  assert.equal(tickets?.access.kind, "HARBOR_STAFF");
});
