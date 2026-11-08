import { requirePushRegistrationUserId, pushDenied, pushJson } from "@/lib/notifications/push-subscription-http";
import { readVapidPublicKey } from "@/lib/notifications/web-push-config";

export async function GET(): Promise<Response> {
  const userId = await requirePushRegistrationUserId();
  if (!userId) return pushDenied();
  const publicKey = readVapidPublicKey();
  if (!publicKey) {
    return pushJson({ error: "Browser alerts are not available right now." }, 503);
  }
  return pushJson({ publicKey });
}
