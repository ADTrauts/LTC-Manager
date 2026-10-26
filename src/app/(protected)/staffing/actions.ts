"use server";

import { revalidatePath } from "next/cache";
import { MealType } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { callOffReasonFromForm, moveDayAssignment, peopleChangeIsMove, markShiftsCalledOff } from "@/lib/scheduling/people-coverage";

const mealValues = [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER] as const;

const createOverrideSchema = z.object({
  scheduleEntryId: z.string().cuid().optional(),
  employeeId: z.string().cuid(),
  oldUnitId: z.string().cuid().optional(),
  newUnitId: z.string().cuid().optional(),
  date: z.string().min(8),
  mealType: z.enum(mealValues).optional(),
  reasonTemplate: z.string().optional(),
  reasonDetails: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(300).optional(),
});

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateStaffingViews() {
  revalidatePath("/staffing");
  revalidatePath("/dashboard");
  revalidatePath("/today");
  revalidatePath("/today/coverage");
  revalidatePath("/unit/[unitId]", "page");
}

export type CoverageChangeResult = { ok: true } | { ok: false; message: string };

export async function createOverrideAction(formData: FormData): Promise<CoverageChangeResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = createOverrideSchema.safeParse({
    scheduleEntryId: toOptional(formData.get("scheduleEntryId")),
    employeeId: formData.get("employeeId"),
    oldUnitId: toOptional(formData.get("oldUnitId")),
    newUnitId: toOptional(formData.get("newUnitId")),
    date: formData.get("date"),
    mealType: toOptional(formData.get("mealType")),
    reasonTemplate: toOptional(formData.get("reasonTemplate")),
    reasonDetails: toOptional(formData.get("reasonDetails")),
    reason: toOptional(formData.get("reason")),
  });
  if (!parsed.success) {
    return { ok: false, message: "Check the person, date, and reason, then try again." };
  }

  const reason = callOffReasonFromForm(parsed.data);
  const employee = await prisma.employee.findFirst({
    where: { id: parsed.data.employeeId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!employee) return { ok: false, message: "That person is not in this facility." };

  try {
    if (peopleChangeIsMove(parsed.data.reasonTemplate)) {
      if (!parsed.data.newUnitId) return { ok: false, message: "Choose the location for the move." };
      await moveDayAssignment({
        facilityId: session.facilityId,
        employeeId: parsed.data.employeeId,
        serviceDate: parsed.data.date,
        unitId: parsed.data.newUnitId,
        reason,
        actorUserId: session.authKind === "user" ? session.uid : null,
      });
    } else {
      await markShiftsCalledOff({
        facilityId: session.facilityId,
        employeeId: parsed.data.employeeId,
        serviceDate: parsed.data.date,
        reason,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === "No shift on that date to mark." ||
      message === "No assignment on that date to move." ||
      message === "Location not found."
    ) {
      return { ok: false, message };
    }
    throw error;
  }

  revalidateStaffingViews();
  return { ok: true };
}
