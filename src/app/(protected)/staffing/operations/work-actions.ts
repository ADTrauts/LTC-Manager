"use server";

import { revalidatePath } from "next/cache";

import { getSession, sessionUserIdForFk } from "@/lib/auth";
import {
  cancelOneOff,
  completeExplicit,
  createOneOff,
  markNotRequired,
  reassignOccurrence,
  reopenOccurrence,
  type OneOffWorkInput,
  type WorkRequirement,
} from "@/lib/department-work";
import { isDietaryWorkPlansEnabled } from "@/lib/feature-flags";

function actorFromSession(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  return {
    userId: sessionUserIdForFk(session),
    label: session.name || session.email || null,
    authenticationMethod: session.authMethod,
  };
}

function requireFlag() {
  if (!isDietaryWorkPlansEnabled()) {
    throw new Error("Dietary Work Plans are not enabled.");
  }
}

export async function completeWorkAction(input: {
  facilityId: string;
  departmentId: string;
  operationalDate: string;
  requirement: WorkRequirement;
  note?: string | null;
}) {
  requireFlag();
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const result = await completeExplicit(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    requirement: input.requirement,
    operationalDate: input.operationalDate,
    actor: actorFromSession(session),
    note: input.note,
  });
  revalidatePath("/staffing/operations");
  revalidatePath(`/unit/${input.requirement.unitId ?? ""}`);
  return { occurrenceId: result.occurrence.id, deduplicated: result.deduplicated };
}

export async function markWorkNotRequiredAction(input: {
  facilityId: string;
  departmentId: string;
  operationalDate: string;
  requirement: WorkRequirement;
  reason: string;
}) {
  requireFlag();
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await markNotRequired(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    requirement: input.requirement,
    operationalDate: input.operationalDate,
    actor: actorFromSession(session),
    reason: input.reason,
  });
  revalidatePath("/staffing/operations");
}

export async function reopenWorkAction(input: {
  facilityId: string;
  departmentId: string;
  occurrenceId: string;
}) {
  requireFlag();
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await reopenOccurrence(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    occurrenceId: input.occurrenceId,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/operations");
}

export async function reassignWorkAction(input: {
  facilityId: string;
  departmentId: string;
  operationalDate: string;
  requirement: WorkRequirement;
  assignedEmployeeId: string;
}) {
  requireFlag();
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await reassignOccurrence(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    requirement: input.requirement,
    operationalDate: input.operationalDate,
    assignedEmployeeId: input.assignedEmployeeId,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/operations");
}

export async function createOneOffWorkAction(input: {
  work: OneOffWorkInput;
}) {
  requireFlag();
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  const created = await createOneOff(session, {
    work: input.work,
    actor: actorFromSession(session),
  });
  revalidatePath("/staffing/operations");
  return { occurrenceId: created.id };
}

export async function cancelOneOffWorkAction(input: {
  facilityId: string;
  departmentId: string;
  occurrenceId: string;
  reason?: string | null;
}) {
  requireFlag();
  const session = await getSession();
  if (!session) throw new Error("Authentication required.");
  await cancelOneOff(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    occurrenceId: input.occurrenceId,
    actor: actorFromSession(session),
    reason: input.reason,
  });
  revalidatePath("/staffing/operations");
}
