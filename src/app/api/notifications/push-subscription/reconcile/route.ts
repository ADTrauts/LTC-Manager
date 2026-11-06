import { getAppSession } from "@/lib/auth";
import { reconcilePushEndpoint } from "@/lib/notifications/push-subscription";
import { pushDenied, pushJson, readEndpointBody } from "@/lib/notifications/push-subscription-http";
import { canReleaseBrowserPush, pushRegistrationUserId } from "@/lib/notifications/push-registration-session";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request): Promise<Response> {
  const session = await getAppSession();
  if (!session || !canReleaseBrowserPush(session)) return pushDenied();
  const body = await readEndpointBody(request);
  if (!body) return pushJson({ keep: false });
  const userId = pushRegistrationUserId(session);
  const result = await reconcilePushEndpoint(prisma, {
    endpoint: body.endpoint,
    userId,
    now: new Date(),
    sessionExpiresAt: typeof session.exp === "number" ? new Date(session.exp * 1000) : null,
    authorizedSessionVersion: typeof session.sessionVersion === "number" ? session.sessionVersion : null,
  });
  return pushJson(result);
}
