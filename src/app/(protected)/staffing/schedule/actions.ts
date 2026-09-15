"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { sessionUserIdForFk } from "@/lib/auth";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  copyCanonicalShiftToDays,
  createCanonicalShift,
  deleteCanonicalShift,
  editCanonicalShift,
} from "@/lib/scheduling/canonical-shift-service";

/**
 * Canonical Department Scheduler actions.
 * Authority: platform SUPERVISOR+ (same as legacy staffing).
 * Future: MANAGE_SCHEDULE capability — not enforced yet.
 */

const createSchema = z.object({
  employeeId: z.string().min(1),
  departmentId: z.string().min(1),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  workShiftId: z.string().optional(),
});

const editSchema = z.object({
  shiftId: z.string().min(1),
  plannedStart: z.string().min(1),
  plannedEnd: z.string().min(1),
  workShiftId: z.string().optional(),
});

const copySchema = z.object({
  sourceShiftId: z.string().min(1),
  targetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
});

function opt(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function revalidateScheduleViews() {
  revalidatePath("/staffing");
  revalidatePath("/staffing/assignments");
  revalidatePath("/today");
  revalidatePath("/dashboard");
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "Check the shift form and try again.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Could not update the schedule.";
}

type ScheduleReturnContext = {
  date?: string | null;
  view?: string | null;
  mode?: string | null;
  error?: string;
};

function redirectToSchedule(ctx: ScheduleReturnContext) {
  const params = new URLSearchParams();
  if (ctx.date && /^\d{4}-\d{2}-\d{2}$/.test(ctx.date)) {
    params.set("date", ctx.date);
  }
  if (ctx.view === "location" || ctx.view === "employee") {
    params.set("view", ctx.view);
  }
  if (ctx.mode === "day" || ctx.mode === "week") {
    params.set("mode", ctx.mode);
  }
  if (ctx.error) {
    params.set("error", ctx.error.slice(0, 180));
  } else {
    params.set("saved", "1");
  }
  const qs = params.toString();
  redirect(qs ? `/staffing?${qs}` : "/staffing");
}

function returnContextFromForm(formData: FormData, fallbackDate?: string | null): ScheduleReturnContext {
  return {
    date: opt(formData.get("returnDate")) ?? fallbackDate ?? opt(formData.get("serviceDate")) ?? null,
    view: opt(formData.get("returnView")) ?? null,
    mode: opt(formData.get("returnMode")) ?? null,
  };
}

export async function createCanonicalShiftAction(formData: FormData) {
  const serviceDateRaw = opt(formData.get("serviceDate")) ?? null;
  const ret = returnContextFromForm(formData, serviceDateRaw);
  try {
    const session = await requireFacilitySession();
    requireAtLeastRole(session.role, "SUPERVISOR");

    const parsed = createSchema.parse({
      employeeId: formData.get("employeeId"),
      departmentId: formData.get("departmentId"),
      serviceDate: formData.get("serviceDate"),
      plannedStart: opt(formData.get("plannedStart")),
      plannedEnd: opt(formData.get("plannedEnd")),
      workShiftId: opt(formData.get("workShiftId")),
    });

    if (!parsed.workShiftId && (!parsed.plannedStart || !parsed.plannedEnd)) {
      throw new Error("Start and end times are required (or select a WorkShift pattern).");
    }

    await createCanonicalShift({
      facilityId: session.facilityId,
      employeeId: parsed.employeeId,
      departmentId: parsed.departmentId,
      serviceDate: parsed.serviceDate,
      plannedStart: parsed.plannedStart ?? "",
      plannedEnd: parsed.plannedEnd ?? "",
      workShiftId: parsed.workShiftId,
      createdByUserId: sessionUserIdForFk(session),
    });

    revalidateScheduleViews();
    redirectToSchedule({ ...ret, date: ret.date ?? parsed.serviceDate });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectToSchedule({ ...ret, error: actionErrorMessage(error) });
  }
}

export async function editCanonicalShiftAction(formData: FormData) {
  const serviceDateRaw = opt(formData.get("serviceDate")) ?? null;
  const ret = returnContextFromForm(formData, serviceDateRaw);
  try {
    const session = await requireFacilitySession();
    requireAtLeastRole(session.role, "SUPERVISOR");

    const parsed = editSchema.parse({
      shiftId: formData.get("shiftId"),
      plannedStart: formData.get("plannedStart"),
      plannedEnd: formData.get("plannedEnd"),
      workShiftId: opt(formData.get("workShiftId")),
    });

    await editCanonicalShift({
      facilityId: session.facilityId,
      shiftId: parsed.shiftId,
      plannedStart: parsed.plannedStart,
      plannedEnd: parsed.plannedEnd,
      workShiftId: parsed.workShiftId,
    });

    revalidateScheduleViews();
    redirectToSchedule(ret);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectToSchedule({ ...ret, error: actionErrorMessage(error) });
  }
}

export async function deleteCanonicalShiftAction(formData: FormData) {
  const serviceDateRaw = opt(formData.get("serviceDate")) ?? null;
  const ret = returnContextFromForm(formData, serviceDateRaw);
  try {
    const session = await requireFacilitySession();
    requireAtLeastRole(session.role, "SUPERVISOR");

    const shiftId = formData.get("shiftId");
    if (typeof shiftId !== "string" || !shiftId.trim()) {
      throw new Error("Shift is required.");
    }

    await deleteCanonicalShift({
      facilityId: session.facilityId,
      shiftId: shiftId.trim(),
    });

    revalidateScheduleViews();
    redirectToSchedule(ret);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectToSchedule({ ...ret, error: actionErrorMessage(error) });
  }
}

export async function copyCanonicalShiftAction(formData: FormData) {
  const serviceDateRaw = opt(formData.get("serviceDate")) ?? null;
  const ret = returnContextFromForm(formData, serviceDateRaw);
  try {
    const session = await requireFacilitySession();
    requireAtLeastRole(session.role, "SUPERVISOR");

    const targetDates = formData
      .getAll("targetDates")
      .filter((v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));

    const parsed = copySchema.parse({
      sourceShiftId: formData.get("sourceShiftId"),
      targetDates,
    });

    const result = await copyCanonicalShiftToDays({
      facilityId: session.facilityId,
      sourceShiftId: parsed.sourceShiftId,
      targetServiceDates: parsed.targetDates,
      createdByUserId: sessionUserIdForFk(session),
    });

    revalidateScheduleViews();
    if (result.skipped.length > 0 && result.createdIds.length > 0) {
      redirectToSchedule({
        ...ret,
        error: `Copied to ${result.createdIds.length} day(s). Skipped: ${result.skipped
          .map((s) => `${s.serviceDate} (${s.reason})`)
          .join("; ")}`.slice(0, 180),
      });
    }
    redirectToSchedule(ret);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectToSchedule({ ...ret, error: actionErrorMessage(error) });
  }
}
