import assert from "node:assert/strict";
import test from "node:test";

import { authorizeRoute } from "@/lib/route-registry/authorize";

import {
  getSupportFromAddress,
  getSupportInboundCredentials,
  getSupportReplyToAddress,
  isSupportOwnAddress,
  isSupportReplyRoutingConfigured,
} from "./config";
import { postmarkInboundPayload } from "./fixtures/postmark-inbound";
import {
  htmlToPlainText,
  inboundDisplayBody,
  isAutoSubmitted,
  isPossibleSpam,
  normalizeInboundSubject,
  parseMessageIds,
  parsePostmarkInbound,
  parseTicketMarkers,
  readAttachmentManifest,
  SUPPORT_EMPTY_SUBJECT,
} from "./inbound-email";
import type { SupportInboundResult } from "./inbound-service";
import { checkBasicAuth, handleSupportInboundWebhook } from "./inbound-webhook";
import { describeSupportEvent } from "./timeline";

const CREDENTIALS = { username: "postmark-inbound", password: "s3cret-Pa55word" };
const TOKEN = "0123456789abcdef0123456789abcdef01234567";

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.vssyl.test/api/support/inbound-email", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function captureLogger() {
  const lines: string[] = [];
  const write = (...args: unknown[]) => lines.push(JSON.stringify(args));
  return { lines, logger: { info: write, warn: write, error: write } };
}

const ATTACHED: SupportInboundResult = {
  result: "attached",
  ticketId: "t1",
  ticketNumber: 1001,
  messageId: "m1",
  routing: "reply_token",
  followUpOfTicketNumber: null,
  statusChanged: true,
};

test("parses a Postmark inbound payload into the fields Vssyl stores", () => {
  const payload = postmarkInboundPayload({
    mailboxHash: TOKEN.toUpperCase(),
    rfcMessageId: "abc@mail.example.com",
    inReplyTo: "support.1@vssyl.com",
    references: ["first@mail.example.com", "support.1@vssyl.com"],
  });
  const parsed = parsePostmarkInbound(payload);
  assert.ok(parsed.ok);
  const email = parsed.email;
  assert.equal(email.providerMessageId, payload.MessageID);
  assert.equal(email.fromEmail, "ada.lovelace@example.com");
  assert.equal(email.fromName, "Ada Lovelace");
  assert.deepEqual(email.toEmails, [`support+${TOKEN.toUpperCase()}@reply.vssyl.test`.toLowerCase()]);
  assert.deepEqual(email.ccEmails, ["grace@example.com"]);
  assert.equal(email.replyTo, null);
  assert.ok(email.mailboxHashes.includes(TOKEN));
  assert.equal(email.internetMessageId, "abc@mail.example.com");
  assert.equal(email.inReplyTo, "support.1@vssyl.com");
  assert.deepEqual(email.references, ["first@mail.example.com", "support.1@vssyl.com"]);
  assert.ok(email.headers.some((header) => header.name === "X-Spam-Score"));
  assert.equal(email.autoSubmitted, false);
});

test("attachment manifest keeps metadata and never the file contents", () => {
  const parsed = parsePostmarkInbound(postmarkInboundPayload());
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.email.attachments, [
    { name: "screenshot.png", contentType: "image/png", contentLength: 68, contentId: null },
    { name: "invoice.pdf", contentType: "application/pdf", contentLength: 48, contentId: null },
  ]);
  assert.equal(JSON.stringify(parsed.email).includes("iVBORw0KGgo"), false);
  assert.deepEqual(readAttachmentManifest(parsed.email.attachments), parsed.email.attachments);
  assert.deepEqual(readAttachmentManifest("nope"), []);
});

test("payloads without a MessageID or a sender are rejected", () => {
  const noId = { ...postmarkInboundPayload(), MessageID: "" };
  assert.deepEqual(parsePostmarkInbound(noId), { ok: false, reason: "invalid_payload" });
  assert.deepEqual(parsePostmarkInbound([]), { ok: false, reason: "invalid_payload" });
  const noSender = { ...postmarkInboundPayload(), From: "", FromFull: { Email: "", Name: "" } };
  assert.deepEqual(parsePostmarkInbound(noSender), { ok: false, reason: "missing_sender" });
});

test("optional Postmark fields may be missing", () => {
  const parsed = parsePostmarkInbound({ MessageID: "pm-min", From: "Someone <Someone@Example.com>" });
  assert.ok(parsed.ok);
  assert.equal(parsed.email.fromEmail, "someone@example.com");
  assert.equal(parsed.email.subject, null);
  assert.equal(parsed.email.bodyText, "");
  assert.deepEqual(parsed.email.mailboxHashes, []);
  assert.deepEqual(parsed.email.attachments, []);
  assert.equal(parsed.email.internetMessageId, null);
});

