"use server";

import { revalidatePath } from "next/cache";

import { requireFacilitySession } from "@/lib/facility-context";
import { addMinutesToLocalTime } from "@/lib/operational-cycles/day-expectation";
import { completeKeyTimeDayExpectation } from "@/lib/operational-cycles/key-time-day-actions";
import { recordOperationalTimingAdjustment } from "@/lib/operational-cycles/record-timing-adjustment";
import { prisma } from "@/lib/prisma";

async function adjustCanonicalTiming(input: {
  session: Awaited<ReturnType<typeof requireFacilitySession>>;
  cycleId: string;
  serviceDate: Date;
  baseline: string | null;
  minutes: number;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("A reason is required to adjust operational timing.");
  }
  if (!input.baseline) {
    throw new Error("Expected time not configured.");
  }
  const adjusted = addMinutesToLocalTime(input.baseline, input.minutes);
  if (!adjusted) {
    throw new Error("Unable to adjust today's expected time.");
  }
  const result = await recordOperationalTimingAdjustment({
    session: input.session,
    cycleId: input.cycleId,
    serviceDate: input.serviceDate,
    adjustedDueLocal: adjusted,
    reason,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function delayMealExpectationAction(formData: FormData): Promise<void> {
  const session = await requireFacilitySession();
  const expectationId = String(formData.get("expectationId") ?? "").trim();
  const minutesRaw = Number(formData.get("minutes") ?? 5);
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 5;
  const reason = String(formData.get("reason") ?? "");
  if (!expectationId) {
    throw new Error("Missing meal-service expectation.");
  }
  const row = await prisma.operationalCycleDayExpectation.findFirst({
    where: { id: expectationId, facilityId: session.facilityId },
    select: {
      cycleId: true,
      serviceDate: true,
      configuredTime: true,
      adjustedTime: true,
    },
  });
  if (!row) throw new Error("That expectation was not found.");
  await adjustCanonicalTiming({
    session,
    cycleId: row.cycleId,
    serviceDate: row.serviceDate,
    baseline: row.adjustedTime ?? row.configuredTime,
    minutes,
    reason,
  });
  revalidatePath("/staffing/cycles");
  revalidatePath("/workspace");
  revalidatePath("/today");
  revalidatePath("/unit", "layout");
}

export async function delayKeyTimeExpectationAction(formData: FormData): Promise<void> {
  const session = await requireFacilitySession();
  const expectationId = String(formData.get("expectationId") ?? "").trim();
  const minutesRaw = Number(formData.get("minutes") ?? 5);
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 5;
  const reason = String(formData.get("reason") ?? "");
  if (!expectationId) {
    throw new Error("Missing Key Time expectation.");
  }
  const row = await prisma.operationalCycleKeyTimeDayExpectation.findFirst({
    where: { id: expectationId, facilityId: session.facilityId },
    select: {
      cycleId: true,
      serviceDate: true,
      configuredDueLocal: true,
      adjustedDueLocal: true,
    },
  });
  if (!row) throw new Error("That Key Time was not found.");
  await adjustCanonicalTiming({
    session,
    cycleId: row.cycleId,
    serviceDate: row.serviceDate,
    baseline: row.adjustedDueLocal ?? row.configuredDueLocal,
    minutes,
    reason,
  });
  revalidatePath("/staffing/cycles");
  revalidatePath("/workspace");
  revalidatePath("/today");
  revalidatePath("/unit", "layout");
}

export async function completeKeyTimeExpectationAction(formData: FormData): Promise<void> {
  const session = await requireFacilitySession();
  const expectationId = String(formData.get("expectationId") ?? "").trim();
  if (!expectationId) {
    throw new Error("Missing Key Time expectation.");
  }

  const result = await completeKeyTimeDayExpectation({
    session,
    expectationId,
  });

  if (!result.ok) {
    throw new Error(
      result.reason === "ALREADY_COMPLETED"
        ? "That Key Time is already complete."
        : result.reason === "CORRECTION_FORBIDDEN"
          ? "Supervisor access is required to correct a completed Key Time."
          : result.reason === "ROLE_REQUIRED"
            ? "Staff access is required to mark this Key Time complete."
            : result.reason === "CROSS_FACILITY"
              ? "That Key Time belongs to another facility."
              : result.reason === "NOT_FOUND"
                ? "That Key Time was not found."
                : "Unable to mark Key Time complete.",
    );
  }

  revalidatePath("/staffing/cycles");
  revalidatePath("/workspace");
  revalidatePath("/today");
  revalidatePath("/unit", "layout");
}
