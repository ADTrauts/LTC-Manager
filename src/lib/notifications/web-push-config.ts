/**
 * VAPID configuration for a later Web Push sender.
 *
 * The public key may be given to the signed-in browser. The private key and subject stay on the server.
 * A configured public key does not turn sending on. Only WEB_PUSH_SENDING_ENABLED exactly true may send.
 *
 * Disposable SQL suites may pin sending for one async chain via runWithWebPushSendingEnabled so
 * parallel process.env toggles cannot suppress or enable another suite's deliveries.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const UNCOMPRESSED_P256_LENGTH = 65;

const sendingOverride = new AsyncLocalStorage<boolean>();

export function isWebPushSendingEnabled(): boolean {
  const override = sendingOverride.getStore();
  if (override !== undefined) return override;
  return process.env.WEB_PUSH_SENDING_ENABLED === "true";
}

/** Pin sending on or off for one sync or async chain (tests). Production callers leave this unset. */
export function runWithWebPushSendingEnabled<T>(enabled: boolean, run: () => T): T {
  return sendingOverride.run(enabled, run);
}

/** Presence only. The private key is never returned. */
export function vapidPrivateKeyIsConfigured(): boolean {
  const value = process.env.VAPID_PRIVATE_KEY;
  return typeof value === "string" && value.trim().length > 0;
}

/** Presence only. The subject is never returned to the browser. */
export function vapidSubjectIsConfigured(): boolean {
  const value = process.env.VAPID_SUBJECT;
  return typeof value === "string" && value.trim().length > 0;
}

/** Valid uncompressed P-256 public key, or null when missing or unusable. */
export function readVapidPublicKey(): string | null {
  const raw = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  if (!raw || !isUncompressedP256PublicKey(raw)) return null;
  return raw;
}

function isUncompressedP256PublicKey(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(value);
  } catch {
    return false;
  }
  return bytes.length === UNCOMPRESSED_P256_LENGTH && bytes[0] === 0x04;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const decoded = Buffer.from(padded, "base64");
  return new Uint8Array(decoded);
}
