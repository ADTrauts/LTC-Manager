import assert from "node:assert/strict";
import test from "node:test";

import { authorizeRoute } from "@/lib/route-registry/authorize";

import { getSupportOutboundWebhookCredentials } from "./config";
import {
  isPermanentSupportBounce,
  parseSupportDeliveryEvent,
  type ApplySupportDeliveryResult,
  type ParsedSupportDeliveryEvent,
} from "./delivery-events";
import { latestOutboundDeliveryWarning, presentOutboundDelivery, describeSupportBounce } from "./delivery-presentation";
import { handleSupportDeliveryWebhook } from "./delivery-webhook";
import {
  postmarkBouncePayload,
  postmarkDeliveryPayload,
  postmarkSpamComplaintPayload,
} from "./fixtures/postmark-delivery";

const CREDENTIALS = { username: "postmark-outbound", password: "outb0und-Pa55" };

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.vssyl.test/api/support/email-events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function captureLogger() {
  const lines: Array<{ level: string; args: unknown[] }> = [];
  const logger = {
    info: (...args: unknown[]) => lines.push({ level: "info", args }),
    warn: (...args: unknown[]) => lines.push({ level: "warn", args }),
    error: (...args: unknown[]) => lines.push({ level: "error", args }),
  };
  return { lines, logger };
}

test("outbound webhook credentials are distinct from inbound and require both values", () => {
  assert.equal(getSupportOutboundWebhookCredentials({}), null);
  assert.equal(getSupportOutboundWebhookCredentials({ POSTMARK_OUTBOUND_WEBHOOK_USERNAME: "u" }), null);
  assert.deepEqual(
    getSupportOutboundWebhookCredentials({
      POSTMARK_OUTBOUND_WEBHOOK_USERNAME: "u",
      POSTMARK_OUTBOUND_WEBHOOK_PASSWORD: "p",
      POSTMARK_INBOUND_WEBHOOK_USERNAME: "in",
      POSTMARK_INBOUND_WEBHOOK_PASSWORD: "in-pass",
    }),
    { username: "u", password: "p" },
  );
});

test("delivery / bounce / complaint payloads parse; other RecordTypes are ignored", () => {
  const delivery = parseSupportDeliveryEvent(postmarkDeliveryPayload({ messageId: "pm-d" }));
  assert.ok(delivery.ok);
  assert.equal(delivery.event.kind, "Delivery");
  assert.equal(delivery.event.providerMessageId, "pm-d");

  const bounce = parseSupportDeliveryEvent(postmarkBouncePayload({ messageId: "pm-b", type: "SoftBounce", typeCode: 4096 }));
  assert.ok(bounce.ok && bounce.event.kind === "Bounce");
  assert.equal(bounce.event.bounceType, "SoftBounce");
  assert.equal(bounce.event.bounceCode, "4096");
  assert.equal(isPermanentSupportBounce(bounce.event), false);

  const hard = parseSupportDeliveryEvent(postmarkBouncePayload());
  assert.ok(hard.ok && hard.event.kind === "Bounce");
  assert.equal(isPermanentSupportBounce(hard.event), true);

  const complaint = parseSupportDeliveryEvent(postmarkSpamComplaintPayload({ messageId: "pm-c" }));
  assert.ok(complaint.ok);
  assert.equal(complaint.event.kind, "SpamComplaint");

  assert.equal(parseSupportDeliveryEvent({ RecordType: "Open", MessageID: "x" }).ok, false);
  assert.equal(parseSupportDeliveryEvent({ RecordType: "Delivery" }).ok, false);
  assert.equal(parseSupportDeliveryEvent("nope").ok, false);
});

