import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { NotificationCenter } from "@/components/notifications/notification-center";
import type { NotificationCenterItem } from "@/lib/notifications/queries";

import {
  attentionBellCountText,
  attentionBellLabel,
  classifyNotificationSection,
  compareActiveAttention,
  isActiveAttention,
  notificationActorFromSession,
  safeNotificationActionPath,
} from "./center";

const noop = async () => {};

function item(overrides: Partial<NotificationCenterItem> = {}): NotificationCenterItem {
  return {
    id: "n1",
    section: "needs_attention",
    kind: "OPERATIONAL",
    category: "coverage",
    priority: "URGENT",
    priorityLabel: "Urgent",
    title: "Coverage needs attention",
    body: "North dining room · Breakfast",
    departmentName: "Food and Nutrition",
    occurredAtLabel: "Oct 29, 8:00 AM",
    resolvedAtLabel: null,
    endedAtLabel: null,
    read: false,
    acknowledged: false,
    requiresAcknowledgement: true,
    explanations: ["You received this because you are the on-duty supervisor."],
    actionPath: "/staffing?date=2026-10-29",
    actionLabel: "Review Coverage",
    snooze: { state: "hidden" },
    ...overrides,
  };
}

test("section and bell rules keep read separate from attention", () => {
  assert.equal(
    classifyNotificationSection({ kind: "OPERATIONAL", priority: "URGENT", resolvedAt: null }),
    "needs_attention",
  );
  assert.equal(
    classifyNotificationSection({ kind: "OPERATIONAL", priority: "UPDATE", resolvedAt: null }),
    "updates",
  );
  assert.equal(
    classifyNotificationSection({ kind: "COMMUNICATION", priority: "NEEDS_ATTENTION", resolvedAt: null }),
    "messages",
  );
  assert.equal(
    classifyNotificationSection({
      kind: "OPERATIONAL",
      priority: "CRITICAL",
      resolvedAt: new Date("2026-10-29T12:00:00.000Z"),
    }),
    "resolved",
  );
  assert.equal(isActiveAttention({ kind: "OPERATIONAL", priority: "NEEDS_ATTENTION", resolvedAt: null }), true);
  assert.equal(isActiveAttention({ kind: "ADMIN", priority: "URGENT", resolvedAt: null }), true);
  assert.equal(isActiveAttention({ kind: "OPERATIONAL", priority: "UPDATE", resolvedAt: null }), false);
  assert.equal(isActiveAttention({ kind: "COMMUNICATION", priority: "CRITICAL", resolvedAt: null }), false);
  assert.equal(
    isActiveAttention({ kind: "OPERATIONAL", priority: "CRITICAL", resolvedAt: new Date() }),
    false,
  );
  const endedAt = new Date("2026-10-29T14:00:00.000Z");
  const afterEnd = new Date("2026-10-29T15:00:00.000Z");
  assert.equal(
    classifyNotificationSection({
      kind: "OPERATIONAL",
      priority: "CRITICAL",
      resolvedAt: null,
      expiresAt: endedAt,
      now: afterEnd,
    }),
    "ended",
  );
  assert.equal(
    isActiveAttention({
      kind: "OPERATIONAL",
      priority: "CRITICAL",
      resolvedAt: null,
      expiresAt: endedAt,
      now: afterEnd,
    }),
    false,
  );
  assert.ok(
    compareActiveAttention(
      { id: "later-low", priority: "NEEDS_ATTENTION", occurredAt: new Date("2026-10-29T12:00:00.000Z") },
      { id: "earlier-high", priority: "CRITICAL", occurredAt: new Date("2026-10-29T08:00:00.000Z") },
    ) > 0,
  );
});

test("bell count stays calm and does not pretend a missing count is zero", () => {
  assert.equal(attentionBellLabel(0), "Attention. Nothing needs your attention.");
  assert.equal(attentionBellLabel(null), "Attention. The count is unavailable.");
  assert.equal(attentionBellLabel(2), "Attention. 2 items need attention.");
  assert.equal(attentionBellCountText(0), null);
  assert.equal(attentionBellCountText(null), null);
  assert.equal(attentionBellCountText(120), "99+");
});

