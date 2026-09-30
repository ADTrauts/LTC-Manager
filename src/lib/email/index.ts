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
  resetPostmarkClientForTests,
  sendTemplatedEmail,
  sendTransactionalEmail,
  type SendTemplatedEmailInput,
  type SendTransactionalEmailInput,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";
