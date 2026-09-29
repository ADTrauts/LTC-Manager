import { sendTransactionalEmail, type SendTransactionalEmailResult } from "@/lib/email/send-transactional";

export function buildManagerInviteEmail(input: {
  facilityDisplayName: string;
  loginUrl: string;
}): { subject: string; text: string; html: string } {
  const facility = input.facilityDisplayName.trim() || "your facility";
  const subject = `You're invited to help set up ${facility} on Vssyl`;
  const text = [
    `You've been added as a manager for ${facility} on Vssyl.`,
    "",
    `Sign in to continue setup: ${input.loginUrl}`,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");
  const html = `
    <p>You've been added as a manager for <strong>${escapeHtml(facility)}</strong> on Vssyl.</p>
    <p><a href="${escapeHtml(input.loginUrl)}">Sign in to continue setup</a></p>
    <p style="color:#666;font-size:13px;">If you weren't expecting this, you can ignore this email.</p>
  `.trim();
  return { subject, text, html };
}

export async function sendManagerInviteEmail(input: {
  to: string;
  facilityDisplayName: string;
  loginUrl: string;
}): Promise<SendTransactionalEmailResult> {
  const content = buildManagerInviteEmail({
    facilityDisplayName: input.facilityDisplayName,
    loginUrl: input.loginUrl,
  });
  return sendTransactionalEmail({
    to: input.to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    tag: "onboarding-manager-invite",
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