test("action paths stay in the application and PIN identity is refused", () => {
  assert.equal(safeNotificationActionPath("/staffing?date=2026-10-29"), "/staffing?date=2026-10-29");
  assert.equal(safeNotificationActionPath(null), null);
  assert.equal(safeNotificationActionPath("https://example.test/staffing"), null);
  assert.equal(safeNotificationActionPath("//example.test"), null);
  assert.equal(
    notificationActorFromSession({ authKind: "employee", uid: "employee-1", facilityId: "facility-1" }),
    null,
  );
  assert.deepEqual(
    notificationActorFromSession({ authKind: "user", uid: "user-1", facilityId: "facility-1" }),
    { userId: "user-1", facilityId: "facility-1" },
  );
});

test("the center shows attention without treating acknowledgement as resolution", () => {
  const html = renderToStaticMarkup(
    <NotificationCenter
      notice={null}
      actions={{ markRead: noop, acknowledge: noop, snooze: noop, resume: noop }}
      model={{
        status: "ready",
        activeCount: 1,
        browserDeliveryActive: false,
        needsAttention: [item()],
        messages: [],
        updates: [item({ id: "u1", section: "updates", priority: "UPDATE", priorityLabel: "Update", requiresAcknowledgement: false, actionPath: null, actionLabel: null, explanations: ["You received this because this work is assigned to you."] })],
        resolved: [item({ id: "r1", section: "resolved", resolvedAtLabel: "Oct 29, 9:00 AM", read: true, acknowledged: true })],
        ended: [
          item({
            id: "e1",
            section: "ended",
            endedAtLabel: "Oct 29, 10:00 AM",
            read: true,
            acknowledged: true,
          }),
        ],
      }}
    />,
  );
  assert.match(html, /Nothing needs your attention right now\.|Coverage needs attention/);
  assert.match(html, /Urgent/);
  assert.match(html, /You received this because you are the on-duty supervisor\./);
  assert.match(html, /Review Coverage/);
  assert.match(html, /href="\/staffing\?date=2026-10-29"/);
  assert.match(html, /Mark read/);
  assert.match(html, /Acknowledge/);
  assert.doesNotMatch(html, />Resolve</);
  assert.doesNotMatch(html, /Messages/);
  assert.match(html, /No updates\.|Update/);
  assert.match(html, /Acknowledged\. The condition is still open\.|Resolved Oct 29/);
  assert.match(html, /Ended Oct 29, 10:00 AM/);
  assert.doesNotMatch(html, /Resolved Oct 29, 10:00 AM/);
  const readOnly = renderToStaticMarkup(
    <NotificationCenter
      notice={null}
      actions={{ markRead: noop, acknowledge: noop, snooze: noop, resume: noop }}
      model={{
        status: "ready",
        activeCount: 1,
        browserDeliveryActive: false,
        needsAttention: [item({ read: true, acknowledged: true, actionPath: null, actionLabel: null })],
        messages: [],
        updates: [],
        resolved: [],
        ended: [],
      }}
    />,
  );
  assert.match(readOnly, /Acknowledged\. The condition is still open\./);
  assert.doesNotMatch(readOnly, /Mark read/);
  assert.doesNotMatch(readOnly, />Acknowledge</);
  assert.doesNotMatch(readOnly, /attention-action|Review Coverage/);
  assert.equal(readOnly.includes("dedupeKey"), false);
  assert.equal(readOnly.includes("policyVersion"), false);
});

test("the notification query layer does not read Dashboard or Harbor notices", () => {
  const source = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
  assert.equal(source.includes("dashboard"), false);
  assert.equal(source.includes("SupportStaffNotification"), false);
  assert.equal(source.includes("coverage-expectations"), false);
});
