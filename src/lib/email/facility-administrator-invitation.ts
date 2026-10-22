import { sendTransactionalEmail, type SendTransactionalEmailResult } from "@/lib/email/send-transactional";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildFacilityAdministratorInvitationBodies(input: {
  facilityDisplayName: string;
  invitedByName: string;
  kind: "TRANSFER" | "RECOVERY";
  reviewUrl: string;
  expiresInDays: number;
}): { subject: string; text: string; html: string } {
  const facility = input.facilityDisplayName.trim() || "your facility";
  const inviter = input.invitedByName.trim() || "Someone";
  const subject = `You're invited to be Facility Administrator of ${facility}`;
  const reason =
    input.kind === "TRANSFER"
      ? `${inviter}, the current Facility Administrator of ${facility}, asked you to take over the role.`
      : `${inviter}, an admin of ${facility}'s organization, asked you to become its Facility Administrator.`;
  const text = [
    reason,
    "",
    "Nothing changes until you accept. Sign in, then review the invitation:",
    input.reviewUrl,
    "",
    `The invitation expires in ${input.expiresInDays} days.`,
  ].join("\n");
  const html = `
    <p>${escapeHtml(reason)}</p>
    <p>Nothing changes until you accept. Sign in, then <a href="${escapeHtml(input.reviewUrl)}">review the invitation</a>.</p>
    <p>The invitation expires in ${input.expiresInDays} days.</p>
  `.trim();
  return { subject, text, html };
}

export async function sendFacilityAdministratorInvitationEmail(
  input: { to: string } & Parameters<typeof buildFacilityAdministratorInvitationBodies>[0],
): Promise<SendTransactionalEmailResult> {
  const bodies = buildFacilityAdministratorInvitationBodies(input);
  return sendTransactionalEmail({
    to: input.to,
    subject: bodies.subject,
    text: bodies.text,
    html: bodies.html,
    tag: "facility-administrator-invitation",
  });
}
