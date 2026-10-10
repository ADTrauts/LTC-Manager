import { createHash, randomBytes } from "node:crypto";

export const EMPLOYEE_LINK_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EMPLOYEE_LINK_INVITE_EXPIRES_DAYS = 7;

export function hashEmployeeLinkInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function mintEmployeeLinkInvitationToken(now: Date = new Date()): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashEmployeeLinkInvitationToken(rawToken),
    expiresAt: new Date(now.getTime() + EMPLOYEE_LINK_INVITE_TTL_MS),
  };
}

export function buildEmployeeLinkInvitationUrl(origin: string, rawToken: string): string {
  const url = new URL("/account-link/accept", origin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}
