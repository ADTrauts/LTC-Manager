"use server";

import { revalidatePath } from "next/cache";

import { getSession, sessionUserIdForFk } from "@/lib/auth";
import { requireDepartmentFeatureEnabled } from "@/lib/department-operations";
import {
  createDraft,
  createDraftFromPreset,
  createSuccessorDraft,
  duplicateWorkPlan,
  isDepartmentWorkPresetKey,
  publishWorkPlan,
  retireWorkPlan,
  updateDraft,
  type WorkPlanDraftInput,
} from "@/lib/department-work";

function actorFromSession(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  return {
    userId: sessionUserIdForFk(session),
    label: session.name || session.email || null,
  };
}

async function requireWorkPlans(departmentId: string) {
  await requireDepartmentFeatureEnabled(
    departmentId,
    "workPlans",
    "Work Plans are not enabled for this department.",
  );
}

export async function createWorkPlanDraftAction(input: {
  facilityId: string;
  departmentId: string;
  draft: WorkPlanDraftInput;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const created = await createDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    draft: input.draft,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/work-plans");
  return { id: created.id };
}

export async function createWorkPlanPresetDraftAction(input: {
  facilityId: string;
  departmentId: string;
  presetKey: string;
}) {
  await requireWorkPlans(input.departmentId);
  if (!isDepartmentWorkPresetKey(input.presetKey)) {
    throw new Error("Unknown Work Plan preset.");
  }
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const created = await createDraftFromPreset(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    presetKey: input.presetKey,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/work-plans");
  return { id: created.id };
}

export async function updateWorkPlanDraftAction(input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
  draft: WorkPlanDraftInput;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const updated = await updateDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    workPlanId: input.workPlanId,
    draft: input.draft,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/work-plans");
  return { id: updated.id };
}

export async function publishWorkPlanAction(input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await publishWorkPlan(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    workPlanId: input.workPlanId,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/work-plans");
}

export async function retireWorkPlanAction(input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await retireWorkPlan(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    workPlanId: input.workPlanId,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/work-plans");
}

export async function duplicateWorkPlanAction(input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const created = await duplicateWorkPlan(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    workPlanId: input.workPlanId,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/work-plans");
  return { id: created.id };
}

export async function createWorkPlanSuccessorAction(input: {
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const created = await createSuccessorDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    workPlanId: input.workPlanId,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/work-plans");
  return { id: created.id };
}