test("header lookup is case-insensitive and message ids lose their brackets", () => {
  const parsed = parsePostmarkInbound(
    postmarkInboundPayload({ extraHeaders: [{ Name: "in-reply-to", Value: "<lower@case.example>" }] }),
  );
  assert.ok(parsed.ok);
  assert.equal(parsed.email.inReplyTo, "lower@case.example");
  assert.deepEqual(parseMessageIds("<a@b> <c@d>\r\n <e@f>"), ["a@b", "c@d", "e@f"]);
  assert.deepEqual(parseMessageIds("bare@id.example"), ["bare@id.example"]);
  assert.deepEqual(parseMessageIds("not an id"), []);
});

test("automatic mail is detected from Auto-Submitted, Precedence, and autoreply headers", () => {
  assert.equal(isAutoSubmitted([{ name: "auto-submitted", value: "auto-replied" }]), true);
  assert.equal(isAutoSubmitted([{ name: "Auto-Submitted", value: "no" }]), false);
  assert.equal(isAutoSubmitted([{ name: "Precedence", value: "bulk" }]), true);
  assert.equal(isAutoSubmitted([{ name: "X-Autoreply", value: "yes" }]), true);
  assert.equal(isAutoSubmitted([{ name: "Subject", value: "hello" }]), false);
  assert.equal(isPossibleSpam([{ name: "X-Spam-Status", value: "Yes, score=7.1" }]), true);
  assert.equal(isPossibleSpam([{ name: "X-Spam-Status", value: "No" }]), false);
});

test("new ticket subjects drop reply prefixes and stale markers but keep the meaning", () => {
  assert.equal(normalizeInboundSubject("RE: Fwd: Re[2]: Cooler logs"), "Cooler logs");
  assert.equal(normalizeInboundSubject("Re: [VSS-1001] Cooler logs"), "Cooler logs");
  assert.equal(normalizeInboundSubject("Reorder supplies"), "Reorder supplies");
  assert.equal(normalizeInboundSubject("   "), SUPPORT_EMPTY_SUBJECT);
  assert.equal(normalizeInboundSubject(null), SUPPORT_EMPTY_SUBJECT);
  assert.equal(normalizeInboundSubject("x".repeat(500)).length, 200);
});

test("ticket markers are parsed from subjects", () => {
  assert.deepEqual(parseTicketMarkers("Re: [VSS-1234] Cooler"), [1234]);
  assert.deepEqual(parseTicketMarkers("[vss-12] and [VSS-12]"), [12]);
  assert.deepEqual(parseTicketMarkers("[VSS-1] [VSS-2]"), [1, 2]);
  assert.deepEqual(parseTicketMarkers("VSS-1234 without brackets"), []);
});

test("unsafe inbound HTML becomes inert plain text", () => {
  const html =
    '<html><head><style>p{}</style><script>alert(1)</script></head><body><p onclick="x()">Hi&nbsp;there</p>' +
    '<img src=x onerror=alert(1)><a href="javascript:alert(1)">link</a><br>&lt;script&gt;bad&lt;/script&gt;</body></html>';
  const text = htmlToPlainText(html);
  assert.equal(text.includes("<"), false);
  assert.equal(text.includes(">"), false);
  assert.equal(text.includes("alert(1)</"), false);
  assert.equal(/onclick|onerror|javascript:/.test(text), false);
  assert.match(text, /Hi there/);
  assert.match(text, /link/);
  assert.equal(htmlToPlainText("<p>unterminated <b"), "unterminated");
});

test("Console shows the stripped reply, then the text body, then text from HTML", () => {
  assert.equal(inboundDisplayBody({ strippedReplyText: "Short", bodyText: "Long", bodyHtml: "<p>H</p>" }), "Short");
  assert.equal(inboundDisplayBody({ strippedReplyText: " ", bodyText: "Long", bodyHtml: "<p>H</p>" }), "Long");
  assert.equal(inboundDisplayBody({ strippedReplyText: null, bodyText: "", bodyHtml: "<p>From <b>HTML</b></p>" }), "From HTML");
});

