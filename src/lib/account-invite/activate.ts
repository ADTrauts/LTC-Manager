import { Prisma, type PrismaClient } from "@prisma/client";
import { hashAccountInviteToken } from "./tokens";
export class AccountActivationError extends Error {}
/** Activation never resets an existing password. Token + User locks protect
 * check/write from concurrent acceptance, expiry and credential changes. */
export async function activateInvitedAccount(db: PrismaClient, rawToken: string, passwordHash: string) {
  return db.$transaction(async tx => {
    const tokenHash = hashAccountInviteToken(rawToken);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AccountInviteToken" WHERE "tokenHash"=${tokenHash} FOR UPDATE`);
    const token = await tx.accountInviteToken.findUnique({ where: { tokenHash } });
    if (!token || token.usedAt || +token.expiresAt <= Date.now()) throw new AccountActivationError("This invite is invalid, expired or already used.");
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id"=${token.userId} FOR UPDATE`);
    const user = await tx.user.findUnique({ where: { id: token.userId }, select: { id: true, isActive: true, passwordHash: true } });
    if (!user?.isActive || user.passwordHash || +token.expiresAt <= Date.now()) throw new AccountActivationError("This account is already activated or unavailable. Use normal sign-in or password recovery.");
    const now = new Date();
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, emailVerifiedAt: now, lastLoginAt: now } });
    await tx.accountInviteToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    return { userId: user.id };
  },{ isolationLevel: "Serializable", timeout: 20_000 });
}
