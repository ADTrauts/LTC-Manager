/** Customer-facing support contact. Not the Vssyl Console ticket system. */

export const CUSTOMER_SUPPORT_EMAIL = "support@vssyl.com";
export const CUSTOMER_SUPPORT_SUBJECT = "Vssyl Support Request";
export const CUSTOMER_SUPPORT_BODY_PROMPT = "What can we help with?";
export const CUSTOMER_SUPPORT_HREF = "/help";

export function customerSupportMailtoHref(
  email: string = CUSTOMER_SUPPORT_EMAIL,
  subject: string = CUSTOMER_SUPPORT_SUBJECT,
  body: string = CUSTOMER_SUPPORT_BODY_PROMPT,
): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
