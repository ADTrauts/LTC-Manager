import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_EXPIRES_HOURS = 24;

export function hashEmailVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function mintEmailVerificationToken(): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashEmailVerificationToken(rawToken),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  };
}

export function buildEmailVerificationUrl(origin: string, rawToken: string): string {
  const url = new URL("/verify-email", origin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

type Db = Pick<PrismaClient, "emailVerificationToken" | "user">;

/** Invalidate unused tokens for the user, then create a fresh one. */
export async function issueEmailVerificationToken(
  db: Db,
  userId: string,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const minted = mintEmailVerificationToken();
  await db.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await db.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: minted.tokenHash,
      expiresAt: minted.expiresAt,
    },
  });
  return { rawToken: minted.rawToken, expiresAt: minted.expiresAt };
}

export async function findValidEmailVerificationToken(
  db: Db,
  rawToken: string,
  now = new Date(),
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = hashEmailVerificationToken(rawToken);
  const row = await db.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  return { id: row.id, userId: row.userId };
}

export async function markEmailVerified(
  db: Db,
  input: { userId: string; tokenId: string },
  now = new Date(),
): Promise<void> {
  await db.emailVerificationToken.update({
    where: { id: input.tokenId },
    data: { usedAt: now },
  });
  await db.user.update({
    where: { id: input.userId },
    data: { emailVerifiedAt: now },
  });
  await db.emailVerificationToken.updateMany({
    where: { userId: input.userId, usedAt: null },
    data: { usedAt: now },
  });
}
