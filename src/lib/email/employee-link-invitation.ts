import { sendTransactionalEmail, type SendTransactionalEmailResult } from "@/lib/email/send-transactional";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildEmployeeLinkInvitationBodies(input: {
  facilityDisplayName: string;
  inviteUrl: string;
  expiresInDays: number;
}): { subject: string; text: string; html: string } {
  const facility = input.facilityDisplayName.trim() || "a Facility";
  const subject = `Connect your Vssyl account to ${facility}`;
  const text = [
    `A workforce record at ${facility} asked to connect to your existing Vssyl account.`,
    "",
    "Sign in with this email, then open the secure link to accept.",
    `This link expires in ${input.expiresInDays} days:`,
    input.inviteUrl,
    "",
    "If you did not expect this, you can ignore it.",
  ].join("\n");
  const html = `
    <p>A workforce record at <strong>${escapeHtml(facility)}</strong> asked to connect to your existing Vssyl account.</p>
    <p>Sign in with this email, then <a href="${escapeHtml(input.inviteUrl)}">accept the connection</a>.</p>
    <p>This link expires in ${input.expiresInDays} days.</p>
  `.trim();
  return { subject, text, html };
}

export async function sendEmployeeLinkInvitationEmail(input: {
  to: string;
  facilityDisplayName: string;
  inviteUrl: string;
  expiresInDays: number;
}): Promise<SendTransactionalEmailResult> {
  const bodies = buildEmployeeLinkInvitationBodies(input);
  return sendTransactionalEmail({
    to: input.to,
    subject: bodies.subject,
    text: bodies.text,
    html: bodies.html,
    tag: "employee-user-link-invitation",
  });
}
