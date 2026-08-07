"use server";

import { revalidatePath } from "next/cache";

import { getSession, sessionUserIdForFk } from "@/lib/auth";
import {
  cancelOneOff,
  completeExplicit,
  createOneOff,
  markNotRequired,
  reopenOccurrence,
  resolveUnitWorkRequirements,
  type WorkRequirement,
} from "@/lib/department-work";
import { requireDepartmentFeatureEnabled } from "@/lib/department-operations";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

async function requireWorkPlans(departmentId: string) {
  await requireDepartmentFeatureEnabled(
    departmentId,
    "workPlans",
    "Work Plans are not enabled for this department.",
  );
}

async function actorFromSession(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const employeeId = await getOperationalEmployeeIdForSession(session);
  return {
    userId: sessionUserIdForFk(session),
    employeeId,
    label: session.name || session.email || null,
    authenticationMethod: session.authMethod ?? null,
  };
}

async function loadRequirement(input: {
  facilityId: string;
  departmentId: string;
  unitId?: string | null;
  occurrenceKey: string;
}): Promise<{ requirement: WorkRequirement; operationalDateKey: string }> {
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const now = new Date();
  const operationalDate = getFacilityServiceDate(timezone, now);
  const operationalDateKey = toServiceDateKey(operationalDate);
  const requirements = await resolveUnitWorkRequirements({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId: input.unitId ?? undefined,
    operationalDate,
    operationalDateKey,
    now,
    facilityTimezone: timezone,
  });
  const requirement = requirements.find((r) => r.occurrenceKey === input.occurrenceKey);
  if (!requirement) {
    throw new Error("Work requirement not found for this operational date.");
  }
  return { requirement, operationalDateKey };
}

export async function completeWorkRequirementAction(input: {
  facilityId: string;
  departmentId: string;
  unitId: string;
  occurrenceKey: string;
  note?: string | null;
  clientCommandId?: string | null;
  deviceBoundUnitId?: string | null;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const { requirement, operationalDateKey } = await loadRequirement(input);
  const result = await completeExplicit(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    requirement,
    operationalDate: operationalDateKey,
    actor: await actorFromSession(session),
    note: input.note,
    clientCommandId: input.clientCommandId,
    deviceBoundUnitId: input.deviceBoundUnitId,
    recordedOnline: true,
  });
  revalidatePath(`/unit/${input.unitId}`);
  revalidatePath("/staffing/operations");
  return { id: result.occurrence.id, deduplicated: result.deduplicated };
}

export async function markWorkNotRequiredAction(input: {
  facilityId: string;
  departmentId: string;
  unitId?: string | null;
  occurrenceKey: string;
  reason: string;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const { requirement, operationalDateKey } = await loadRequirement(input);
  const result = await markNotRequired(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    requirement,
    operationalDate: operationalDateKey,
    actor: await actorFromSession(session),
    reason: input.reason,
  });
  if (input.unitId) revalidatePath(`/unit/${input.unitId}`);
  revalidatePath("/staffing/operations");
  return { id: result.id };
}

export async function reopenWorkOccurrenceAction(input: {
  facilityId: string;
  departmentId: string;
  unitId?: string | null;
  occurrenceKey: string;
  reason?: string | null;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const now = new Date();
  const operationalDate = getFacilityServiceDate(timezone, now);
  const requirements = await resolveUnitWorkRequirements({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId: input.unitId ?? undefined,
    operationalDate,
    operationalDateKey: toServiceDateKey(operationalDate),
    now,
    facilityTimezone: timezone,
  });
  const requirement = requirements.find((r) => r.occurrenceKey === input.occurrenceKey);
  const occurrenceId = requirement?.occurrenceId;
  if (!occurrenceId) throw new Error("No persisted Work occurrence to reopen.");
  const result = await reopenOccurrence(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    occurrenceId,
    actor: await actorFromSession(session),
  });
  if (input.unitId) revalidatePath(`/unit/${input.unitId}`);
  revalidatePath("/staffing/operations");
  return { id: result.id };
}

export async function createOneOffWorkAction(input: {
  facilityId: string;
  departmentId: string;
  unitId: string;
  title: string;
  instructions?: string | null;
  assignedEmployeeId?: string | null;
  dueAt?: string | null;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
  const result = await createOneOff(session, {
    work: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDate: operationalDateKey,
      unitId: input.unitId,
      title: input.title,
      instructions: input.instructions,
      assignedEmployeeId: input.assignedEmployeeId,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    },
    actor: await actorFromSession(session),
  });
  revalidatePath(`/unit/${input.unitId}`);
  revalidatePath("/staffing/operations");
  return { id: result.id, occurrenceKey: result.occurrenceKey };
}

export async function cancelOneOffWorkAction(input: {
  facilityId: string;
  departmentId: string;
  occurrenceId: string;
  unitId?: string | null;
  reason?: string | null;
}) {
  await requireWorkPlans(input.departmentId);
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await cancelOneOff(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    occurrenceId: input.occurrenceId,
    actor: await actorFromSession(session),
    reason: input.reason,
  });
  if (input.unitId) revalidatePath(`/unit/${input.unitId}`);
  revalidatePath("/staffing/operations");
}
