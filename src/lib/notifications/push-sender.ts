/**
 * Web Push protocol sender. VAPID material stays in this module.
 * A successful response means the push service accepted the message.
 * It does not mean the device displayed it.
 */
import webpush from "web-push";

import { resolvePushEndpoint } from "./push-endpoint";
import { readVapidPublicKey } from "./web-push-config";

export type PushSendInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  ttlSeconds: number;
  payload: { attentionId: string; renotify: boolean };
};

export type PushSendResult =
  | { outcome: "accepted" }
  | { outcome: "gone" }
  | { outcome: "temporary"; code: string }
  | { outcome: "invalid"; code: string }
  | { outcome: "configuration" }
  | { outcome: "unsafe" };

export function classifyWebPushStatus(
  status: number,
): "gone" | "configuration" | "redirect" | "temporary" | "invalid" {
  if (status === 404 || status === 410) return "gone";
  if (status === 401 || status === 403) return "configuration";
  if (status === 400 || status === 413) return "invalid";
  if (status >= 300 && status < 400) return "redirect";
  return "temporary";
}

export function browserPushPayload(
  notificationId: string,
  triggerKey: string,
  attemptCount: number,
): { attentionId: string; renotify: boolean } {
  return {
    attentionId: notificationId,
    renotify: triggerKey.startsWith("priority:") && attemptCount === 1,
  };
}

/** Shorter than the delivery claim lease, so a live request is not reclaimed. */
export const WEB_PUSH_REQUEST_TIMEOUT_MS = 5_000;

export async function sendWebPush(input: PushSendInput): Promise<PushSendResult> {
  const material = vapidMaterial();
  if (!material) return { outcome: "configuration" };
  const destination = await resolvePushEndpoint(input.endpoint);
  if (destination === "temporary") return { outcome: "temporary", code: "dns" };
  if (destination !== "ok") return { outcome: "unsafe" };
  try {
    webpush.setVapidDetails(material.subject, material.publicKey, material.privateKey);
    const response = await postNotification(input);
    return classifyAccepted(response.statusCode ?? 201);
  } catch (error) {
    return classifyStatus(statusCode(error));
  }
}

function postNotification(input: PushSendInput) {
  return webpush.sendNotification(
    { endpoint: input.endpoint, keys: { p256dh: input.p256dh, auth: input.auth } },
    JSON.stringify(input.payload),
    { TTL: input.ttlSeconds, urgency: "normal", timeout: WEB_PUSH_REQUEST_TIMEOUT_MS },
  );
}

function classifyAccepted(status: number): PushSendResult {
  if (status >= 300 && status < 400) return { outcome: "unsafe" };
  if (status >= 400) return classifyStatus(status);
  return { outcome: "accepted" };
}

function classifyStatus(status: number | null): PushSendResult {
  if (status == null) return { outcome: "temporary", code: "transport" };
  const kind = classifyWebPushStatus(status);
  if (kind === "gone") return { outcome: "gone" };
  if (kind === "configuration") return { outcome: "configuration" };
  if (kind === "invalid") return { outcome: "invalid", code: "invalid" };
  if (kind === "redirect") return { outcome: "unsafe" };
  return { outcome: "temporary", code: "http" };
}

function vapidMaterial(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = readVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey || privateKey === publicKey) return null;
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null;
  return { subject, publicKey, privateKey };
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : null;
}
