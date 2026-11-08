import { disablePushSubscription } from "@/lib/notifications/push-subscription";
import {
  pushDenied,
  pushFailure,
  pushJson,
  readEndpointBody,
  requirePushRegistrationUserId,
} from "@/lib/notifications/push-subscription-http";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request): Promise<Response> {
  const userId = await requirePushRegistrationUserId();
  if (!userId) return pushDenied();
  const body = await readEndpointBody(request);
  if (!body) return pushJson({ error: "Invalid subscription." }, 400);
  try {
    const result = await disablePushSubscription(prisma, {
      userId,
      endpoint: body.endpoint,
      now: new Date(),
    });
    return pushJson(result);
  } catch (error) {
    return pushFailure(error);
  }
}
