import { NextResponse } from "next/server";
import { z } from "zod";

import { StaffLifecycleDenied } from "./ceremony";

export const lifecycleId = z.string().min(1).max(180);
const base64 = z.string().min(1).max(24000).regex(/^[a-zA-Z0-9_-]+$/);
const credential = z.object({
  id: base64, rawId: base64, type: z.literal("public-key"),
  clientExtensionResults: z.object({}),
});
export const assertionBody = credential.extend({
  response: z.object({
    authenticatorData: base64, clientDataJSON: base64, signature: base64,
    userHandle: base64.nullish().transform((value) => value ?? undefined),
  }),
});
export const enrollmentBody = credential.extend({
  response: z.object({ attestationObject: base64, clientDataJSON: base64 }),
});
export const lifecycleJson = (data: Record<string, unknown>, status = 200) =>
  NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
export const lifecycleError = (error: unknown) => error instanceof StaffLifecycleDenied
  ? lifecycleJson({ error: error.message }, 403)
  : lifecycleJson({ error: "Staff lifecycle request is temporarily unavailable." }, 503);