test("support sender, Reply-To, and own-address detection come from configuration", () => {
  const env = {
    POSTMARK_FROM_EMAIL: "noreply@vssyl.com",
    SUPPORT_FROM_EMAIL: "Vssyl Support <support@vssyl.com>",
    SUPPORT_REPLY_ADDRESS: "support@reply.vssyl.com",
    POSTMARK_INBOUND_WEBHOOK_USERNAME: "u",
    POSTMARK_INBOUND_WEBHOOK_PASSWORD: "p",
  };
  assert.equal(getSupportFromAddress(env), "Vssyl Support <support@vssyl.com>");
  assert.equal(getSupportFromAddress({ POSTMARK_FROM_EMAIL: "noreply@vssyl.com" }), "noreply@vssyl.com");
  assert.equal(getSupportReplyToAddress(TOKEN, env), `support+${TOKEN}@reply.vssyl.com`);
  assert.equal(isSupportReplyRoutingConfigured(env), true);
  assert.equal(getSupportReplyToAddress(TOKEN, { ...env, POSTMARK_INBOUND_WEBHOOK_PASSWORD: "" }), null);
  assert.equal(getSupportReplyToAddress(TOKEN, { ...env, SUPPORT_REPLY_ADDRESS: "" }), null);
  assert.deepEqual(getSupportInboundCredentials(env), { username: "u", password: "p" });
  assert.equal(getSupportInboundCredentials({}), null);

  assert.equal(isSupportOwnAddress("Support@Vssyl.com", env), true);
  assert.equal(isSupportOwnAddress("noreply@vssyl.com", env), true);
  assert.equal(isSupportOwnAddress(`support+${TOKEN}@reply.vssyl.com`, env), true);
  assert.equal(isSupportOwnAddress("andrew@vssyl.com", env), false);
  assert.equal(isSupportOwnAddress("someone@reply.vssyl.com", env), false);
});

test("Basic Auth accepts only the configured credentials", () => {
  assert.equal(checkBasicAuth(basic(CREDENTIALS.username, CREDENTIALS.password), CREDENTIALS), true);
  assert.equal(checkBasicAuth(null, CREDENTIALS), false);
  assert.equal(checkBasicAuth("Bearer abc", CREDENTIALS), false);
  assert.equal(checkBasicAuth(basic(CREDENTIALS.username, "wrong"), CREDENTIALS), false);
  assert.equal(checkBasicAuth(basic("wrong", CREDENTIALS.password), CREDENTIALS), false);
  assert.equal(checkBasicAuth(basic(CREDENTIALS.username, `${CREDENTIALS.password}x`), CREDENTIALS), false);
  assert.equal(checkBasicAuth(`Basic ${Buffer.from("nocolon").toString("base64")}`, CREDENTIALS), false);
  assert.equal(checkBasicAuth(basic("user", "pa:ss"), { username: "user", password: "pa:ss" }), true);
});

test("webhook rejects missing or wrong credentials with 401 and never processes", async () => {
  let calls = 0;
  const deps = {
    credentials: CREDENTIALS,
    process: async () => {
      calls++;
      return ATTACHED;
    },
    logger: captureLogger().logger,
  };
  const body = JSON.stringify(postmarkInboundPayload());
  const missing = await handleSupportInboundWebhook(request(body), deps);
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get("www-authenticate") ?? "", /^Basic /);
  const wrong = await handleSupportInboundWebhook(request(body, { authorization: basic("postmark-inbound", "nope") }), deps);
  assert.equal(wrong.status, 401);
  const facilitySession = await handleSupportInboundWebhook(
    request(body, { cookie: "ltc_session=facility.jwt.token; harbor_session=staff.jwt.token" }),
    deps,
  );
  assert.equal(facilitySession.status, 401);
  assert.equal(calls, 0);
});

