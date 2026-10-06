"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RepairPriority } from "@prisma/client";

import { getSession } from "@/lib/auth";
import {
  preventiveMaintenanceBuilderHref,
  preventiveMaintenancePlanHref,
} from "@/lib/department-administration";
import { isDepartmentAssetOperationsEnabled } from "@/lib/department-operations";
import { prisma } from "@/lib/prisma";
import {
  createPmPlanSuccessorDraft,
  createPmPlanWithDraft,
  persistPmPriority,
  publishPmPlanVersion,
  retirePmPlan,
  updatePmPlanDraft,
  type PmPlanDraftInput,
} from "@/lib/preventive-maintenance";

export type PmBuilderActionState = {
  ok: boolean;
  error?: string;
  planId?: string;
};

function revalidatePm(departmentId: string, planId?: string) {
  revalidatePath(`/build/departments/${departmentId}`);
  revalidatePath(preventiveMaintenanceBuilderHref(departmentId));
  if (planId) revalidatePath(preventiveMaintenancePlanHref(departmentId, planId));
}

async function requirePlantSession(departmentId: string) {
  const session = await getSession();
  if (!session?.facilityId) {
    throw new Error("Sign in required.");
  }
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true, key: true },
  });
  if (!department || department.key !== "PLANT") {
    throw new Error("Preventive Maintenance is configured in Facility Plant Operations.");
  }
  if (!isDepartmentAssetOperationsEnabled(department.key)) {
    throw new Error("Asset Operations is not enabled for this department.");
  }
  return { session, department };
}

function parseDraft(formData: FormData): PmPlanDraftInput & { assetId: string } {
  const name = String(formData.get("name") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  const intervalMonths = Number(formData.get("intervalMonths"));
  const generationLeadDays = Number(formData.get("generationLeadDays"));
  const anchorDate = String(formData.get("anchorDate") ?? "");
  const effectiveDate = String(formData.get("effectiveDate") ?? "").trim() || null;
  const maintenanceCategoryId = String(formData.get("maintenanceCategoryId") ?? "").trim() || null;
  const priority = persistPmPriority(String(formData.get("priority") ?? "ROUTINE"));
  const procedureVersionId = String(formData.get("procedureVersionId") ?? "").trim() || null;
  const defaultAssignedEmployeeId =
    String(formData.get("defaultAssignedEmployeeId") ?? "").trim() || null;
  const instructions = String(formData.get("instructions") ?? "").trim() || null;
  const templateIds = formData.getAll("recordTemplateId").map((value) => String(value).trim()).filter(Boolean);

  return {
    assetId,
    name,
    instructions,
    maintenanceCategoryId,
    intervalMonths: Number.isFinite(intervalMonths) ? intervalMonths : 1,
    generationLeadDays: Number.isFinite(generationLeadDays) ? generationLeadDays : 7,
    anchorDate,
    effectiveDate,
    priority: priority as RepairPriority,
    procedureVersionId,
    defaultAssignedEmployeeId,
    recordRequirements: templateIds.map((templateId, sortOrder) => ({ templateId, sortOrder })),
  };
}

function asError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Unable to save this Preventive Maintenance Plan.";
}

export async function createPmPlanAction(
  departmentId: string,
  _prev: PmBuilderActionState | null,
  formData: FormData,
): Promise<PmBuilderActionState> {
  try {
    const { session } = await requirePlantSession(departmentId);
    const draft = parseDraft(formData);
    if (!draft.assetId) {
      return { ok: false, error: "Select an Asset." };
    }
    const created = await createPmPlanWithDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      assetId: draft.assetId,
      draft,
    });
    revalidatePm(departmentId, created.id);
    redirect(preventiveMaintenancePlanHref(departmentId, created.id));
  } catch (err) {
    if (typeof err === "object" && err && "digest" in err) throw err;
    return { ok: false, error: asError(err) };
  }
}

export async function savePmPlanDraftAction(
  departmentId: string,
  planId: string,
  _prev: PmBuilderActionState | null,
  formData: FormData,
): Promise<PmBuilderActionState> {
  try {
    const { session } = await requirePlantSession(departmentId);
    const draft = parseDraft(formData);
    await updatePmPlanDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      planId,
      assetId: draft.assetId || undefined,
      draft,
    });
    revalidatePm(departmentId, planId);
    return { ok: true, planId };
  } catch (err) {
    return { ok: false, error: asError(err) };
  }
}

export async function publishPmPlanAction(
  departmentId: string,
  planId: string,
  _prev: PmBuilderActionState | null,
  formData: FormData,
): Promise<PmBuilderActionState> {
  try {
    const { session } = await requirePlantSession(departmentId);
    const draft = parseDraft(formData);
    await updatePmPlanDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      planId,
      assetId: draft.assetId || undefined,
      draft,
    });
    await publishPmPlanVersion(session, {
      facilityId: session.facilityId,
      departmentId,
      planId,
    });
    revalidatePm(departmentId, planId);
    return { ok: true, planId };
  } catch (err) {
    return { ok: false, error: asError(err) };
  }
}

export async function createPmPlanAndPublishAction(
  departmentId: string,
  _prev: PmBuilderActionState | null,
  formData: FormData,
): Promise<PmBuilderActionState> {
  try {
    const { session } = await requirePlantSession(departmentId);
    const draft = parseDraft(formData);
    if (!draft.assetId) {
      return { ok: false, error: "Select an Asset." };
    }
    const created = await createPmPlanWithDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      assetId: draft.assetId,
      draft,
    });
    await publishPmPlanVersion(session, {
      facilityId: session.facilityId,
      departmentId,
      planId: created.id,
    });
    revalidatePm(departmentId, created.id);
    redirect(preventiveMaintenancePlanHref(departmentId, created.id));
  } catch (err) {
    if (typeof err === "object" && err && "digest" in err) throw err;
    return { ok: false, error: asError(err) };
  }
}

export async function createSuccessorDraftAction(
  departmentId: string,
  planId: string,
): Promise<PmBuilderActionState> {
  try {
    const { session } = await requirePlantSession(departmentId);
    await createPmPlanSuccessorDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      planId,
    });
    revalidatePm(departmentId, planId);
    return { ok: true, planId };
  } catch (err) {
    return { ok: false, error: asError(err) };
  }
}

export async function retirePmPlanAction(
  departmentId: string,
  planId: string,
): Promise<PmBuilderActionState> {
  try {
    const { session } = await requirePlantSession(departmentId);
    await retirePmPlan(session, {
      facilityId: session.facilityId,
      departmentId,
      planId,
    });
    revalidatePm(departmentId, planId);
    return { ok: true, planId };
  } catch (err) {
    return { ok: false, error: asError(err) };
  }
}
