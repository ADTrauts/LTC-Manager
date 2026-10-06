"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { skipPmOccurrence, SKIP_REASON_MIN_LENGTH } from "@/lib/preventive-maintenance/skip";
import { loadPlantRunDepartment } from "@/lib/preventive-maintenance/run-load";

export type PmRunActionState = {
  ok: boolean;
  error?: string;
};

function asError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Unable to update this Preventive Maintenance occurrence.";
}

export async function skipPmOccurrenceAction(
  occurrenceId: string,
  _prev: PmRunActionState | null,
  formData: FormData,
): Promise<PmRunActionState> {
  try {
    const session = await getSession();
    if (!session?.facilityId) return { ok: false, error: "Sign in required." };
    const department = await loadPlantRunDepartment(session, prisma);
    if (!department) return { ok: false, error: "Facility Plant Operations is not available." };
    const reason = String(formData.get("reason") ?? "");
    if (reason.trim().length < SKIP_REASON_MIN_LENGTH) {
      return {
        ok: false,
        error: `A skip reason of at least ${SKIP_REASON_MIN_LENGTH} characters is required.`,
      };
    }
    await skipPmOccurrence(session, {
      facilityId: session.facilityId,
      departmentId: department.id,
      occurrenceId,
      reason,
    });
    revalidatePath("/preventive-maintenance");
    revalidatePath(`/preventive-maintenance/${occurrenceId}`);
    revalidatePath("/repairs");
    redirect(`/preventive-maintenance/${occurrenceId}`);
  } catch (err) {
    return { ok: false, error: asError(err) };
  }
}
