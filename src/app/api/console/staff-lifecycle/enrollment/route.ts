import { z } from "zod";

import { AuthRateLimitBucketType, checkAuthRateLimit, passwordAccountBucketKey, registerAuthFailure } from "@/lib/auth-rate-limit";
import { getHarborSession } from "@/lib/harbor-console/auth";
import { staffLifecycleConfig } from "@/lib/harbor-console/lifecycle/gate";
import { enrollmentBody, lifecycleError, lifecycleId, lifecycleJson } from "@/lib/harbor-console/lifecycle/http";
import { beginOwnerEnrollment, finishOwnerEnrollment } from "@/lib/harbor-console/lifecycle/owner-enrollment";

const password = z.string().min(8).max(128);
const body = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("begin"), password }),
  z.strictObject({ operation: z.literal("finish"), password, challengeId: lifecycleId, response: enrollmentBody }),
]);

export async function POST(request: Request) {
  const config = staffLifecycleConfig(request);
  if (config?.mode !== "production") return lifecycleJson({ error: "Not found." }, 404);
  const session = await getHarborSession();
  if (!session || session.staffRole !== "OWNER") return lifecycleJson({ error: "Owner sign-in required." }, 403);
  const input = body.safeParse(await request.json().catch(() => null));
  if (!input.success) return lifecycleJson({ error: "Invalid request." }, 400);
  const buckets = [{ key: passwordAccountBucketKey("harbor-enrollment:" + session.uid),
    type: AuthRateLimitBucketType.PASSWORD_ACCOUNT }];
  const limit = await checkAuthRateLimit(buckets);
  if (limit.locked) return lifecycleJson({ error: "Too many attempts. Try again later." }, 429);
  // Count every attempt, including malformed/failed WebAuthn completions, without logging credentials.
  await registerAuthFailure(buckets);
  try {
    if (input.data.operation === "begin") return lifecycleJson(await beginOwnerEnrollment(config, session, input.data.password));
    await finishOwnerEnrollment(config, session, input.data.password, input.data.challengeId, input.data.response);
    return lifecycleJson({ ok: true, signInRequired: true });
  } catch (error) {
    return lifecycleError(error);
  }
}
