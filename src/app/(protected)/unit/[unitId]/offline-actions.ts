"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { sessionUserIdForFk } from "@/lib/auth";
import { requireFacilitySession } from "@/lib/facility-context";
import { resolveMilestoneActor } from "@/lib/offline/resolve-milestone-actor";
import { prisma } from "@/lib/prisma";
import { routeDietaryMealTiming } from "@/lib/dietary/route-meal-timing";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

const schema = z.object({
  unitId: z.string().cuid(),
  clientCommandId: z.string().trim().min(8).max(120),
  resolution: z.enum(["MARKED_DUPLICATE", "REJECTED_WITH_REASON", "APPLIED_AS_CORRECTION"]),
  reason: z.string().trim().max(500).optional(),
  occurredAt: z.string().optional(),
});

export async function resolveOfflineConflictAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = schema.parse({
    unitId: formData.get("unitId"),
    clientCommandId: formData.get("clientCommandId"),
    resolution: formData.get("resolution"),
    reason: formData.get("reason") ?? undefined,
    occurredAt: formData.get("occurredAt") ?? undefined,
  });

  const conflict = await prisma.offlineConflict.findFirst({
    where: {
      facilityId: session.facilityId,
      unitId: parsed.unitId,
      clientCommandId: parsed.clientCommandId,
      resolution: "PENDING",
    },
  });
  if (!conflict) return;

  const employeeId = await getOperationalEmployeeIdForSession(session);
  const now = new Date();

  if (parsed.resolution === "APPLIED_AS_CORRECTION") {
    const payload = conflict.commandPayload as {
      mealType?: string;
      commandType?: string;
    };
    const mealType = payload.mealType;
    const commandType = payload.commandType;
    if (!mealType || !commandType || !parsed.reason || !parsed.occurredAt) return;

    const eventType = commandType === "RECORD_SERVERY_READY" ? "READY" : "STARTED";
    const actor = await resolveMilestoneActor(session);
    await routeDietaryMealTiming({
      facilityId: session.facilityId,
      unitId: parsed.unitId,
      mealType,
      eventType,
      action: "CORRECT",
      clientActionId: `${parsed.clientCommandId}:correction`,
      occurredAt: new Date(parsed.occurredAt),
      reason: parsed.reason,
      actor: {
        userId: actor.userId,
        employeeId: actor.employeeId,
        role: session.role,
        authKind: session.authKind,
        authMethod: actor.authMethod,
      },
    });
  }

  await prisma.offlineConflict.update({
    where: { id: conflict.id },
    data: {
      resolution: parsed.resolution,
      resolvedByUserId: sessionUserIdForFk(session),
      resolvedByEmployeeId: employeeId,
      resolutionReason: parsed.reason ?? null,
      resolvedAt: now,
    },
  });

  revalidatePath(`/unit/${parsed.unitId}`);
}
