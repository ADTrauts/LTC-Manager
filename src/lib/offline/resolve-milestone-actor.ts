import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import type { ServeryMilestoneActor } from "@/lib/servery";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

/** Assemble the Milestone actor from a validated session — shared by Server Actions and sync APIs. */
export async function resolveMilestoneActor(session: AppJwtPayload): Promise<ServeryMilestoneActor> {
  return {
    userId: sessionUserIdForFk(session),
    employeeId: await getOperationalEmployeeIdForSession(session),
    role: session.role,
    authMethod: session.authMethod === "QUICK_PIN" ? "QUICK_PIN" : "PASSWORD",
  };
}

/** Opaque actor reference for offline bundle attribution — never a session token. */
export function actorRefForSession(session: AppJwtPayload): string {
  return `${session.authKind}:${session.uid}`;
}
