import { createHash, timingSafeEqual } from "node:crypto";

import type { SupportInboundCredentials } from "./config";
import { type InboundSupportEmail, parsePostmarkInbound, readInboundAttachmentContents } from "./inbound-email";
import type { SupportInboundResult } from "./inbound-service";
import { formatSupportTicketNumber } from "./ticket-number";

/** Postmark caps inbound messages at 35 MB including base64 attachments. */
const MAX_BODY_BYTES = 50 * 1024 * 1024;

type Logger = Pick<Console, "info" | "warn" | "error">;

export type SupportInboundWebhookDeps = {
  credentials: SupportInboundCredentials | null;
  process: (
    email: InboundSupportEmail,
    extras?: { attachmentContents?: Array<string | null> },
  ) => Promise<SupportInboundResult>;
  logger?: Logger;
};

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Compares fixed-length digests so neither length nor content leaks through timing. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function checkBasicAuth(header: string | null, expected: SupportInboundCredentials): boolean {
  const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
  if (!match) return false;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const usernameOk = safeEqual(decoded.slice(0, separator), expected.username);
  const passwordOk = safeEqual(decoded.slice(separator + 1), expected.password);
  return usernameOk && passwordOk;
}

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

/** Postmark retries every non-200 except 403; the message stays visible as an Inbound Error for manual retry. */
function rejectPermanently(reason: string, error: string): Response {
  return json({ error, reason }, 403);
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.name : "unknown";
}

/**
 * 200: processed, duplicate, or deliberately ignored. 401: bad credentials (retried, so mail survives a
 * credential rotation). 403: payload Vssyl will never accept, nothing written, Postmark stops retrying.
 * 5xx: retry later (not configured, database unavailable).
 */
export async function handleSupportInboundWebhook(
  request: Request,
  deps: SupportInboundWebhookDeps,
): Promise<Response> {
  const logger = deps.logger ?? console;
  if (!deps.credentials) {
    logger.error("support.inbound.not_configured");
    return json({ error: "Inbound email is not configured." }, 503);
  }
  if (!checkBasicAuth(request.headers.get("authorization"), deps.credentials)) {
    logger.warn("support.inbound.unauthorized");
    return json({ error: "Unauthorized." }, 401, { "WWW-Authenticate": 'Basic realm="Vssyl inbound email"' });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    logger.warn("support.inbound.rejected", { reason: "too_large" });
    return rejectPermanently("too_large", "Payload too large.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    logger.warn("support.inbound.rejected", { reason: "malformed_json" });
    return rejectPermanently("malformed_json", "Malformed JSON.");
  }

  const parsed = parsePostmarkInbound(raw);
  if (!parsed.ok) {
    logger.warn("support.inbound.rejected", { reason: parsed.reason });
    return rejectPermanently(parsed.reason, "Unacceptable inbound payload.");
  }

  const providerMessageId = parsed.email.providerMessageId;
  const attachmentContents = readInboundAttachmentContents(raw);
  let result: SupportInboundResult;
  try {
    result = await deps.process(parsed.email, { attachmentContents });
  } catch (error) {
    logger.error("support.inbound.failed", { providerMessageId, error: errorCode(error) });
    return json({ error: "Inbound processing failed; retry later." }, 500);
  }

  if (result.result === "ignored") {
    logger.info("support.inbound.ignored", { providerMessageId, reason: result.reason });
    return json({ result: "ignored" }, 200);
  }
  logger.info("support.inbound.processed", {
    providerMessageId,
    result: result.result,
    duplicate: result.result === "duplicate",
    ticketId: result.ticketId,
    ticketNumber: formatSupportTicketNumber(result.ticketNumber),
    messageId: result.messageId,
    ...(result.result === "duplicate"
      ? {}
      : {
          routing: result.routing,
          statusChanged: result.statusChanged,
          followUpOf: result.followUpOfTicketNumber
            ? formatSupportTicketNumber(result.followUpOfTicketNumber)
            : null,
        }),
  });
  return json({ result: result.result, ticketNumber: formatSupportTicketNumber(result.ticketNumber) }, 200);
}
