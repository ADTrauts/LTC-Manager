/**
 * In-memory PIN attempt limits (per running Node process).
 * For multi-instance production, replace with Redis or similar.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const LOCK_MS = 30 * 60 * 1000;

type Bucket = {
  fails: number;
  windowStart: number;
  lockedUntil?: number;
};

const buckets = new Map<string, Bucket>();

function key(facilityId: string, clientKey: string) {
  return `${facilityId}:${clientKey}`;
}

export function checkPinRateLimit(
  facilityId: string,
  clientKey: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const k = key(facilityId, clientKey);
  const now = Date.now();
  const b = buckets.get(k);
  if (b?.lockedUntil !== undefined && b.lockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  return { ok: true };
}

export function registerPinFailure(facilityId: string, clientKey: string): void {
  const k = key(facilityId, clientKey);
  const now = Date.now();
  let b = buckets.get(k);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { fails: 0, windowStart: now };
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) {
    b.lockedUntil = now + LOCK_MS;
    b.fails = 0;
    b.windowStart = now;
  }
  buckets.set(k, b);
}

export function registerPinSuccess(facilityId: string, clientKey: string): void {
  buckets.delete(key(facilityId, clientKey));
}
