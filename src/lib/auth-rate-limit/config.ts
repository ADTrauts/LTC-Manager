import { AuthRateLimitBucketType } from "@prisma/client";

export type AuthRateLimitPolicy = {
  /** Rolling window in which failures accumulate. A failure after the window restarts the count. */
  windowMs: number;
  /** Failures within the window that trigger a lock. */
  threshold: number;
  /** How long the bucket stays locked once the threshold is reached. */
  lockMs: number;
};

const MINUTE = 60 * 1000;

/**
 * Single source of truth for authentication throttling. Route handlers must read from here
 * rather than embedding their own numbers.
 *
 * PIN_CANDIDATE is deliberately the tightest bucket: a 6-digit PIN has a small keyspace, and this
 * bucket is what an attacker hits when retrying one candidate value. PIN_FACILITY is the backstop
 * that catches an attacker rotating candidates to stay under the per-candidate threshold, so it is
 * sized well above what a facility of forgetful staff would produce in one window.
 */
export const AUTH_RATE_LIMIT_POLICIES: Record<AuthRateLimitBucketType, AuthRateLimitPolicy> = {
  [AuthRateLimitBucketType.PASSWORD_ACCOUNT]: {
    windowMs: 15 * MINUTE,
    threshold: 10,
    lockMs: 15 * MINUTE,
  },
  [AuthRateLimitBucketType.PIN_CANDIDATE]: {
    windowMs: 15 * MINUTE,
    threshold: 5,
    lockMs: 30 * MINUTE,
  },
  [AuthRateLimitBucketType.PIN_FACILITY]: {
    windowMs: 15 * MINUTE,
    threshold: 30,
    lockMs: 15 * MINUTE,
  },
};

/** Buckets untouched for this long are eligible for deletion. */
export const AUTH_RATE_LIMIT_RETENTION_MS = 24 * 60 * MINUTE;

/** Upper bound on `Retry-After`, so a long lock does not leak the exact configured duration. */
export const AUTH_RATE_LIMIT_MAX_RETRY_AFTER_SEC = 15 * 60;

export function resolvePolicy(
  bucketType: AuthRateLimitBucketType,
  overrides?: Partial<AuthRateLimitPolicy>,
): AuthRateLimitPolicy {
  return { ...AUTH_RATE_LIMIT_POLICIES[bucketType], ...overrides };
}