test("delivery webhook: matching MessageID, unauthorized, malformed, unknown, ignored type", async () => {
  const applied: ParsedSupportDeliveryEvent[] = [];
  const { logger, lines } = captureLogger();
  const apply = async (event: ParsedSupportDeliveryEvent): Promise<ApplySupportDeliveryResult> => {
    applied.push(event);
    if (event.providerMessageId === "unknown-pm") return { result: "unknown" };
    return { result: "applied", messageId: "m1", ticketId: "t1", deliveryStatus: "DELIVERED" };
  };
  const auth = { authorization: basic(CREDENTIALS.username, CREDENTIALS.password) };

  const ok = await handleSupportDeliveryWebhook(request(JSON.stringify(postmarkDeliveryPayload({ messageId: "pm-1" })), auth), {
    credentials: CREDENTIALS,
    apply,
    logger,
  });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).result, "applied");
  assert.equal(applied[0]?.providerMessageId, "pm-1");

  const unknown = await handleSupportDeliveryWebhook(
    request(JSON.stringify(postmarkDeliveryPayload({ messageId: "unknown-pm" })), auth),
    { credentials: CREDENTIALS, apply, logger },
  );
  assert.equal(unknown.status, 200);
  assert.equal((await unknown.json()).result, "unknown");

  const ignored = await handleSupportDeliveryWebhook(
    request(JSON.stringify({ RecordType: "Open", MessageID: "x" }), auth),
    { credentials: CREDENTIALS, apply, logger },
  );
  assert.equal(ignored.status, 200);
  assert.equal((await ignored.json()).result, "ignored");

  const missing = await handleSupportDeliveryWebhook(request(JSON.stringify(postmarkDeliveryPayload())), {
    credentials: CREDENTIALS,
    apply,
    logger,
  });
  assert.equal(missing.status, 401);
  const wrong = await handleSupportDeliveryWebhook(
    request(JSON.stringify(postmarkDeliveryPayload()), { authorization: basic(CREDENTIALS.username, "nope") }),
    { credentials: CREDENTIALS, apply, logger },
  );
  assert.equal(wrong.status, 401);

  const malformed = await handleSupportDeliveryWebhook(request("{not json", auth), {
    credentials: CREDENTIALS,
    apply,
    logger,
  });
  assert.equal(malformed.status, 403);

  const failing = await handleSupportDeliveryWebhook(request(JSON.stringify(postmarkDeliveryPayload()), auth), {
    credentials: CREDENTIALS,
    apply: async () => {
      throw new Error("db down");
    },
    logger,
  });
  assert.equal(failing.status, 500);
  assert.equal((await handleSupportDeliveryWebhook(request("{}", auth), { credentials: null, apply, logger })).status, 503);

  const dumped = JSON.stringify(lines);
  assert.doesNotMatch(dumped, /outb0und-Pa55/);
  assert.doesNotMatch(dumped, /Authorization/i);
});

test("Console delivery copy distinguishes sent from delivered and surfaces problems", () => {
  const format = (value: Date) =>
    value.toLocaleString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
  const sentAt = new Date("2026-10-03T14:42:00Z");
  const delivered = presentOutboundDelivery(
    { deliveryStatus: "DELIVERED", sentAt, deliveredAt: sentAt, createdAt: sentAt },
    format,
  );
  assert.match(delivered.sentText ?? "", /Sent /);
  assert.match(delivered.outcomeText ?? "", /Delivered /);
  assert.equal(delivered.tone, "ok");

  const sent = presentOutboundDelivery(
    { deliveryStatus: "SENT", sentAt, deliveredAt: null, createdAt: sentAt },
    format,
  );
  assert.ok(sent.sentText);
  assert.equal(sent.outcomeText, null);

  const bounced = presentOutboundDelivery(
    { deliveryStatus: "BOUNCED", sentAt, deliveredAt: null, createdAt: sentAt, bounceType: "HardBounce" },
    format,
  );
  assert.equal(bounced.outcomeText, "Delivery failed");
  assert.equal(bounced.detail, "Mailbox does not exist");
  assert.equal(bounced.tone, "problem");
  assert.equal(describeSupportBounce({ bounceType: "Transient" }), "Temporary delivery problem");

  const at = new Date("2026-10-03T15:00:00Z");
  assert.equal(
    latestOutboundDeliveryWarning([
      { kind: "OUTBOUND", deliveryStatus: "DELIVERED", createdAt: new Date("2026-10-03T14:00:00Z") },
      { kind: "OUTBOUND", deliveryStatus: "BOUNCED", createdAt: at },
    ]),
    "Customer may not have received the latest reply.",
  );
  assert.equal(
    latestOutboundDeliveryWarning([{ kind: "OUTBOUND", deliveryStatus: "FAILED", createdAt: at }]),
    "Email delivery failed for this customer.",
  );
  assert.match(
    latestOutboundDeliveryWarning([{ kind: "OUTBOUND", deliveryStatus: "SPAM_COMPLAINT", createdAt: at }]) ?? "",
    /spam/i,
  );
  assert.equal(
    latestOutboundDeliveryWarning([{ kind: "OUTBOUND", deliveryStatus: "DELIVERED", createdAt: at }]),
    null,
  );
});

test("the outbound delivery webhook is a public route: no Harbor or facility session is consulted", () => {
  assert.equal(
    authorizeRoute({ pathname: "/api/support/email-events", role: null, featureFlags: { todaysWorkEnabled: true } }).outcome,
    "ALLOW",
  );
  assert.equal(
    authorizeRoute({
      pathname: "/api/support/email-events",
      role: "FACILITY_ADMINISTRATOR",
      featureFlags: { todaysWorkEnabled: true },
    }).outcome,
    "ALLOW",
  );
  assert.equal(
    authorizeRoute({
      pathname: "/api/console/support-attachments/x",
      role: "FACILITY_ADMINISTRATOR",
      featureFlags: { todaysWorkEnabled: true },
    }).outcome,
    "DENY",
  );
});
