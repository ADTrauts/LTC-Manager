export {
  getEmailFromAddress,
  getEmailMessageStream,
  getPostmarkServerToken,
  isEmailConfigured,
} from "@/lib/email/config";
export {
  buildManagerInviteTemplateModel,
  MANAGER_INVITE_TEMPLATE_ALIAS,
  sendManagerInviteEmail,
} from "@/lib/email/manager-invite";
export {
  buildPasswordResetTemplateModel,
  PASSWORD_RESET_TEMPLATE_ALIAS,
  sendPasswordResetEmail,
} from "@/lib/email/password-reset";
export {
  buildSignupEmailVerificationTemplateModel,
  SIGNUP_EMAIL_VERIFICATION_TEMPLATE_ALIAS,
  sendSignupEmailVerification,
} from "@/lib/email/signup-email-verification";
export {
  ACCOUNT_INVITE_TEMPLATE_ALIAS,
  buildAccountInviteTemplateModel,
  sendAccountInviteEmail,
} from "@/lib/email/account-invite";
export {
  buildConsoleTicketReplyTemplateModel,
  CONSOLE_TICKET_REPLY_TEMPLATE_ALIAS,
  sendConsoleTicketReplyEmail,
} from "@/lib/email/console-ticket-reply";
export {
  type EmailHeader,
  resetPostmarkClientForTests,
  sendTemplatedEmail,
  sendTransactionalEmail,
  type SendTemplatedEmailInput,
  type SendTransactionalEmailInput,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";
