import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

export const ACCOUNT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ACCOUNT_INVITE_EXPIRES_DAYS = 7;

export function hashAccountInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function mintAccountInviteToken(): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashAccountInviteToken(rawToken),
    expiresAt: new Date(Date.now() + ACCOUNT_INVITE_TTL_MS),
  };
}

export function buildAccountInviteUrl(origin: string, rawToken: string): string {
  const url = new URL("/accept-invite", origin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

type Db = Pick<PrismaClient, "accountInviteToken" | "user">;

/** Invalidate unused invites for the user, then create a fresh one. */
export async function issueAccountInviteToken(
  db: Db,
  userId: string,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const minted = mintAccountInviteToken();
  await db.accountInviteToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await db.accountInviteToken.create({
    data: {
      userId,
      tokenHash: minted.tokenHash,
      expiresAt: minted.expiresAt,
    },
  });
  return { rawToken: minted.rawToken, expiresAt: minted.expiresAt };
}

export async function findValidAccountInviteToken(
  db: Db,
  rawToken: string,
  now = new Date(),
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = hashAccountInviteToken(rawToken);
  const row = await db.accountInviteToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  return { id: row.id, userId: row.userId };
}
