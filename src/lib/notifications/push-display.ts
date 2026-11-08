/**
 * Lock-screen copy for a future Web Push. The service worker repeats these words
 * because it cannot import this module. Tests keep the two copies aligned.
 */
export const BROWSER_ALERT_TITLE = "Vssyl";

export const BROWSER_ALERT_BODY = "Operational attention requires review";

const ATTENTION_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Same-origin path a notification click may open. No token and no operational text. */
export function browserAlertClickPath(attentionId: string | null | undefined): string {
  if (typeof attentionId === "string" && ATTENTION_ID.test(attentionId)) {
    return `/notifications?attention=${encodeURIComponent(attentionId)}`;
  }
  return "/notifications";
}
