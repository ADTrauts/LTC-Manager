import { createHash, randomBytes } from "node:crypto";

export const ORGANIZATION_MEMBER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ORGANIZATION_MEMBER_INVITE_EXPIRES_DAYS = 7;

export function hashOrganizationMemberInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function mintOrganizationMemberInvitationToken(now: Date = new Date()): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashOrganizationMemberInvitationToken(rawToken),
    expiresAt: new Date(now.getTime() + ORGANIZATION_MEMBER_INVITE_TTL_MS),
  };
}

export function buildOrganizationMemberInvitationUrl(origin: string, rawToken: string): string {
  const url = new URL(
    `/organization/members/invite/${encodeURIComponent(rawToken)}`,
    origin,
  );
  return url.toString();
}
