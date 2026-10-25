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

export async function createOverrideAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = createOverrideSchema.parse({
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

  const reason = callOffReasonFromForm(parsed);
  const employee = await prisma.employee.findFirst({
    where: { id: parsed.employeeId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!employee) throw new Error("Employee not found.");

  if (peopleChangeIsMove(parsed.reasonTemplate)) {
    if (!parsed.newUnitId) throw new Error("Choose the location for the move.");
    await moveDayAssignment({
      facilityId: session.facilityId,
      employeeId: parsed.employeeId,
      serviceDate: parsed.date,
      unitId: parsed.newUnitId,
      reason,
      actorUserId: session.authKind === "user" ? session.uid : null,
    });
  } else {
    await markShiftsCalledOff({
      facilityId: session.facilityId,
      employeeId: parsed.employeeId,
      serviceDate: parsed.date,
      reason,
    });
  }

  revalidateStaffingViews();
}
