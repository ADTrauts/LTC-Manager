import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_EXPIRES_MINUTES = 60;

export function hashPasswordResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function mintPasswordResetToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashPasswordResetToken(rawToken),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  };
}

export function buildPasswordResetUrl(origin: string, rawToken: string): string {
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

type Db = Pick<PrismaClient, "passwordResetToken" | "user">;

/** Invalidate unused tokens for the user, then create a fresh one. */
export async function issuePasswordResetToken(
  db: Db,
  userId: string,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const minted = mintPasswordResetToken();
  await db.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await db.passwordResetToken.create({
    data: {
      userId,
      tokenHash: minted.tokenHash,
      expiresAt: minted.expiresAt,
    },
  });
  return { rawToken: minted.rawToken, expiresAt: minted.expiresAt };
}

export async function findValidPasswordResetToken(
  db: Db,
  rawToken: string,
  now = new Date(),
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = hashPasswordResetToken(rawToken);
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  return { id: row.id, userId: row.userId };
}
