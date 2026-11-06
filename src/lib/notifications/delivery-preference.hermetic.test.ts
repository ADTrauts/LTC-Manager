/**
 * Snooze, quiet, and digest eligibility stay on interruption.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { listScheduledEvaluators } from "@/lib/scheduled-evaluation/registry";

import { evaluateDeliveryEligibility } from "./delivery-eligibility";
import { DEFAULT_NOTIFICATION_PREFERENCE } from "./notification-preference";
import { isInsideQuietWindow, localMinuteOfDay } from "./quiet-window";
import { ATTENTION_SNOOZE_MAX_MS, evaluateSnoozeEligibility } from "./snooze";

const now = new Date("2026-10-29T22:30:00.000Z");
const hour = 60 * 60 * 1000;

function attention(priority: "UPDATE" | "NEEDS_ATTENTION" | "URGENT" | "CRITICAL", protectedAttention: boolean, reason: "ON_CALL_RESPONDER" | "ON_DUTY_SUPERVISOR" | "WORK_ORDER_ASSIGNEE") {
  return {
    kind: "OPERATIONAL" as const,
    priority,
    requiresAcknowledgement: priority !== "UPDATE",
    protected: protectedAttention,
    recipientReasons: [reason] as const,
    resolvedAt: null,
    expiresAt: null,
  };
}

test("snooze follows the response policy and a four-hour cap", () => {
  assert.equal(ATTENTION_SNOOZE_MAX_MS, 4 * hour);
  const until = new Date(now.getTime() + hour);
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("NEEDS_ATTENTION", false, "ON_CALL_RESPONDER"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: until,
      currentlyHoldsPrimaryResponsibility: true,
    }),
    "allowed",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("NEEDS_ATTENTION", true, "ON_DUTY_SUPERVISOR"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: until,
    }),
    "protected_not_snoozable",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("URGENT", true, "ON_DUTY_SUPERVISOR"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: until,
    }),
    "protected_not_snoozable",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("CRITICAL", true, "ON_DUTY_SUPERVISOR"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: until,
    }),
    "critical_not_snoozable",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("URGENT", false, "ON_CALL_RESPONDER"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: until,
      currentlyHoldsPrimaryResponsibility: true,
    }),
    "current_responsibility_holder",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("URGENT", false, "ON_CALL_RESPONDER"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: until,
      currentlyHoldsPrimaryResponsibility: false,
    }),
    "allowed",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("UPDATE", false, "ON_DUTY_SUPERVISOR"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: until,
    }),
    "update_not_snoozable",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("NEEDS_ATTENTION", false, "ON_CALL_RESPONDER"),
      resolvedAt: now,
      expiresAt: null,
      now,
      snoozedUntil: until,
    }),
    "thread_closed",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("NEEDS_ATTENTION", false, "ON_CALL_RESPONDER"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: now,
    }),
    "invalid_duration",
  );
  assert.equal(
    evaluateSnoozeEligibility({
      attention: attention("NEEDS_ATTENTION", false, "ON_CALL_RESPONDER"),
      resolvedAt: null,
      expiresAt: null,
      now,
      snoozedUntil: new Date(now.getTime() + ATTENTION_SNOOZE_MAX_MS + 1),
    }),
    "invalid_duration",
  );
});

test("quiet follows facility wall time and does not cross into operational attention", () => {
  const start = 22 * 60;
  const end = 7 * 60;
  assert.equal(isInsideQuietWindow(22 * 60, start, end), true);
  assert.equal(isInsideQuietWindow(6 * 60, start, end), true);
  assert.equal(isInsideQuietWindow(7 * 60, start, end), false);
  assert.equal(isInsideQuietWindow(14 * 60, start, end), false);
  assert.equal(isInsideQuietWindow(start, start, start), false);

  const evening = new Date("2026-10-29T02:30:00.000Z");
  assert.equal(localMinuteOfDay(evening, "America/New_York"), 22 * 60 + 30);
  assert.equal(localMinuteOfDay(evening, "America/Chicago"), 21 * 60 + 30);

  const preference = {
    quietEnabled: true,
    quietStartMinute: start,
    quietEndMinute: end,
    updateDigestEnabled: true,
  };
  const update = attention("UPDATE", false, "ON_DUTY_SUPERVISOR");
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient: { reason: "ON_DUTY_SUPERVISOR", snoozedUntil: null },
      preference,
      now: evening,
      timeZone: "America/New_York",
      mode: "INTERRUPTIVE",
      currentlyHoldsOperationalResponsibility: false,
    }),
    "quiet",
  );
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient: { reason: "ON_DUTY_SUPERVISOR", snoozedUntil: null },
      preference,
      now: evening,
      timeZone: "America/Chicago",
      mode: "INTERRUPTIVE",
      currentlyHoldsOperationalResponsibility: false,
    }),
    "eligible",
  );
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient: { reason: "ON_DUTY_SUPERVISOR", snoozedUntil: null },
      preference,
      now: evening,
      timeZone: "America/New_York",
      mode: "INTERRUPTIVE",
      currentlyHoldsOperationalResponsibility: true,
    }),
    "eligible",
  );
  for (const priority of ["NEEDS_ATTENTION", "URGENT", "CRITICAL"] as const) {
    assert.equal(
      evaluateDeliveryEligibility({
        notification: attention(priority, priority === "CRITICAL", "ON_CALL_RESPONDER"),
        recipient: { reason: "ON_CALL_RESPONDER", snoozedUntil: null },
        preference,
        now: evening,
        timeZone: "America/New_York",
        mode: "INTERRUPTIVE",
      }),
      "eligible",
    );
  }
});

test("digest is an Update opt-in and a missing preference selects nothing", () => {
  assert.equal(DEFAULT_NOTIFICATION_PREFERENCE.quietEnabled, false);
  assert.equal(DEFAULT_NOTIFICATION_PREFERENCE.updateDigestEnabled, false);
  const update = attention("UPDATE", false, "ON_DUTY_SUPERVISOR");
  const selected = { ...DEFAULT_NOTIFICATION_PREFERENCE, updateDigestEnabled: true };
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient: { reason: "ON_DUTY_SUPERVISOR", snoozedUntil: null },
      preference: selected,
      now,
      timeZone: "America/New_York",
      mode: "DIGEST",
    }),
    "eligible",
  );
  assert.equal(
    evaluateDeliveryEligibility({
      notification: update,
      recipient: { reason: "ON_DUTY_SUPERVISOR", snoozedUntil: null },
      preference: DEFAULT_NOTIFICATION_PREFERENCE,
      now,
      timeZone: "America/New_York",
      mode: "DIGEST",
    }),
    "digest_not_selected",
  );
  for (const priority of ["NEEDS_ATTENTION", "URGENT", "CRITICAL"] as const) {
    assert.equal(
      evaluateDeliveryEligibility({
        notification: attention(priority, priority === "CRITICAL", "ON_CALL_RESPONDER"),
        recipient: { reason: "ON_CALL_RESPONDER", snoozedUntil: null },
        preference: selected,
        now,
        timeZone: "America/New_York",
        mode: "DIGEST",
      }),
      "not_digest_eligible",
    );
  }
  const scheduled = readFileSync(new URL("../scheduled-evaluation/types.ts", import.meta.url), "utf8");
  assert.equal(scheduled.includes("notifications.snooze-expiry"), false);
  assert.equal(listScheduledEvaluators().at(-1)?.key, "notifications.external-delivery");
  assert.equal(listScheduledEvaluators().length, 6);
});