test("webhook processes valid credentials without any session and returns 200", async () => {
  const seen: string[] = [];
  const response = await handleSupportInboundWebhook(
    request(JSON.stringify(postmarkInboundPayload({ messageId: "pm-ok" })), {
      authorization: basic(CREDENTIALS.username, CREDENTIALS.password),
    }),
    {
      credentials: CREDENTIALS,
      process: async (email) => {
        seen.push(email.providerMessageId);
        return ATTACHED;
      },
      logger: captureLogger().logger,
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { result: "attached", ticketNumber: "VSS-1001" });
  assert.deepEqual(seen, ["pm-ok"]);
});

test("webhook response codes: duplicate 200, permanent rejections 403, failure 500, unconfigured 503", async () => {
  const auth = { authorization: basic(CREDENTIALS.username, CREDENTIALS.password) };
  const body = JSON.stringify(postmarkInboundPayload());
  const { logger } = captureLogger();
  const run = (raw: string, process: () => Promise<SupportInboundResult>, credentials = CREDENTIALS as typeof CREDENTIALS | null) =>
    handleSupportInboundWebhook(request(raw, auth), { credentials, process, logger });
  const never = async (): Promise<SupportInboundResult> => {
    throw new Error("must not process");
  };

  const duplicate = await run(body, async () => ({ result: "duplicate", ticketId: "t1", ticketNumber: 1001, messageId: "m1" }));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).result, "duplicate");
  assert.equal((await run(body, async () => ({ result: "ignored", reason: "own_address" }))).status, 200);
  const malformed = await run("{not json", never);
  assert.equal(malformed.status, 403);
  assert.equal((await malformed.json()).reason, "malformed_json");
  const noMessageId = await run(JSON.stringify({ From: "a@b.example" }), never);
  assert.equal(noMessageId.status, 403);
  assert.equal((await noMessageId.json()).reason, "invalid_payload");
  const noSender = await run(JSON.stringify({ MessageID: "x", From: "nobody" }), never);
  assert.equal(noSender.status, 403);
  assert.equal((await noSender.json()).reason, "missing_sender");
  const tooLarge = await handleSupportInboundWebhook(
    request(body, { ...auth, "content-length": String(51 * 1024 * 1024) }),
    { credentials: CREDENTIALS, process: never, logger },
  );
  assert.equal(tooLarge.status, 403);
  assert.equal((await tooLarge.json()).reason, "too_large");
  assert.equal((await run(body, never)).status, 500);
  assert.equal((await run(body, never, null)).status, 503);
});

test("webhook logs identifiers only: no secrets, bodies, tokens, or authorization header", async () => {
  const { lines, logger } = captureLogger();
  const payload = postmarkInboundPayload({ mailboxHash: TOKEN, textBody: "SECRET BODY TEXT" });
  const auth = basic(CREDENTIALS.username, CREDENTIALS.password);
  await handleSupportInboundWebhook(request(JSON.stringify(payload), { authorization: auth }), {
    credentials: CREDENTIALS,
    process: async () => ATTACHED,
    logger,
  });
  await handleSupportInboundWebhook(request(JSON.stringify(payload), { authorization: basic("x", "y") }), {
    credentials: CREDENTIALS,
    process: async () => ATTACHED,
    logger,
  });
  await handleSupportInboundWebhook(request(JSON.stringify(payload), { authorization: auth }), {
    credentials: CREDENTIALS,
    process: async () => {
      throw Object.assign(new Error(`db failed for ${TOKEN} SECRET BODY TEXT`), { code: "P1001" });
    },
    logger,
  });
  const output = lines.join("\n");
  assert.ok(output.includes(payload.MessageID));
  assert.ok(output.includes("P1001"));
  for (const secret of [CREDENTIALS.password, auth, TOKEN, "SECRET BODY TEXT", "Ada Lovelace"]) {
    assert.equal(output.includes(secret), false, `log leaked ${secret}`);
  }
});

test("timeline describes email-opened tickets and customer-caused reopening", () => {
  const base = { id: "e", createdAt: new Date(), fromValue: null, toValue: null, actorName: null };
  assert.equal(
    describeSupportEvent({ ...base, type: "CREATED", metadata: { source: "EMAIL" } }),
    "Ticket opened from email",
  );
  assert.equal(
    describeSupportEvent({ ...base, type: "CREATED", metadata: { source: "EMAIL", previousTicketNumber: "VSS-1001" } }),
    "Ticket opened from email (a reply to VSS-1001, which is closed)",
  );
  assert.equal(
    describeSupportEvent({
      ...base,
      type: "STATUS_CHANGED",
      fromValue: "WAITING_ON_CUSTOMER",
      toValue: "OPEN",
      metadata: null,
      causedByMessageId: "m1",
    }),
    "Status changed from Waiting on customer to Open because the customer replied",
  );
  assert.equal(
    describeSupportEvent({
      ...base,
      type: "STATUS_CHANGED",
      fromValue: "OPEN",
      toValue: "WAITING_ON_CUSTOMER",
      metadata: null,
      actorName: "Sam",
      causedByMessageId: "m2",
    }),
    "Status changed from Open to Waiting on customer",
  );
});

test("the inbound webhook is a public route: no Harbor or facility session is consulted", () => {
  assert.equal(authorizeRoute({ pathname: "/api/support/inbound-email", role: null, featureFlags: { todaysWorkEnabled: true } }).outcome, "ALLOW");
  assert.equal(
    authorizeRoute({ pathname: "/api/support/inbound-email", role: "FACILITY_ADMINISTRATOR", featureFlags: { todaysWorkEnabled: true } }).outcome,
    "ALLOW",
  );
});
