import { createHash, randomBytes } from "node:crypto";

/**
 * Organization claim invitation tokens follow AccountInviteToken security:
 * cryptographically secure random, SHA-256 hash only in DB, 7-day TTL.
 */
export const ORGANIZATION_CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ORGANIZATION_CLAIM_EXPIRES_DAYS = 7;

export function hashOrganizationClaimToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function mintOrganizationClaimToken(): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashOrganizationClaimToken(rawToken),
    expiresAt: new Date(Date.now() + ORGANIZATION_CLAIM_TTL_MS),
  };
}

export function buildOrganizationClaimUrl(origin: string, rawToken: string): string {
  const url = new URL(`/organization/claim/${encodeURIComponent(rawToken)}`, origin);
  return url.toString();
}
