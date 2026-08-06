"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import { isDietaryOperationalCyclesEnabled } from "@/lib/feature-flags";
import {
  createDraft,
  duplicateCycle,
  generateDietaryDefaultsDrafts,
  publishCycle,
  reorderDrafts,
  retireCycle,
  updateDraft,
  type CycleActor,
} from "@/lib/operational-cycles";
import { prisma } from "@/lib/prisma";

export type CycleActionResult =
  | { ok: true; message?: string; cycleId?: string }
  | { ok: false; message: string; errors?: string[] };

const cycleTypeSchema = z.enum([
  "PREPARATION",
  "SERVICE",
  "TRANSITION",
  "CLOSEOUT",
  "CUSTOM",
]);

const mealTypeSchema = z.enum(["BREAKFAST", "LUNCH", "DINNER"]);

const locationModeSchema = z.enum([
  "ALL_DEPARTMENT_UNITS",
  "UNIT_TYPES",
  "EXPLICIT_UNITS",
]);

const milestoneSchema = z.enum(["READY", "SERVICE_STARTED"]);

const unitTypeSchema = z.enum([
  "SERVERY",
  "KITCHEN",
  "RETAIL",
  "OFFICE",
  "STORAGE",
  "OTHER",
  "RESIDENT_AREA",
  "COMMON_AREA",
  "MECHANICAL",
  "RESTROOM_CLUSTER",
  "EVS_ZONE",
  "GROUND",
]);

function actorFromSession(session: {
  uid: string;
  name?: string | null;
}): CycleActor {
  return {
    userId: session.uid,
    label: session.name ?? null,
  };
}

function requireCyclesFeature(): void {
  if (!isDietaryOperationalCyclesEnabled()) {
    throw new Error("Dietary Operational Cycles are not enabled.");
  }
}

function revalidateCycles(departmentId: string) {
  revalidatePath(`/admin/departments/${departmentId}`);
  revalidatePath(`/admin/departments/${departmentId}`, "page");
  revalidatePath("/staffing/cycles");
  revalidatePath("/dashboard");
}

async function assertDepartmentInFacility(
  departmentId: string,
  facilityId: string,
): Promise<{ id: string }> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) throw new Error("Department not found.");
  return department;
}

function parseDaysOfWeek(raw: FormDataEntryValue | null): number[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function parseCsvEnums<T extends string>(
  raw: FormDataEntryValue | null,
  allowed: readonly T[],
): T[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const set = new Set(allowed);
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is T => set.has(part as T));
}

function parseDraftFromForm(formData: FormData) {
  const mealRaw = String(formData.get("mealType") ?? "").trim();
  const locationMode = locationModeSchema.parse(
    String(formData.get("locationMode") ?? "ALL_DEPARTMENT_UNITS"),
  );
  const displaySequenceRaw = String(formData.get("displaySequence") ?? "").trim();

  return {
    label: z.string().min(1).max(120).parse(String(formData.get("label") ?? "").trim()),
    description: (() => {
      const value = String(formData.get("description") ?? "").trim();
      return value || null;
    })(),
    cycleType: cycleTypeSchema.parse(String(formData.get("cycleType") ?? "")),
    displaySequence: displaySequenceRaw
      ? z.coerce.number().int().min(0).max(10_000).parse(displaySequenceRaw)
      : undefined,
    startLocal: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/)
      .parse(String(formData.get("startLocal") ?? "").trim()),
    endLocal: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/)
      .parse(String(formData.get("endLocal") ?? "").trim()),
    overnight: String(formData.get("overnight") ?? "") === "true",
    applicableDaysOfWeek: parseDaysOfWeek(formData.get("applicableDaysOfWeek")),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(String(formData.get("effectiveFrom") ?? "").trim()),
    effectiveTo: (() => {
      const value = String(formData.get("effectiveTo") ?? "").trim();
      if (!value) return null;
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(value);
    })(),
    mealType: mealRaw ? mealTypeSchema.parse(mealRaw) : null,
    locationMode,
    applicableUnitTypes:
      locationMode === "UNIT_TYPES"
        ? parseCsvEnums(
            formData.get("applicableUnitTypes"),
            unitTypeSchema.options as unknown as readonly z.infer<typeof unitTypeSchema>[],
          )
        : [],
    unitIds:
      locationMode === "EXPLICIT_UNITS"
        ? String(formData.get("unitIds") ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : [],
    expectedMilestones: parseCsvEnums(
      formData.get("expectedMilestones"),
      milestoneSchema.options as unknown as readonly z.infer<typeof milestoneSchema>[],
    ),
  };
}

function toErrors(error: unknown): CycleActionResult {
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      message: "Validation failed.",
      errors: error.issues.map((issue) => issue.message),
    };
  }
  const message = error instanceof Error ? error.message : "Operational Cycle action failed.";
  const errors = message
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    ok: false,
    message: errors[0] ?? message,
    errors: errors.length > 1 ? errors.slice(1) : undefined,
  };
}

export async function createCycleDraftAction(formData: FormData): Promise<CycleActionResult> {
  try {
    requireCyclesFeature();
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const draft = parseDraftFromForm(formData);
    const created = await createDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      draft,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: `Draft “${created.label}” created.`, cycleId: created.id };
  } catch (error) {
    return toErrors(error);
  }
}

export async function updateCycleDraftAction(formData: FormData): Promise<CycleActionResult> {
  try {
    requireCyclesFeature();
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const draft = parseDraftFromForm(formData);
    const updated = await updateDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      draft,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: `Draft “${updated.label}” updated.`, cycleId: updated.id };
  } catch (error) {
    return toErrors(error);
  }
}

export async function duplicateCycleAction(formData: FormData): Promise<CycleActionResult> {
  try {
    requireCyclesFeature();
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const created = await duplicateCycle(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return {
      ok: true,
      message: `Duplicated as draft v${created.version}.`,
      cycleId: created.id,
    };
  } catch (error) {
    return toErrors(error);
  }
}

export async function reorderCycleDraftsAction(formData: FormData): Promise<CycleActionResult> {
  try {
    requireCyclesFeature();
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const orderedCycleIds = String(formData.get("orderedCycleIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (orderedCycleIds.length === 0) {
      throw new Error("Provide draft cycle ids to reorder.");
    }
    for (const id of orderedCycleIds) {
      z.string().cuid().parse(id);
    }
    await reorderDrafts(session, {
      facilityId: session.facilityId,
      departmentId,
      orderedCycleIds,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: "Draft order updated." };
  } catch (error) {
    return toErrors(error);
  }
}

export async function publishCycleAction(formData: FormData): Promise<CycleActionResult> {
  try {
    requireCyclesFeature();
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const published = await publishCycle(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: `Published “${published.label}”.`, cycleId: published.id };
  } catch (error) {
    return toErrors(error);
  }
}

export async function retireCycleAction(formData: FormData): Promise<CycleActionResult> {
  try {
    requireCyclesFeature();
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const retired = await retireCycle(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: `Retired “${retired.label}”.`, cycleId: retired.id };
  } catch (error) {
    return toErrors(error);
  }
}

export async function generateDietaryDefaultsAction(
  formData: FormData,
): Promise<CycleActionResult> {
  try {
    requireCyclesFeature();
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const effectiveFrom = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(String(formData.get("effectiveFrom") ?? "").trim());
    const created = await generateDietaryDefaultsDrafts(session, {
      facilityId: session.facilityId,
      departmentId,
      effectiveFrom,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return {
      ok: true,
      message: `Created ${created.length} Dietary default drafts for review.`,
    };
  } catch (error) {
    return toErrors(error);
  }
}
