import {
  sendTemplatedEmail,
  sendTransactionalEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

export const ORGANIZATION_CLAIM_TEMPLATE_ALIAS = "organization-claim";

export function buildOrganizationClaimTemplateModel(input: {
  contactName: string | null;
  organizationName: string;
  claimUrl: string;
  expiresInDays: number;
}): {
  contact_name: string;
  organization_name: string;
  claim_url: string;
  expires_in_days: number;
} {
  return {
    contact_name: input.contactName?.trim() || "there",
    organization_name: input.organizationName.trim() || "your organization",
    claim_url: input.claimUrl,
    expires_in_days: input.expiresInDays,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildOrganizationClaimTransactionalBodies(input: {
  contactName: string | null;
  organizationName: string;
  claimUrl: string;
  expiresInDays: number;
}): { subject: string; text: string; html: string } {
  const contact = input.contactName?.trim() || "there";
  const organization = input.organizationName.trim() || "your organization";
  const subject = `Claim administration for ${organization}`;
  const text = [
    `Hello ${contact},`,
    "",
    `Harbor approved your invitation to become the Organization Administrator for ${organization}.`,
    "",
    `Open this secure link to accept (expires in ${input.expiresInDays} days):`,
    input.claimUrl,
    "",
    "This invitation grants Organization administration only. It does not grant access to any customer Facility.",
    "",
    "If you did not expect this email, you can ignore it.",
  ].join("\n");
  const html = `
    <p>Hello ${escapeHtml(contact)},</p>
    <p>Harbor approved your invitation to become the Organization Administrator for <strong>${escapeHtml(organization)}</strong>.</p>
    <p><a href="${escapeHtml(input.claimUrl)}">Accept organization claim</a></p>
    <p>This link expires in ${input.expiresInDays} days.</p>
    <p>This invitation grants Organization administration only. It does not grant access to any customer Facility.</p>
    <p>If you did not expect this email, you can ignore it.</p>
  `.trim();
  return { subject, text, html };
}

/**
 * Prefer Postmark template when present; fall back to transactional HTML/text so
 * Harbor approval is never stranded solely because a template alias is missing.
 */
export async function sendOrganizationClaimEmail(
  input: {
    to: string;
    contactName: string | null;
    organizationName: string;
    claimUrl: string;
    expiresInDays: number;
  },
  options?: Parameters<typeof sendTemplatedEmail>[1],
): Promise<SendTransactionalEmailResult> {
  const templated = await sendTemplatedEmail(
    {
      to: input.to,
      templateAlias: ORGANIZATION_CLAIM_TEMPLATE_ALIAS,
      templateModel: buildOrganizationClaimTemplateModel(input),
      tag: "organization-claim",
    },
    options,
  );
  if (templated.sent || templated.reason === "not_configured") {
    return templated;
  }

  // Template missing / rejected — deliver via generic transactional path.
  const bodies = buildOrganizationClaimTransactionalBodies(input);
  return sendTransactionalEmail(
    {
      to: input.to,
      subject: bodies.subject,
      text: bodies.text,
      html: bodies.html,
      tag: "organization-claim",
    },
    options,
  );
}
