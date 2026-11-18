import type { Prisma } from "@prisma/client";
import { isEmailConfigured, sendAccountInviteEmail } from "@/lib/email";
import {
  ACCOUNT_INVITE_EXPIRES_DAYS,
  buildAccountInviteUrl,
  issueAccountInviteToken,
} from "@/lib/account-invite/tokens";
import { prisma } from "@/lib/prisma";

/** Prepare the account invite in the caller's transaction. The caller can bind its own authority before rotation. */
export async function prepareAccountInvite(tx: Prisma.TransactionClient, userId: string, authorize?: () => Promise<boolean>) {
  // Use the same token → user order as account activation.
  await tx.$queryRaw`SELECT "id" FROM "AccountInviteToken" WHERE "userId" = ${userId} AND "usedAt" IS NULL ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.user.findFirst({
    where: { id: userId, isActive: true, passwordHash: null },
    select: {
      id: true,
      email: true,
      displayName: true,
      facility: { select: { displayName: true } },
    },
  });
  if (!user?.email || !user.facility || (authorize && !(await authorize()))) return null;
  const issued = await issueAccountInviteToken(tx, user.id);
  return { user, facilityName: user.facility.displayName, rawToken: issued.rawToken };
}

/** Deliver only after the invite transaction commits. The token never leaves the account-invite service path. */
export async function deliverAccountInvite(prepared: NonNullable<Awaited<ReturnType<typeof prepareAccountInvite>>>, origin: string): Promise<{ sent: boolean; reason?: string }> {
  const { user, facilityName, rawToken } = prepared;
  if (!isEmailConfigured()) {
    console.info("account_invite_email_skipped_not_configured", { userId: user.id });
    return { sent: false, reason: "not_configured" };
  }

  const inviteUrl = buildAccountInviteUrl(origin, rawToken);
  const result = await sendAccountInviteEmail({
    to: user.email,
    displayName: user.displayName,
    facilityDisplayName: facilityName,
    inviteUrl,
    expiresInDays: ACCOUNT_INVITE_EXPIRES_DAYS,
  });
  if (result.sent) {
    console.info("account_invite_email_sent", { userId: user.id, messageId: result.messageId });
    return { sent: true };
  }
  if (result.reason === "send_failed") {
    console.info("account_invite_email_failed", { userId: user.id, error: result.error });
  }
  return { sent: false, reason: result.reason };
}

/** Prepare atomically, then use the existing branded email delivery when configured. */
export async function issueAndSendAccountInvite(input: { userId: string; origin: string }): Promise<{ sent: boolean; reason?: string }> {
  const prepared = await prisma.$transaction((tx) => prepareAccountInvite(tx, input.userId));
  return prepared ? deliverAccountInvite(prepared, input.origin) : { sent: false, reason: "not_eligible" };
}
