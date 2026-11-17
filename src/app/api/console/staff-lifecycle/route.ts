import { z } from "zod";

import { getHarborSession } from "@/lib/harbor-console/auth";
import { beginStaffAction, executeStaffAction, staffAction } from "@/lib/harbor-console/lifecycle/administration";
import { staffLifecycleConfig } from "@/lib/harbor-console/lifecycle/gate";
import { assertionBody, lifecycleError, lifecycleId, lifecycleJson } from "@/lib/harbor-console/lifecycle/http";

const body = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("begin"), command: staffAction }),
  z.strictObject({ operation: z.literal("execute"), challengeId: lifecycleId, response: assertionBody }),
]);

export async function POST(request: Request) {
  const config = staffLifecycleConfig(request);
  if (!config) return lifecycleJson({ error: "Not found." }, 404);
  const session = await getHarborSession();
  if (!session) return lifecycleJson({ error: "Authentication required." }, 401);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return lifecycleJson({ error: "Invalid request." }, 400);
  const input = parsed.data;
  try {
    return lifecycleJson(input.operation === "begin"
      ? await beginStaffAction(config, session, input.command)
      : await executeStaffAction(config, session, input.challengeId, input.response));
  } catch (error) {
    return lifecycleError(error);
  }
}
