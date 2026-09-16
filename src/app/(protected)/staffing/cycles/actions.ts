"use server";

import { revalidatePath } from "next/cache";

import { requireFacilitySession } from "@/lib/facility-context";
import { adjustMealServiceDayExpectation } from "@/lib/operational-cycles/adjust-day-expectation";
import {
  adjustKeyTimeDayExpectation,
  completeKeyTimeDayExpectation,
} from "@/lib/operational-cycles/key-time-day-actions";

export async function delayMealExpectationAction(formData: FormData): Promise<void> {
  const session = await requireFacilitySession();
  const expectationId = String(formData.get("expectationId") ?? "").trim();
  const minutesRaw = Number(formData.get("minutes") ?? 5);
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 5;

  if (!expectationId) {
    throw new Error("Missing meal-service expectation.");
  }

  const result = await adjustMealServiceDayExpectation({
    session,
    expectationId,
    addMinutes: minutes,
  });

  if (!result.ok) {
    const message =
      result.reason === "NOT_CONFIGURED"
        ? "Expected time not configured."
        : result.reason === "ROLE_REQUIRED" || result.reason === "EMPLOYEE_FORBIDDEN"
          ? "Supervisor access is required to adjust today's expected time."
          : result.reason === "CROSS_FACILITY"
            ? "That expectation belongs to another facility."
            : "Unable to adjust today's expected time.";
    throw new Error(message);
  }

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

  if (!expectationId) {
    throw new Error("Missing Key Time expectation.");
  }

  const result = await adjustKeyTimeDayExpectation({
    session,
    expectationId,
    addMinutes: minutes,
  });

  if (!result.ok) {
    throw new Error(
      result.reason === "ROLE_REQUIRED" || result.reason === "EMPLOYEE_FORBIDDEN"
        ? "Supervisor access is required to adjust today's Key Time."
        : result.reason === "CROSS_FACILITY"
          ? "That Key Time belongs to another facility."
          : result.reason === "NOT_FOUND"
            ? "That Key Time was not found."
            : "Unable to adjust today's Key Time.",
    );
  }

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
