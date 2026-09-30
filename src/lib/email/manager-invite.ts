import {
  sendTemplatedEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

export const MANAGER_INVITE_TEMPLATE_ALIAS = "onboarding-manager-invite";

export function buildManagerInviteTemplateModel(input: {
  facilityDisplayName: string;
  loginUrl: string;
}): { facility_name: string; login_url: string } {
  return {
    facility_name: input.facilityDisplayName.trim() || "your facility",
    login_url: input.loginUrl,
  };
}

export async function sendManagerInviteEmail(
  input: {
    to: string;
    facilityDisplayName: string;
    loginUrl: string;
  },
  options?: Parameters<typeof sendTemplatedEmail>[1],
): Promise<SendTransactionalEmailResult> {
  const model = buildManagerInviteTemplateModel({
    facilityDisplayName: input.facilityDisplayName,
    loginUrl: input.loginUrl,
  });
  return sendTemplatedEmail(
    {
      to: input.to,
      templateAlias: MANAGER_INVITE_TEMPLATE_ALIAS,
      templateModel: model,
      tag: "onboarding-manager-invite",
    },
    options,
  );
}
