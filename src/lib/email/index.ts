export {
  getEmailFromAddress,
  getEmailMessageStream,
  getPostmarkServerToken,
  isEmailConfigured,
} from "@/lib/email/config";
export {
  buildManagerInviteEmail,
  sendManagerInviteEmail,
} from "@/lib/email/manager-invite";
export {
  resetPostmarkClientForTests,
  sendTransactionalEmail,
  type SendTransactionalEmailInput,
  type SendTransactionalEmailResult,
} from "@/lib/email/send-transactional";
