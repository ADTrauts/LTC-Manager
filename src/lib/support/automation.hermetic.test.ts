import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  actionForSupportAutomationType,
  isValidSupportAutomationEmail,
  SUPPORT_AUTOMATION_MINUTES_PER_DAY,
  SUPPORT_AUTOMATION_TYPE_LABEL,
  supportAutomationDedupeKey,
  supportAutomationDelayLabel,
  supportAutomationSubmissionId,
} from "./automation";
import { isSupportAutomationCronAuthorized } from "./automation-processor";
import { describeSupportEvent } from "./timeline";

test("automation delays are elapsed UTC minutes, not service days", () => {
  assert.equal(SUPPORT_AUTOMATION_MINUTES_PER_DAY, 1440);
  assert.equal(supportAutomationDelayLabel("WAITING_REMINDER", 7200), "5 days");
  assert.equal(supportAutomationDelayLabel("UNASSIGNED_ALERT", 120), "2 hours");
  assert.equal(actionForSupportAutomationType("WAITING_REMINDER"), "SEND_REMINDER");
  assert.equal(SUPPORT_AUTOMATION_TYPE_LABEL.RESOLVED_CLOSE, "Close resolved tickets");
});

test("dedupe keys use the cycle timestamp, not the cron clock", () => {
  const cycle = new Date("2026-09-01T12:00:00.000Z");
  const key = supportAutomationDedupeKey("rule1", "tick1", "SEND_REMINDER", cycle);
  assert.equal(key, "rule1:tick1:SEND_REMINDER:2026-09-01T12:00:00.000Z");
  assert.equal(supportAutomationSubmissionId(key).includes("-"), true);
  assert.notEqual(supportAutomationDedupeKey("rule1", "tick1", "SEND_REMINDER", new Date()), key);
});

test("invalid contact emails are not automation recipients", () => {
  assert.equal(isValidSupportAutomationEmail("ada@example.com"), true);
  assert.equal(isValidSupportAutomationEmail("not-an-email"), false);
  assert.equal(isValidSupportAutomationEmail(""), false);
});

test("cron requires the bearer secret and does not use Harbor session", () => {
  const secret = "test-cron-secret";
  assert.equal(isSupportAutomationCronAuthorized(new Request("https://vssyl.com/api/internal/support/automation"), secret), false);
  assert.equal(
    isSupportAutomationCronAuthorized(
      new Request("https://vssyl.com/api/internal/support/automation", {
        headers: { authorization: `Bearer ${secret}` },
      }),
      secret,
    ),
    true,
  );
  assert.equal(
    isSupportAutomationCronAuthorized(
      new Request("https://vssyl.com/api/internal/support/automation", {
        headers: { authorization: "Bearer [SENSITIVE]" },
      }),
      secret,
    ),
    false,
  );
  const route = readFileSync(join(process.cwd(), "src/app/api/internal/support/automation/route.ts"), "utf8");
  assert.match(route, /isSupportAutomationCronAuthorized/);
  assert.match(route, /processSupportAutomations/);
  assert.equal(route.includes("requireHarborStaff"), false);
});

test("automation management is Harbor-only and distinct from Macros", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/tickets/automations/page.tsx"),
    "utf8",
  );
  const actions = readFileSync(join(process.cwd(), "src/app/console/(staff)/tickets/actions.ts"), "utf8");
  const help = readFileSync(join(process.cwd(), "src/components/help/help-support-panel.tsx"), "utf8");
  assert.ok(page.indexOf("requireHarborStaff()") < page.indexOf("listSupportAutomationRules("));
  assert.match(actions, /createSupportAutomationRuleAction/);
  const create = actions.slice(actions.indexOf("export async function createSupportAutomationRuleAction"));
  assert.match(create, /requireHarborStaff\(\)/);
  assert.equal(help.includes("processSupportAutomations"), false);
  assert.equal(help.includes("/console/tickets/automations"), false);
});

test("timeline copy names automated actions", () => {
  const base = {
    id: "e1",
    actorName: null,
    fromValue: "WAITING_ON_CUSTOMER",
    toValue: "RESOLVED",
    metadata: { source: "AUTOMATION" },
    createdAt: new Date(),
  };
  assert.equal(
    describeSupportEvent({ ...base, type: "STATUS_CHANGED" }),
    "Automation resolved ticket after no response",
  );
  assert.equal(
    describeSupportEvent({ ...base, type: "STATUS_CHANGED", toValue: "CLOSED", fromValue: "RESOLVED" }),
    "Automation closed resolved ticket",
  );
  assert.equal(
    describeSupportEvent({ ...base, type: "AUTOMATION_APPLIED", toValue: "SEND_REMINDER" }),
    "Automation sent customer reminder",
  );
});
