import { releasePushEndpoint } from "@/lib/notifications/push-subscription";
import {
  pushDenied,
  pushJson,
  readEndpointBody,
  requirePushReleaseSession,
} from "@/lib/notifications/push-subscription-http";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request): Promise<Response> {
  const session = await requirePushReleaseSession();
  if (!session) return pushDenied();
  if (!session.userId) return pushJson({ released: false });
  const body = await readEndpointBody(request);
  if (!body) return pushJson({ released: false });
  const result = await releasePushEndpoint(prisma, {
    userId: session.userId,
    endpoint: body.endpoint,
    now: new Date(),
  });
  return pushJson({ released: result.released > 0 });
}
