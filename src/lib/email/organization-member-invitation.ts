import {
  sendTemplatedEmail,
  sendTransactionalEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

export const ORGANIZATION_MEMBER_INVITATION_TEMPLATE_ALIAS = "organization-member-invitation";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildOrganizationMemberInvitationBodies(input: {
  organizationName: string;
  roleLabel: string;
  inviterName: string | null;
  inviteUrl: string;
  expiresInDays: number;
}): { subject: string; text: string; html: string; templateModel: Record<string, string | number> } {
  const organization = input.organizationName.trim() || "your organization";
  const inviter = input.inviterName?.trim();
  const subject = `Join ${organization}`;
  const invitedBy = inviter ? `${inviter} invited you` : "You are invited";
  const text = [
    `${invitedBy} to join ${organization} as ${input.roleLabel}.`,
    "",
    "This invitation is for Organization membership only. It does not grant access to any customer Facility.",
    "",
    `Open this secure link to accept (expires in ${input.expiresInDays} days):`,
    input.inviteUrl,
    "",
    "If you did not expect this email, you can ignore it.",
  ].join("\n");
  const html = `
    <p>${escapeHtml(invitedBy)} to join <strong>${escapeHtml(organization)}</strong> as ${escapeHtml(input.roleLabel)}.</p>
    <p>This invitation is for Organization membership only. It does not grant access to any customer Facility.</p>
    <p><a href="${escapeHtml(input.inviteUrl)}">Accept organization invitation</a></p>
    <p>This link expires in ${input.expiresInDays} days.</p>
  `.trim();
  return {
    subject,
    text,
    html,
    templateModel: {
      organization_name: organization,
      role_label: input.roleLabel,
      inviter_name: inviter || "",
      invite_url: input.inviteUrl,
      expires_in_days: input.expiresInDays,
    },
  };
}

export async function sendOrganizationMemberInvitationEmail(
  input: {
    to: string;
    organizationName: string;
    roleLabel: string;
    inviterName: string | null;
    inviteUrl: string;
    expiresInDays: number;
  },
  options?: Parameters<typeof sendTemplatedEmail>[1],
): Promise<SendTransactionalEmailResult> {
  const bodies = buildOrganizationMemberInvitationBodies(input);
  const templated = await sendTemplatedEmail(
    {
      to: input.to,
      templateAlias: ORGANIZATION_MEMBER_INVITATION_TEMPLATE_ALIAS,
      templateModel: bodies.templateModel,
      tag: "organization-member-invitation",
    },
    options,
  );
  if (templated.sent || templated.reason === "not_configured") return templated;
  return sendTransactionalEmail(
    {
      to: input.to,
      subject: bodies.subject,
      text: bodies.text,
      html: bodies.html,
      tag: "organization-member-invitation",
    },
    options,
  );
}
