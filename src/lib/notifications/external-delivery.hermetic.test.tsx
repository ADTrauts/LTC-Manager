import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { NotificationCenter } from "@/components/notifications/notification-center";
import { QuietHoursForm } from "@/components/notifications/quiet-hours-form";
import { BrowserAlertsPanel } from "@/components/notifications/browser-alerts-panel";
import { listScheduledEvaluators } from "@/lib/scheduled-evaluation/registry";

import { evaluateDeliveryEligibility } from "./delivery-eligibility";
import {
  EXTERNAL_DELIVERY_DISPATCH_LIMIT,
  EXTERNAL_DELIVERY_MAX_PAGES,
  EXTERNAL_DELIVERY_PAGE,
  SNOOZE_WAKE_HORIZON_MS,
} from "./external-delivery";
import { PUSH_CLAIM_LEASE_MS } from "./push-delivery";
import { PUSH_TTL_MS } from "./push-dispatch";
import { WEB_PUSH_REQUEST_TIMEOUT_MS } from "./push-sender";
import {
  ATTENTION_SNOOZE_MAX_MS,
  presentSnoozeControl,
  snoozeUntilFromChoice,
} from "./snooze";

const now = new Date("2026-11-04T07:00:00.000Z");
const noop = async () => {};

function attention(priority: "UPDATE" | "NEEDS_ATTENTION" | "URGENT" | "CRITICAL", protectedAttention: boolean) {
  return {
    kind: "OPERATIONAL" as const,
    priority,
    requiresAcknowledgement: priority !== "UPDATE",
    protected: protectedAttention,
    recipientReasons: ["DEPARTMENT_MANAGER" as const],
    resolvedAt: null,
    expiresAt: null,
  };
}

test("snooze durations are the three certified choices and nothing longer", () => {
  assert.equal(snoozeUntilFromChoice("30m", now)?.getTime(), now.getTime() + 30 * 60 * 1000);
  assert.equal(snoozeUntilFromChoice("1h", now)?.getTime(), now.getTime() + 60 * 60 * 1000);
  assert.equal(snoozeUntilFromChoice("4h", now)?.getTime(), now.getTime() + ATTENTION_SNOOZE_MAX_MS);
  assert.equal(snoozeUntilFromChoice("5h", now), null);
  assert.equal(snoozeUntilFromChoice("86400000", now), null);
  assert.equal(snoozeUntilFromChoice("", now), null);
});

test("snooze presentation follows the server policy and a past timestamp is not paused", () => {
  const base = {
    resolvedAt: null,
    expiresAt: null,
    now,
    snoozedUntil: null,
    timeZone: "UTC",
  };
  assert.equal(presentSnoozeControl({ ...base, attention: attention("NEEDS_ATTENTION", false) }).state, "available");
  assert.equal(presentSnoozeControl({ ...base, attention: attention("NEEDS_ATTENTION", true) }).state, "hidden");
  assert.equal(presentSnoozeControl({ ...base, attention: attention("URGENT", true) }).state, "hidden");
  assert.equal(presentSnoozeControl({ ...base, attention: attention("CRITICAL", true) }).state, "hidden");
  assert.equal(presentSnoozeControl({ ...base, attention: attention("UPDATE", false) }).state, "hidden");
  assert.equal(
    presentSnoozeControl({
      ...base,
      attention: attention("URGENT", false),
      currentlyHoldsPrimaryResponsibility: true,
    }).state,
    "hidden",
  );
  assert.equal(
    presentSnoozeControl({
      ...base,
      attention: attention("URGENT", false),
      currentlyHoldsPrimaryResponsibility: false,
    }).state,
    "available",
  );
  assert.equal(
    presentSnoozeControl({
      ...base,
      attention: attention("URGENT", false),
      currentlyHoldsPrimaryResponsibility: null,
    }).state,
    "hidden",
  );
  assert.equal(
    presentSnoozeControl({
      ...base,
      attention: attention("NEEDS_ATTENTION", false),
      resolvedAt: now,
    }).state,
    "hidden",
  );
  const paused = presentSnoozeControl({
    ...base,
    attention: attention("NEEDS_ATTENTION", false),
    snoozedUntil: new Date(now.getTime() + 60 * 60 * 1000),
  });
  assert.equal(paused.state, "paused");
  const expired = presentSnoozeControl({
    ...base,
    attention: attention("NEEDS_ATTENTION", false),
    snoozedUntil: new Date(now.getTime() - 60 * 1000),
  });
  assert.equal(expired.state, "available");
  assert.equal(
    presentSnoozeControl({ ...base, attention: attention("URGENT", true), snoozedUntil: null }).state,
    "hidden",
  );
});

