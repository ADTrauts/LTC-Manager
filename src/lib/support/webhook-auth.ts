import { createHash, timingSafeEqual } from "node:crypto";

export type SupportWebhookCredentials = { username: string; password: string };

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Compares fixed-length digests so neither length nor content leaks through timing. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function checkBasicAuth(header: string | null, expected: SupportWebhookCredentials): boolean {
  const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
  if (!match) return false;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const usernameOk = safeEqual(decoded.slice(0, separator), expected.username);
  const passwordOk = safeEqual(decoded.slice(separator + 1), expected.password);
  return usernameOk && passwordOk;
}
