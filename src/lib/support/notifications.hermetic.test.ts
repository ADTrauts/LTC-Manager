import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildSupportStaffNotificationEmail,
  SUPPORT_STAFF_NOTIFICATION_EMAIL_TAG,
  supportConsoleTicketUrl,
} from "./notification-email";
import {
  resolveSupportNotificationStaffIds,
  shouldEmailSupportNotification,
  supportNotificationCopy,
  supportNotificationDedupeKey,
} from "./notifications";

test("notification copy stays short and ticket-linked", () => {
  assert.deepEqual(supportNotificationCopy("NEW_TICKET", "VSS-1042", "Report export failed"), {
    title: "New support ticket",
    body: "VSS-1042 · Report export failed",
  });
  assert.equal(
    supportNotificationCopy("DELIVERY_FAILED", "VSS-1042", "Report export failed").body.includes("may not have received"),
    true,
  );
});

test("recipients: assign-to-self is silent; unassigned customer reply does not fan out", () => {
  assert.deepEqual(
    resolveSupportNotificationStaffIds({
      type: "ASSIGNED_TO_ME",
      assignedStaffId: "me",
      actorStaffId: "me",
      activeStaffIds: ["me", "other"],
    }),
    [],
  );
  assert.deepEqual(
    resolveSupportNotificationStaffIds({
      type: "ASSIGNED_TO_ME",
      assignedStaffId: "other",
      actorStaffId: "me",
      activeStaffIds: ["me", "other"],
    }),
    ["other"],
  );
  assert.deepEqual(
    resolveSupportNotificationStaffIds({
      type: "CUSTOMER_REPLIED",
      assignedStaffId: null,
      actorStaffId: null,
      activeStaffIds: ["me", "other"],
    }),
    [],
  );
  assert.deepEqual(
    resolveSupportNotificationStaffIds({
      type: "NEW_TICKET",
      assignedStaffId: null,
      actorStaffId: null,
      activeStaffIds: ["me", "other"],
    }),
    ["me", "other"],
  );
  assert.deepEqual(
    resolveSupportNotificationStaffIds({
      type: "URGENT_PRIORITY",
      assignedStaffId: null,
      actorStaffId: "me",
      activeStaffIds: ["me", "other"],
    }),
    ["other"],
  );
});

test("dedupe keys are stable and do not use timestamps", () => {
  const key = supportNotificationDedupeKey("BOUNCED", "staff1", "msg1");
  assert.equal(key, "BOUNCED:staff1:msg1");
  assert.equal(key.includes("2026"), false);
  assert.equal(shouldEmailSupportNotification("NEW_TICKET"), true);
  assert.equal(shouldEmailSupportNotification("ASSIGNED_TO_ME"), false);
  assert.equal(shouldEmailSupportNotification("HIGH_PRIORITY"), false);
  assert.equal(shouldEmailSupportNotification("DELIVERY_FAILED"), false);
});

test("internal staff email is not a support reply thread", () => {
  const email = buildSupportStaffNotificationEmail({
    type: "NEW_TICKET",
    ticketId: "tick_1",
    ticketNumber: 1042,
    subject: "Report export failed",
    requesterName: "Jane Smith",
    facilityName: "Example Facility",
    env: { VSSYL_PUBLIC_URL: "https://vssyl.com" },
  });
  assert.equal(email.subject, "[Vssyl Support] New ticket VSS-1042");
  assert.match(email.text, /Jane Smith/);
  assert.match(email.text, /Example Facility/);
  assert.match(email.text, /https:\/\/vssyl\.com\/console\/tickets\/tick_1/);
  assert.equal(email.text.includes("Reply-To"), false);
  assert.equal(supportConsoleTicketUrl("tick_1"), "https://vssyl.com/console/tickets/tick_1");
  assert.equal(SUPPORT_STAFF_NOTIFICATION_EMAIL_TAG, "support-staff-notification");
});

test("Console bell and mark-read actions are Harbor-only", () => {
  const shell = readFileSync(join(process.cwd(), "src/components/harbor-console/harbor-console-shell.tsx"), "utf8");
  const layout = readFileSync(join(process.cwd(), "src/app/console/(staff)/layout.tsx"), "utf8");
  const actions = readFileSync(join(process.cwd(), "src/app/console/(staff)/tickets/actions.ts"), "utf8");
  assert.match(shell, /HarborSupportNotifications/);
  assert.match(layout, /listSupportStaffNotifications/);
  assert.match(layout, /requireHarborStaff/);
  const markOne = actions.slice(actions.indexOf("export async function markSupportNotificationReadAction"));
  assert.match(markOne, /requireHarborStaff\(\)/);
  assert.match(markOne, /ticketPath\(ticketId\)/);
  assert.equal(markOne.includes("sendSupportReply"), false);
});
