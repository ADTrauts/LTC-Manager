import {
  sendTemplatedEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

export const ACCOUNT_INVITE_TEMPLATE_ALIAS = "account-invite";

export function buildAccountInviteTemplateModel(input: {
  displayName: string;
  facilityDisplayName: string;
  inviteUrl: string;
  expiresInDays: number;
}): {
  display_name: string;
  facility_name: string;
  invite_url: string;
  expires_in_days: number;
} {
  return {
    display_name: input.displayName.trim() || "there",
    facility_name: input.facilityDisplayName.trim() || "your facility",
    invite_url: input.inviteUrl,
    expires_in_days: input.expiresInDays,
  };
}

export async function sendAccountInviteEmail(
  input: {
    to: string;
    displayName: string;
    facilityDisplayName: string;
    inviteUrl: string;
    expiresInDays: number;
  },
  options?: Parameters<typeof sendTemplatedEmail>[1],
): Promise<SendTransactionalEmailResult> {
  return sendTemplatedEmail(
    {
      to: input.to,
      templateAlias: ACCOUNT_INVITE_TEMPLATE_ALIAS,
      templateModel: buildAccountInviteTemplateModel(input),
      tag: "account-invite",
    },
    options,
  );
}
