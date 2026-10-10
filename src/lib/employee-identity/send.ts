import { isEmailConfigured } from "@/lib/email";
import { sendEmployeeLinkInvitationEmail } from "@/lib/email/employee-link-invitation";
import { prisma } from "@/lib/prisma";

import {
  buildEmployeeLinkInvitationUrl,
  employeeLinkInviteExpiresDays,
  issueEmployeeUserLinkInvitation,
} from "./invitations";

export async function issueAndSendEmployeeUserLinkInvitation(input: {
  employeeId: string;
  facilityId: string;
  targetEmail: string;
  intendedRoleKey: Parameters<typeof issueEmployeeUserLinkInvitation>[1]["intendedRoleKey"];
  invitedByUserId: string;
  origin: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const issued = await issueEmployeeUserLinkInvitation(prisma, {
    employeeId: input.employeeId,
    facilityId: input.facilityId,
    targetEmail: input.targetEmail,
    intendedRoleKey: input.intendedRoleKey,
    invitedByUserId: input.invitedByUserId,
  });

  const facility = await prisma.facility.findUnique({
    where: { id: input.facilityId },
    select: { displayName: true },
  });

  if (!isEmailConfigured()) {
    console.info("employee_link_invite_email_skipped_not_configured", {
      employeeId: input.employeeId,
    });
    return { sent: false, reason: "not_configured" };
  }

  const result = await sendEmployeeLinkInvitationEmail({
    to: issued.targetEmail,
    facilityDisplayName: facility?.displayName ?? "your Facility",
    inviteUrl: buildEmployeeLinkInvitationUrl(input.origin, issued.rawToken),
    expiresInDays: employeeLinkInviteExpiresDays(),
  });
  return result.sent ? { sent: true } : { sent: false, reason: result.reason };
}
