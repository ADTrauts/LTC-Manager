/**
 * Web Push delivery decisions. No network and no database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyPushEndpointUrl } from "./push-endpoint";
import {
  decidePushOpportunity,
  priorityRiseTriggerKey,
  recipientAddedTriggerKey,
} from "./push-dispatch";
import { browserPushPayload, classifyWebPushStatus } from "./push-sender";
import { isWebPushSendingEnabled } from "./web-push-config";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const now = new Date("2026-10-29T16:00:00.000Z");
const preference = {
  quietEnabled: false,
  quietStartMinute: null,
  quietEndMinute: null,
  updateDigestEnabled: false,
};

test("interruptive delivery uses the N4 decision", () => {
  const quiet = decidePushOpportunity({
    notification: {
      kind: "OPERATIONAL",
      priority: "UPDATE",
      requiresAcknowledgement: false,
      protected: false,
      recipientReasons: ["DEPARTMENT_MANAGER"],
      resolvedAt: null,
      expiresAt: null,
    },
    recipient: { reason: "DEPARTMENT_MANAGER", snoozedUntil: null },
    preference: { ...preference, quietEnabled: true, quietStartMinute: 0, quietEndMinute: 1439 },
    now,
    timeZone: "America/New_York",
  });
  assert.equal(quiet, "quiet");

  const digest = decidePushOpportunity({
    notification: {
      kind: "OPERATIONAL",
      priority: "UPDATE",
      requiresAcknowledgement: false,
      protected: false,
      recipientReasons: ["DEPARTMENT_MANAGER"],
      resolvedAt: null,
      expiresAt: null,
    },
    recipient: { reason: "DEPARTMENT_MANAGER", snoozedUntil: null },
    preference: { ...preference, updateDigestEnabled: true },
    now,
    timeZone: "America/New_York",
  });
  assert.equal(digest, "digest_selected");

  const attention = decidePushOpportunity({
    notification: {
      kind: "OPERATIONAL",
      priority: "NEEDS_ATTENTION",
      requiresAcknowledgement: true,
      protected: false,
      recipientReasons: ["ON_CALL_RESPONDER"],
      resolvedAt: null,
      expiresAt: null,
    },
    recipient: { reason: "ON_CALL_RESPONDER", snoozedUntil: null },
    preference,
    now,
    timeZone: "America/New_York",
  });
  assert.equal(attention, "eligible");

  const snoozed = decidePushOpportunity({
    notification: {
      kind: "OPERATIONAL",
      priority: "NEEDS_ATTENTION",
      requiresAcknowledgement: true,
      protected: false,
      recipientReasons: ["ON_CALL_RESPONDER"],
      resolvedAt: null,
      expiresAt: null,
    },
    recipient: {
      reason: "ON_CALL_RESPONDER",
      snoozedUntil: new Date(now.getTime() + 60_000),
    },
    preference,
    now,
    timeZone: "America/New_York",
  });
  assert.equal(snoozed, "snoozed");

  const protectedUrgent = decidePushOpportunity({
    notification: {
      kind: "OPERATIONAL",
      priority: "URGENT",
      requiresAcknowledgement: true,
      protected: true,
      recipientReasons: ["ON_CALL_RESPONDER"],
      resolvedAt: null,
      expiresAt: null,
    },
    recipient: {
      reason: "ON_CALL_RESPONDER",
      snoozedUntil: new Date(now.getTime() + 60_000),
    },
    preference: { ...preference, quietEnabled: true, quietStartMinute: 0, quietEndMinute: 1439 },
    now,
    timeZone: "America/New_York",
  });
  assert.equal(protectedUrgent, "eligible");

  const critical = decidePushOpportunity({
    notification: {
      kind: "OPERATIONAL",
      priority: "CRITICAL",
      requiresAcknowledgement: true,
      protected: true,
      recipientReasons: ["ON_DUTY_SUPERVISOR"],
      resolvedAt: null,
      expiresAt: null,
    },
    recipient: { reason: "ON_DUTY_SUPERVISOR", snoozedUntil: new Date(now.getTime() + 60_000) },
    preference,
    now,
    timeZone: "America/New_York",
  });
  assert.equal(critical, "eligible");

  const omitted = decidePushOpportunity({
    notification: {
      kind: "OPERATIONAL",
      priority: "UPDATE",
      requiresAcknowledgement: false,
      protected: false,
      recipientReasons: ["ON_CALL_RESPONDER"],
      resolvedAt: null,
      expiresAt: null,
    },
    recipient: { reason: "ON_CALL_RESPONDER", snoozedUntil: null },
    preference: { ...preference, quietEnabled: true, quietStartMinute: 0, quietEndMinute: 1439 },
    now,
    timeZone: "America/New_York",
  });
  assert.equal(omitted, "eligible");

  const provenOffDuty = decidePushOpportunity({
    notification: {
      kind: "OPERATIONAL",
      priority: "UPDATE",
      requiresAcknowledgement: false,
      protected: false,
      recipientReasons: ["ON_CALL_RESPONDER"],
      resolvedAt: null,
      expiresAt: null,
    },
    recipient: { reason: "ON_CALL_RESPONDER", snoozedUntil: null },
    preference: { ...preference, quietEnabled: true, quietStartMinute: 0, quietEndMinute: 1439 },
    now,
    timeZone: "America/New_York",
    currentlyHoldsOperationalResponsibility: false,
  });
  assert.equal(provenOffDuty, "quiet");
  assert.match(source("src/lib/notifications/push-dispatch.ts"), /evaluateDeliveryEligibility/);
});

test("dispatch identity is the subscription and the durable trigger", () => {
  assert.equal(recipientAddedTriggerKey("recipient-a"), "recipient-added:recipient-a");
  assert.notEqual(recipientAddedTriggerKey("recipient-a"), recipientAddedTriggerKey("recipient-b"));
  assert.equal(priorityRiseTriggerKey("recipient-a", "URGENT"), "priority:recipient-a:URGENT");
  assert.notEqual(priorityRiseTriggerKey("recipient-a", "URGENT"), priorityRiseTriggerKey("recipient-a", "CRITICAL"));
  const payload = browserPushPayload("cm1234567890abcd", "recipient-added:recipient-a", 1);
  assert.deepEqual(payload, { attentionId: "cm1234567890abcd", renotify: false });
  assert.equal(browserPushPayload("cm1234567890abcd", "priority:recipient-a:URGENT", 1).renotify, true);
  assert.equal(browserPushPayload("cm1234567890abcd", "priority:recipient-a:URGENT", 2).renotify, false);
  assert.equal(JSON.stringify(payload).includes("Resident"), false);
  assert.deepEqual(Object.keys(payload).sort(), ["attentionId", "renotify"]);
});

test("sending defaults off and unsafe endpoints are refused", () => {
  const previous = process.env.WEB_PUSH_SENDING_ENABLED;
  delete process.env.WEB_PUSH_SENDING_ENABLED;
  try {
    assert.equal(isWebPushSendingEnabled(), false);
    process.env.WEB_PUSH_SENDING_ENABLED = "TRUE";
    assert.equal(isWebPushSendingEnabled(), false);
    process.env.WEB_PUSH_SENDING_ENABLED = "true";
    assert.equal(isWebPushSendingEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.WEB_PUSH_SENDING_ENABLED;
    else process.env.WEB_PUSH_SENDING_ENABLED = previous;
  }
  assert.equal(classifyPushEndpointUrl("https://push.example.test/device"), "ok");
  for (const unsafe of [
    "http://push.example.test/device",
    "https://127.0.0.1/push",
    "https://10.1.1.1/push",
    "https://192.168.0.8/push",
    "https://169.254.169.254/latest",
    "https://localhost/push",
    "https://metadata.google.internal/push",
    "https://push.example.test:8443/device",
    "https://user:secret@push.example.test/device",
    "https://[::1]/push",
    "file:///tmp/push",
  ]) {
    assert.equal(classifyPushEndpointUrl(unsafe), "unsafe", unsafe);
  }
  assert.equal(classifyWebPushStatus(410), "gone");
  assert.equal(classifyWebPushStatus(404), "gone");
  assert.equal(classifyWebPushStatus(401), "configuration");
  assert.equal(classifyWebPushStatus(403), "configuration");
  assert.equal(classifyWebPushStatus(400), "invalid");
  assert.equal(classifyWebPushStatus(413), "invalid");
  assert.equal(classifyWebPushStatus(429), "temporary");
  assert.equal(classifyWebPushStatus(302), "redirect");
  assert.equal(classifyWebPushStatus(500), "temporary");
  assert.equal(classifyWebPushStatus(503), "temporary");
});

test("source transactions do not call the push network", () => {
  const processing = source("src/lib/notifications/processing.ts");
  assert.doesNotMatch(processing, /sendWebPush|deliverQueuedPushDispatches/);
  assert.match(processing, /enqueuePushForNewRecipient/);
  assert.match(processing, /enqueuePriorityRiseIfStrict/);
  const persist = processing.slice(processing.indexOf("async function persistRecipients"));
  assert.match(persist, /enqueuePushForNewRecipient/);
  assert.doesNotMatch(persist, /runPushDeliveryAfterCommit/);
  const opener = processing.slice(
    processing.indexOf("export async function processNotificationOutboxRow"),
    processing.indexOf("export async function processPendingNotificationOutbox"),
  );
  assert.ok(opener.indexOf("runPushDeliveryAfterCommit") > opener.indexOf("$transaction"));
  for (const path of [
    "src/lib/asset-operations/asset-service.ts",
    "src/lib/asset-operations/work-order-service.ts",
    "src/lib/scheduling/coverage-episodes/record.ts",
    "src/lib/operational-cycles/key-point-time-evaluation.ts",
  ]) {
    assert.doesNotMatch(source(path), /sendWebPush|push-delivery/);
  }
  const registry = source("src/lib/scheduled-evaluation/registry.ts");
  assert.match(registry, /notifications\.external-delivery/);
  assert.doesNotMatch(registry, /sendWebPush|deliverQueuedPushDispatches/);
  const worker = source("public/sw.js");
  assert.match(worker, /parsed\.renotify === true/);
  assert.match(worker, /const PUSH_TITLE = "Vssyl"/);
  assert.doesNotMatch(worker, /parsed\.title/);
  const sender = source("src/lib/notifications/push-sender.ts");
  assert.doesNotMatch(sender, /console\./);
  assert.equal(sender.split("await postNotification(").length - 1, 1);
});
