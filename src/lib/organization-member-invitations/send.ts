import { isEmailConfigured, sendOrganizationMemberInvitationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { organizationMembershipRoleLabel } from "@/lib/organization-membership";

import {
  ORGANIZATION_MEMBER_INVITE_EXPIRES_DAYS,
  buildOrganizationMemberInvitationUrl,
} from "./tokens";

export async function deliverOrganizationMemberInvitation(input: {
  invitationId: string;
  rawToken: string;
  origin: string;
  inviterName?: string | null;
}): Promise<{ sent: boolean; reason?: string; deliveryStatus: "SENT" | "FAILED" | "NOT_CONFIGURED" }> {
  const invitation = await prisma.organizationMemberInvitation.findUnique({
    where: { id: input.invitationId },
    select: {
      id: true,
      status: true,
      targetEmailNormalized: true,
      intendedRole: true,
      organization: { select: { name: true, displayName: true } },
    },
  });
  if (!invitation || invitation.status !== "PENDING") {
    return { sent: false, reason: "not_eligible", deliveryStatus: "FAILED" };
  }

  const persist = async (status: "SENT" | "FAILED" | "NOT_CONFIGURED", error?: string | null) => {
    await prisma.organizationMemberInvitation.update({
      where: { id: invitation.id },
      data: {
        lastInvitationDeliveredAt: new Date(),
        lastInvitationDeliveryStatus: status,
        lastInvitationDeliveryError: status === "SENT" ? null : (error ?? null)?.slice(0, 500) ?? null,
      },
    });
  };

  if (!isEmailConfigured()) {
    await persist("NOT_CONFIGURED", "Email delivery is not configured in this environment.");
    return { sent: false, reason: "not_configured", deliveryStatus: "NOT_CONFIGURED" };
  }

  const organizationName =
    invitation.organization.displayName?.trim() || invitation.organization.name;
  const result = await sendOrganizationMemberInvitationEmail({
    to: invitation.targetEmailNormalized,
    organizationName,
    roleLabel: organizationMembershipRoleLabel(invitation.intendedRole),
    inviterName: input.inviterName ?? null,
    inviteUrl: buildOrganizationMemberInvitationUrl(input.origin, input.rawToken),
    expiresInDays: ORGANIZATION_MEMBER_INVITE_EXPIRES_DAYS,
  });
  if (result.sent) {
    await persist("SENT");
    return { sent: true, deliveryStatus: "SENT" };
  }
  const error = result.reason === "send_failed" ? result.error ?? "send_failed" : result.reason ?? "send_failed";
  await persist("FAILED", error);
  return { sent: false, reason: result.reason, deliveryStatus: "FAILED" };
}
