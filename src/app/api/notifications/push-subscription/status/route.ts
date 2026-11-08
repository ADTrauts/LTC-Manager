import { pushSubscriptionStatus } from "@/lib/notifications/push-subscription";
import {
  pushDenied,
  pushJson,
  readEndpointBody,
  requirePushRegistrationUserId,
} from "@/lib/notifications/push-subscription-http";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request): Promise<Response> {
  const userId = await requirePushRegistrationUserId();
  if (!userId) return pushDenied();
  const body = await readEndpointBody(request);
  if (!body) return pushJson({ state: "not_enabled" });
  const result = await pushSubscriptionStatus(prisma, { userId, endpoint: body.endpoint, now: new Date() });
  return pushJson(result);
}
