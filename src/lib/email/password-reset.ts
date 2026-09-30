import {
  sendTemplatedEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

export const PASSWORD_RESET_TEMPLATE_ALIAS = "password-reset";

export function buildPasswordResetTemplateModel(input: {
  displayName: string;
  resetUrl: string;
  expiresInMinutes: number;
}): {
  display_name: string;
  reset_url: string;
  expires_in_minutes: number;
} {
  return {
    display_name: input.displayName.trim() || "there",
    reset_url: input.resetUrl,
    expires_in_minutes: input.expiresInMinutes,
  };
}

export async function sendPasswordResetEmail(
  input: {
    to: string;
    displayName: string;
    resetUrl: string;
    expiresInMinutes: number;
  },
  options?: Parameters<typeof sendTemplatedEmail>[1],
): Promise<SendTransactionalEmailResult> {
  return sendTemplatedEmail(
    {
      to: input.to,
      templateAlias: PASSWORD_RESET_TEMPLATE_ALIAS,
      templateModel: buildPasswordResetTemplateModel(input),
      tag: "password-reset",
    },
    options,
  );
}
