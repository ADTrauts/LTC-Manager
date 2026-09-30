import {
  sendTemplatedEmail,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";

export const SIGNUP_EMAIL_VERIFICATION_TEMPLATE_ALIAS = "signup-email-verification";

export function buildSignupEmailVerificationTemplateModel(input: {
  displayName: string;
  verifyUrl: string;
  expiresInHours: number;
}): {
  display_name: string;
  verify_url: string;
  expires_in_hours: number;
} {
  return {
    display_name: input.displayName.trim() || "there",
    verify_url: input.verifyUrl,
    expires_in_hours: input.expiresInHours,
  };
}

export async function sendSignupEmailVerification(
  input: {
    to: string;
    displayName: string;
    verifyUrl: string;
    expiresInHours: number;
  },
  options?: Parameters<typeof sendTemplatedEmail>[1],
): Promise<SendTransactionalEmailResult> {
  return sendTemplatedEmail(
    {
      to: input.to,
      templateAlias: SIGNUP_EMAIL_VERIFICATION_TEMPLATE_ALIAS,
      templateModel: buildSignupEmailVerificationTemplateModel(input),
      tag: "signup-email-verification",
    },
    options,
  );
}