test("quiet hours suppress informational updates only, in the facility timezone", () => {
  const preference = {
    quietEnabled: true,
    quietStartMinute: 22 * 60,
    quietEndMinute: 7 * 60,
    updateDigestEnabled: false,
  };
  const recipient = { reason: "DEPARTMENT_MANAGER" as const, snoozedUntil: null };
  const update = attention("UPDATE", false);
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient,
      preference: { ...preference, quietEnabled: false },
      now,
      timeZone: "America/Chicago",
      mode: "INTERRUPTIVE",
    }),
    "eligible",
  );
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient,
      preference,
      now,
      timeZone: "America/Chicago",
      mode: "INTERRUPTIVE",
    }),
    "quiet",
  );
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient,
      preference,
      now,
      timeZone: "UTC",
      mode: "INTERRUPTIVE",
    }),
    "eligible",
  );
  for (const priority of ["NEEDS_ATTENTION", "URGENT", "CRITICAL"] as const) {
    assert.equal(
      evaluateDeliveryEligibility({
        notification: attention(priority, priority === "CRITICAL"),
        recipient,
        preference,
        now,
        timeZone: "America/Chicago",
        mode: "INTERRUPTIVE",
      }),
      "eligible",
    );
  }
  assert.equal(
    evaluateDeliveryEligibility({
      notification: attention("NEEDS_ATTENTION", true),
      recipient,
      preference,
      now,
      timeZone: "America/Chicago",
      mode: "INTERRUPTIVE",
    }),
    "eligible",
  );
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient,
      preference: { ...preference, updateDigestEnabled: true },
      now,
      timeZone: "UTC",
      mode: "DIGEST",
    }),
    "eligible",
  );
});

