import { createHmac } from "node:crypto";

import { AuthRateLimitBucketType } from "@prisma/client";

/**
 * Bumped when the key derivation changes so old buckets cannot collide with new ones.
 * Old buckets age out through normal cleanup.
 */
const KEY_VERSION = "v1";

/**
 * Bucket keys are keyed hashes rather than the identifiers themselves, so the rate-limit table
 * never holds an email address, a PIN, or anything else that is useful if the table is read.
 * The HMAC secret is server-controlled, so keys cannot be precomputed offline for a candidate
 * PIN even though the PIN keyspace is small.
 */
function bucketKey(bucketType: AuthRateLimitBucketType, parts: readonly string[]): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }
  return createHmac("sha256", secret)
    .update([`auth-rl`, KEY_VERSION, bucketType, ...parts].join("\u0000"))
    .digest("hex");
}

/** Normalized so `User@Example.com ` and `user@example.com` share one bucket. */
export function normalizeAccountIdentifier(email: string): string {
  return email.trim().toLowerCase();
}

export function passwordAccountBucketKey(email: string): string {
  return bucketKey(AuthRateLimitBucketType.PASSWORD_ACCOUNT, [normalizeAccountIdentifier(email)]);
}

export function pinCandidateBucketKey(facilityId: string, pin: string): string {
  return bucketKey(AuthRateLimitBucketType.PIN_CANDIDATE, [facilityId, pin.trim()]);
}

export function pinFacilityBucketKey(facilityId: string): string {
  return bucketKey(AuthRateLimitBucketType.PIN_FACILITY, [facilityId]);
}
