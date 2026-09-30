import { isEmailConfigured, sendAccountInviteEmail } from "@/lib/email";
import {
  ACCOUNT_INVITE_EXPIRES_DAYS,
  buildAccountInviteUrl,
  issueAccountInviteToken,
} from "@/lib/account-invite/tokens";
import { prisma } from "@/lib/prisma";

/**
 * Mint an invite token and send the branded email when Postmark is configured.
 * DB writes succeed even when mail is off or send fails.
 */
export async function issueAndSendAccountInvite(input: {
  userId: string;
  origin: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      isActive: true,
      passwordHash: true,
      facility: { select: { displayName: true } },
    },
  });
  if (!user?.isActive || !user.email || user.passwordHash) {
    return { sent: false, reason: "not_eligible" };
  }

  const issued = await issueAccountInviteToken(prisma, user.id);
  if (!isEmailConfigured()) {
    console.info("account_invite_email_skipped_not_configured", { userId: user.id });
    return { sent: false, reason: "not_configured" };
  }

  const inviteUrl = buildAccountInviteUrl(input.origin, issued.rawToken);
  const result = await sendAccountInviteEmail({
    to: user.email,
    displayName: user.displayName,
    facilityDisplayName: user.facility.displayName,
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
