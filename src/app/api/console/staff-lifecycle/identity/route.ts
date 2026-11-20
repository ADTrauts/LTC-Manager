import { z } from "zod";
import type { NextRequest } from "next/server";

import { AuthRateLimitBucketType, checkAuthRateLimit, passwordAccountBucketKey, registerAuthFailure } from "@/lib/auth-rate-limit";
import { completeHarborSignIn } from "@/lib/harbor-console/complete-sign-in";
import { digest, secret } from "@/lib/harbor-console/lifecycle/ceremony";
import { staffEmail } from "@/lib/harbor-console/lifecycle/administration";
import { STAFF_MFA_COOKIE, STAFF_MFA_PATH, staffLifecycleConfig } from "@/lib/harbor-console/lifecycle/gate";
import { assertionBody, enrollmentBody, lifecycleError, lifecycleId, lifecycleJson } from "@/lib/harbor-console/lifecycle/http";
import {
  beginIdentityEnrollment, beginRecoveryFactor, finishIdentityEnrollment, finishMfaSignIn,
  finishRecoveryFactor, requestRecovery,
} from "@/lib/harbor-console/lifecycle/identity";

const recoveryCookie = "harbor_recovery_browser";
const token = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
const password = z.string().min(12).refine((value) => Buffer.byteLength(value) <= 72);
const proof = { challengeId: lifecycleId, response: assertionBody };
const body = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("sign-in"), ...proof }),
  z.strictObject({ operation: z.literal("request-recovery"), email: staffEmail }),
  z.strictObject({ operation: z.literal("begin-recovery-factor"), token }),
  z.strictObject({ operation: z.literal("prove-recovery-factor"), token, ...proof }),
  z.strictObject({ operation: z.literal("begin-enrollment"), token }),
  z.strictObject({ operation: z.literal("finish-enrollment"), token, challengeId: lifecycleId, response: enrollmentBody, password,
    displayName: z.string().trim().min(1).max(100).optional() }),
]);

export async function POST(request: NextRequest) {
  const config = staffLifecycleConfig(request);
  if (!config) return lifecycleJson({ error: "Not found." }, 404);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return lifecycleJson({ error: "Invalid request." }, 400);
  const input = parsed.data;
  const recoveryProof = token.safeParse(request.cookies.get(recoveryCookie)?.value).data;
  try {
    if (input.operation !== "request-recovery") {
      const reference = "token" in input ? digest(input.token) : digest(request.cookies.get(STAFF_MFA_COOKIE)?.value ?? "absent");
      const buckets = [{ key: passwordAccountBucketKey("harbor-identity:" + input.operation + ":" + reference),
        type: AuthRateLimitBucketType.PASSWORD_ACCOUNT }];
      if ((await checkAuthRateLimit(buckets)).locked) return lifecycleJson({ error: "Too many attempts. Try again later." }, 429);
      await registerAuthFailure(buckets);
    }
    switch (input.operation) {
      case "sign-in": {
        const browserProof = request.cookies.get(STAFF_MFA_COOKIE)?.value;
        if (!browserProof) return lifecycleJson({ error: "Sign in again." }, 403);
        const staff = await finishMfaSignIn(config, input.challengeId, input.response, browserProof);
        const response = await completeHarborSignIn(request, staff, true);
        response.cookies.set({ name: STAFF_MFA_COOKIE, value: "", path: STAFF_MFA_PATH, maxAge: 0 });
        return response;
      }
      case "request-recovery": {
        if (config.mode === "production" && !config.recoveryEnabled) return lifecycleJson({ ok: true }, 202);
        const buckets = [{
          key: passwordAccountBucketKey("harbor-recovery:" + input.email), type: AuthRateLimitBucketType.PASSWORD_ACCOUNT,
        }];
        if (!(await checkAuthRateLimit(buckets)).locked) {
          await registerAuthFailure(buckets);
          await requestRecovery(config, input.email);
        }
        return lifecycleJson({ ok: true }, 202);
      }
      case "begin-recovery-factor": {
        const browserProof = recoveryProof ?? secret();
        const response = lifecycleJson(await beginRecoveryFactor(config, input.token, browserProof));
        response.cookies.set({ name: recoveryCookie, value: browserProof, httpOnly: true, sameSite: "strict",
          path: STAFF_MFA_PATH, maxAge: 15 * 60, secure: process.env.NODE_ENV === "production" });
        return response;
      }
      case "prove-recovery-factor":
        if (!recoveryProof) return lifecycleJson({ error: "Staff lifecycle request could not be verified." }, 403);
        await finishRecoveryFactor(config, input.token, input.challengeId, input.response, recoveryProof);
        return lifecycleJson({ ok: true });
      case "begin-enrollment":
        return lifecycleJson(await beginIdentityEnrollment(config, input.token, recoveryProof));
      case "finish-enrollment": {
        await finishIdentityEnrollment(config, input.token, input.challengeId, input.response,
          input.password, recoveryProof, input.displayName);
        const response = lifecycleJson({ ok: true });
        response.cookies.set({ name: recoveryCookie, value: "", path: STAFF_MFA_PATH, maxAge: 0 });
        return response;
      }
    }
  } catch (error) {
    return lifecycleError(error);
  }
}
