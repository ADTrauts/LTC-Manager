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

/** Claim the link and verify its active owner in the same database transaction. */
export async function consumeEmailVerificationToken(
  db: Pick<PrismaClient, "$transaction">,
  rawToken: string,
): Promise<string | null> {
  const tokenHash = hashEmailVerificationToken(rawToken);
  return db.$transaction(async (tx) => {
    // Serialize confirmations for the person, including concurrent use of sibling links.
    const [user] = await tx.$queryRaw<Array<{ id: string; emailVerifiedAt: Date | null }>>`
      SELECT u."id", u."emailVerifiedAt"
      FROM "EmailVerificationToken" t JOIN "User" u ON u."id" = t."userId"
      WHERE t."tokenHash" = ${tokenHash} AND t."usedAt" IS NULL AND u."isActive"
      FOR UPDATE OF u
    `;
    if (!user) return null;

    const now = new Date();
    const claim = await tx.emailVerificationToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return null;

    if (!user.emailVerifiedAt) {
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
    }
    return user.id;
  });
}
