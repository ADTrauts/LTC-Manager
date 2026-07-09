"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MealType, UnitType } from "@prisma/client";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import { sessionUserIdForFk } from "@/lib/auth";
import { resolveServeryEventOperationInstanceId } from "@/lib/operations/resolve-servery-event-operation-instance";
import { prisma } from "@/lib/prisma";

const recordServeryServiceTimeSchema = z.object({
  unitId: z.string().cuid(),
  mealType: z.nativeEnum(MealType),
  eventType: z.enum(["READY", "STARTED"]),
  returnTab: z.enum(["overview", "logs"]).optional(),
  returnLogTab: z.string().trim().optional(),
});

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

export async function recordServeryServiceTimeAction(formData: FormData) {
  const session = await requireFacilitySession();
  const parsed = recordServeryServiceTimeSchema.parse({
    unitId: formData.get("unitId"),
    mealType: formData.get("mealType"),
    eventType: formData.get("eventType"),
    returnTab: formData.get("returnTab") ?? undefined,
    returnLogTab: formData.get("returnLogTab") ?? undefined,
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId, isActive: true },
    select: { id: true, unitType: true },
  });
  if (!unit || unit.unitType !== UnitType.SERVERY) {
    throw new Error("Only active servery units can record meal service times.");
  }

  const serviceDate = startOfToday();
  const now = new Date();
  const userId = sessionUserIdForFk(session);
  const operationInstanceId = await resolveServeryEventOperationInstanceId({
    facilityId: session.facilityId,
    serviceDate,
    mealType: parsed.mealType,
  });

  await prisma.serveryMealServiceEvent.upsert({
    where: {
      unitId_serviceDate_mealType: {
        unitId: unit.id,
        serviceDate,
        mealType: parsed.mealType,
      },
    },
    create: {
      unitId: unit.id,
      serviceDate,
      mealType: parsed.mealType,
      mealServiceReadyAt: parsed.eventType === "READY" ? now : null,
      mealServiceStartedAt: parsed.eventType === "STARTED" ? now : null,
      readyRecordedById: parsed.eventType === "READY" ? userId : null,
      startedRecordedById: parsed.eventType === "STARTED" ? userId : null,
      operationInstanceId,
    },
    update:
      parsed.eventType === "READY"
        ? {
            mealServiceReadyAt: now,
            readyRecordedById: userId,
            ...(operationInstanceId ? { operationInstanceId } : {}),
          }
        : {
            mealServiceStartedAt: now,
            startedRecordedById: userId,
            ...(operationInstanceId ? { operationInstanceId } : {}),
          },
  });

  revalidatePath("/unit/[unitId]", "page");
  revalidatePath(`/unit/${unit.id}`);
  revalidatePath("/dashboard");
  const redirectParams = new URLSearchParams();
  redirectParams.set("mealServiceEvent", parsed.eventType === "READY" ? "ready-recorded" : "started-recorded");
  if (parsed.returnTab) {
    redirectParams.set("unitTab", parsed.returnTab);
  }
  if (parsed.returnLogTab) {
    redirectParams.set("logTab", parsed.returnLogTab);
  }
  redirect(`/unit/${unit.id}?${redirectParams.toString()}`);
}
