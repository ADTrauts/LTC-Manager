import { getAppSession } from "@/lib/auth";
import { capPushAuthorizationUntil } from "@/lib/notifications/push-authorization";
import { registerPushSubscription } from "@/lib/notifications/push-subscription";
import {
  pushDenied,
  pushFailure,
  pushJson,
  readSubscriptionBody,
} from "@/lib/notifications/push-subscription-http";
import { pushRegistrationUserId } from "@/lib/notifications/push-registration-session";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request): Promise<Response> {
  const session = await getAppSession();
  const userId = pushRegistrationUserId(session);
  if (!userId || !session || typeof session.exp !== "number" || typeof session.sessionVersion !== "number") {
    return pushDenied();
  }
  const body = await readSubscriptionBody(request);
  if (!body) return pushJson({ error: "Invalid subscription." }, 400);
  const now = new Date();
  const authorizedUntil = capPushAuthorizationUntil(now, new Date(session.exp * 1000));
  if (!authorizedUntil) return pushDenied();
  try {
    const result = await registerPushSubscription(prisma, {
      userId,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      now,
      authorizedSessionVersion: session.sessionVersion,
      authorizedUntil,
    });
    return pushJson(result);
  } catch (error) {
    return pushFailure(error);
  }
}
