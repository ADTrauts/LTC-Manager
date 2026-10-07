import {
  sendTemplatedEmail,
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
  return sendTemplatedEmail(
    {
      to: input.to,
      templateAlias: ORGANIZATION_CLAIM_TEMPLATE_ALIAS,
      templateModel: buildOrganizationClaimTemplateModel(input),
      tag: "organization-claim",
    },
    options,
  );
}