test("external delivery is last on the one shared clock and stays bounded", () => {
  const keys = listScheduledEvaluators().map((evaluator) => evaluator.key);
  assert.deepEqual(keys, [
    "coverage.time-boundaries",
    "key-points.overdue",
    "work-orders.overdue",
    "notifications.responsibility-reconciliation",
    "notifications.escalation",
    "notifications.external-delivery",
  ]);
  assert.equal(SNOOZE_WAKE_HORIZON_MS, PUSH_TTL_MS);
  assert.equal(EXTERNAL_DELIVERY_PAGE, 100);
  assert.equal(EXTERNAL_DELIVERY_MAX_PAGES, 5);
  assert.equal(EXTERNAL_DELIVERY_DISPATCH_LIMIT, 25);
  assert.equal(PUSH_CLAIM_LEASE_MS > WEB_PUSH_REQUEST_TIMEOUT_MS, true);
  const vercel = readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8");
  assert.equal(vercel.includes("scheduled-evaluation"), false);
  const page = readFileSync(new URL("../../app/(protected)/notifications/page.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("evaluateExternalDelivery"), false);
  assert.equal(page.includes("deliverQueuedPushDispatches"), false);
  const queries = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
  const count = queries.slice(
    queries.indexOf("export async function getActiveAttentionCountForUser"),
    queries.indexOf("export async function loadNotificationCenter"),
  );
  assert.equal(count.includes("snoozedUntil"), false);
  const account = readFileSync(new URL("../../components/notifications/quiet-hours-form.tsx", import.meta.url), "utf8");
  assert.equal(account.toLowerCase().includes("digest"), false);
  const logout = readFileSync(new URL("../../app/api/auth/logout/route.ts", import.meta.url), "utf8");
  assert.match(logout, /status: 503/);
  assert.equal(logout.includes(".catch(() => undefined)"), false);
});

test("the center explains snooze without hiding the item", () => {
  const item = {
    id: "n1",
    section: "needs_attention" as const,
    kind: "OPERATIONAL" as const,
    category: "maintenance",
    priority: "NEEDS_ATTENTION" as const,
    priorityLabel: "Needs Attention",
    title: "Door closer is loose",
    body: "North hall",
    departmentName: "Plant",
    occurredAtLabel: "Nov 3, 4:00 PM",
    resolvedAtLabel: null,
    endedAtLabel: null,
    read: false,
    acknowledged: false,
    requiresAcknowledgement: true,
    explanations: ["You received this because you manage this department."],
    actionPath: "/repairs/1",
    actionLabel: "Review repair",
    snooze: { state: "available" as const },
  };
  const html = renderToStaticMarkup(
    <NotificationCenter
      notice={null}
      actions={{ markRead: noop, acknowledge: noop, snooze: noop, resume: noop }}
      model={{
        status: "ready",
        activeCount: 1,
        browserDeliveryActive: true,
        needsAttention: [item],
        messages: [],
        updates: [],
        resolved: [],
        ended: [],
      }}
    />,
  );
  assert.match(html, /Pause browser alerts/);
  assert.match(html, /This notification will remain in your Notification Center/);
  assert.match(html, /30 minutes/);
  assert.match(html, /1 hour/);
  assert.match(html, /4 hours/);
  assert.match(html, /Door closer is loose/);
  assert.doesNotMatch(html, /Dismiss/);
  assert.doesNotMatch(html, /Do Not Disturb/);
  const paused = renderToStaticMarkup(
    <NotificationCenter
      notice={null}
      actions={{ markRead: noop, acknowledge: noop, snooze: noop, resume: noop }}
      model={{
        status: "ready",
        activeCount: 1,
        browserDeliveryActive: false,
        needsAttention: [{ ...item, snooze: { state: "paused", untilLabel: "Nov 3, 6:00 PM" } }],
        messages: [],
        updates: [],
        resolved: [],
        ended: [],
      }}
    />,
  );
  assert.match(paused, /Browser alerts paused until Nov 3, 6:00 PM/);
  assert.match(paused, /Resume browser alerts/);
  assert.match(paused, /Browser delivery is not active yet/);
  assert.match(paused, /This notification remains in your Notification Center/);
});

test("quiet hours and browser alerts stay truthful while delivery is inactive", () => {
  const quiet = renderToStaticMarkup(
    <QuietHoursForm
      facilityName="North Terrace"
      timeZone="America/Chicago"
      deliveryActive={false}
      preference={{ quietEnabled: false, quietStartMinute: null, quietEndMinute: null }}
      action={noop}
    />,
  );
  assert.match(quiet, /Quiet Hours/);
  assert.match(quiet, /informational Updates only/);
  assert.match(quiet, /North Terrace/);
  assert.match(quiet, /America\/Chicago/);
  assert.match(quiet, /Browser delivery is not active yet/);
  assert.match(quiet, /do not change notifications being sent now/);
  assert.doesNotMatch(quiet, /Do Not Disturb/);
  assert.doesNotMatch(quiet, /Digest/);
  const alerts = renderToStaticMarkup(<BrowserAlertsPanel deliveryActive={false} />);
  assert.match(alerts, /Browser delivery is not active yet/);
  assert.match(alerts, /Not enabled|Checking this device/);
});
