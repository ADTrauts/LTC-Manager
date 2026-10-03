import type { SupportInboundCredentials } from "./config";
import {
  parseSupportDeliveryEvent,
  type ApplySupportDeliveryResult,
  type ParsedSupportDeliveryEvent,
} from "./delivery-events";
import { checkBasicAuth } from "./webhook-auth";

/** Outbound webhooks are small JSON; keep well under inbound's 50 MB cap. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

type Logger = Pick<Console, "info" | "warn" | "error">;

export type SupportDeliveryWebhookDeps = {
  credentials: SupportInboundCredentials | null;
  apply: (event: ParsedSupportDeliveryEvent) => Promise<ApplySupportDeliveryResult>;
  logger?: Logger;
};

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function rejectPermanently(reason: string, error: string): Response {
  return json({ error, reason }, 403);
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.name : "unknown";
}

/**
 * Postmark outbound webhooks (Delivery, Bounce, SpamComplaint) retry 5xx / 408 / 429 only.
 * Other 4xx, including 401 and 403, are permanent and are not retried.
 * 200: applied, duplicate, unknown MessageID, or ignored RecordType.
 * 401: bad credentials (permanent for outbound — inbound 401 is different).
 * 403: payload we will never accept.
 * 5xx: retry later.
 */
export async function handleSupportDeliveryWebhook(
  request: Request,
  deps: SupportDeliveryWebhookDeps,
): Promise<Response> {
  const logger = deps.logger ?? console;
  if (!deps.credentials) {
    logger.error("support.delivery.not_configured");
    return json({ error: "Outbound email webhooks are not configured." }, 503);
  }
  if (!checkBasicAuth(request.headers.get("authorization"), deps.credentials)) {
    logger.warn("support.delivery.unauthorized");
    return json({ error: "Unauthorized." }, 401, { "WWW-Authenticate": 'Basic realm="Vssyl outbound email"' });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    logger.warn("support.delivery.rejected", { reason: "too_large" });
    return rejectPermanently("too_large", "Payload too large.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    logger.warn("support.delivery.rejected", { reason: "malformed_json" });
    return rejectPermanently("malformed_json", "Malformed JSON.");
  }

  const parsed = parseSupportDeliveryEvent(raw);
  if (!parsed.ok && parsed.reason === "malformed") {
    logger.warn("support.delivery.rejected", { reason: "malformed" });
    return rejectPermanently("malformed", "Unacceptable delivery payload.");
  }
  if (!parsed.ok) {
    logger.info("support.delivery.ignored", { reason: parsed.reason });
    return json({ result: "ignored" }, 200);
  }

  let result;
  try {
    result = await deps.apply(parsed.event);
  } catch (error) {
    logger.error("support.delivery.failed", {
      providerMessageId: parsed.event.providerMessageId,
      kind: parsed.event.kind,
      error: errorCode(error),
    });
    return json({ error: "Delivery event processing failed; retry later." }, 500);
  }

  if (result.result === "unknown") {
    logger.info("support.delivery.unknown", {
      providerMessageId: parsed.event.providerMessageId,
      kind: parsed.event.kind,
    });
    return json({ result: "unknown" }, 200);
  }

  logger.info("support.delivery.processed", {
    providerMessageId: parsed.event.providerMessageId,
    kind: parsed.event.kind,
    result: result.result,
    messageId: result.messageId,
    ticketId: result.ticketId,
    deliveryStatus: result.deliveryStatus,
  });
  return json({ result: result.result }, 200);
}
