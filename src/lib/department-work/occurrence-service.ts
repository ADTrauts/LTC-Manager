/**
 * Sparse DepartmentWorkOccurrence mutations (Phase 11A).
 * Idempotent by occurrenceKey and clientCommandId.
 * Append-preserving DepartmentWorkEvent on every action.
 */

import type {
  DepartmentWorkEventType,
  DepartmentWorkOccurrenceStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  requireWorkComplete,
  requireWorkSupervisorAction,
  resolveWorkAuthority,
} from "./authority";
import { buildOccurrenceKey } from "./occurrence-key";
import type { OneOffWorkInput, WorkRequirement } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

export type WorkOccurrenceActor = {
  userId: string | null;
  employeeId?: string | null;
  label?: string | null;
  authenticationMethod?: string | null;
};

async function appendOccurrenceEvent(
  client: DbClient,
  input: {
    occurrenceId: string;
    facilityId: string;
    departmentId: string;
    eventType: DepartmentWorkEventType;
    actor: WorkOccurrenceActor;
    previousStatus?: DepartmentWorkOccurrenceStatus | null;
    detailJson?: Prisma.InputJsonValue;
  },
) {
  await client.departmentWorkEvent.create({
    data: {
      id: cuidLike(),
      occurrenceId: input.occurrenceId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: input.eventType,
      actorUserId: input.actor.userId,
      actorEmployeeId: input.actor.employeeId ?? null,
      actorLabel: input.actor.label ?? null,
      previousStatus: input.previousStatus ?? null,
      detailJson: input.detailJson ?? undefined,
    },
  });
}

async function findByClientCommandId(
  client: DbClient,
  facilityId: string,
  departmentId: string,
  clientCommandId: string | null | undefined,
) {
  if (!clientCommandId?.trim()) return null;
  return client.departmentWorkOccurrence.findFirst({
    where: {
      facilityId,
      departmentId,
      clientCommandId: clientCommandId.trim(),
    },
  });
}

async function upsertOpenOccurrence(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    requirement: WorkRequirement;
    operationalDate: string;
    actor: WorkOccurrenceActor;
    clientCommandId?: string | null;
    deviceBoundUnitId?: string | null;
    recordedOnline?: boolean;
  },
) {
  const operationalDate = new Date(`${input.operationalDate.slice(0, 10)}T00:00:00.000Z`);
  const existing = await client.departmentWorkOccurrence.findFirst({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      occurrenceKey: input.requirement.occurrenceKey,
    },
  });
  if (existing) return existing;

  return client.departmentWorkOccurrence.create({
    data: {
      id: cuidLike(),
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      occurrenceKey: input.requirement.occurrenceKey,
      sourceKind: input.requirement.sourceKind,
      operationalDate,
      workPlanId: input.requirement.workPlanId || null,
      workPlanStableKey: input.requirement.workPlanStableKey,
      workPlanVersion: input.requirement.workPlanVersion,
      workItemId: input.requirement.workItemId || null,
      workItemKey: input.requirement.workItemKey,
      workItemLabelSnapshot: input.requirement.label,
      instructionsSnapshot: input.requirement.instructions,
      priority: input.requirement.priority,
      completionMode: input.requirement.completionMode,
      responsibilityMode: input.requirement.responsibilityMode,
      unitId: input.requirement.unitId,
      spaceId: input.requirement.spaceId,
      assetId: input.requirement.assetId,
      cycleStableKey: input.requirement.cycleStableKey,
      windowStartLocal: input.requirement.windowStartLocal,
      windowEndLocal: input.requirement.windowEndLocal,
      dueAt: input.requirement.dueAt,
      status: "OPEN",
      assignedEmployeeId: input.requirement.assignedEmployeeId,
      knowledgeArticleId: input.requirement.knowledgeArticleId,
      procedureTitleSnapshot: input.requirement.procedureTitle,
      createdByUserId: input.actor.userId,
      clientCommandId: input.clientCommandId?.trim() || null,
      deviceBoundUnitId: input.deviceBoundUnitId ?? null,
      authenticationMethod: input.actor.authenticationMethod ?? null,
      recordedOnline: input.recordedOnline ?? true,
    },
  });
}

export async function completeExplicit(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    requirement: WorkRequirement;
    operationalDate: string;
    actor: WorkOccurrenceActor;
    note?: string | null;
    clientCommandId?: string | null;
    deviceBoundUnitId?: string | null;
    recordedOnline?: boolean;
    evidenceRecordId?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveWorkAuthority(session, input.facilityId, input.departmentId);
  requireWorkComplete(authority);

  const byCommand = await findByClientCommandId(
    client,
    input.facilityId,
    input.departmentId,
    input.clientCommandId,
  );
  if (byCommand) {
    return { occurrence: byCommand, deduplicated: true as const };
  }

  const existing = await client.departmentWorkOccurrence.findFirst({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      occurrenceKey: input.requirement.occurrenceKey,
    },
  });

  if (
    existing &&
    (existing.status === "COMPLETED" || existing.status === "COMPLETED_WITH_EVIDENCE")
  ) {
    return { occurrence: existing, deduplicated: true as const };
  }

  const now = new Date();
  const withEvidence = Boolean(input.evidenceRecordId);
  const nextStatus: DepartmentWorkOccurrenceStatus = withEvidence
    ? "COMPLETED_WITH_EVIDENCE"
    : "COMPLETED";

  let occurrence = existing;
  if (!occurrence) {
    occurrence = await upsertOpenOccurrence(client, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      requirement: input.requirement,
      operationalDate: input.operationalDate,
      actor: input.actor,
      clientCommandId: input.clientCommandId,
      deviceBoundUnitId: input.deviceBoundUnitId,
      recordedOnline: input.recordedOnline,
    });
  }

  const previousStatus = occurrence.status;
  const updated = await client.departmentWorkOccurrence.update({
    where: { id: occurrence.id },
    data: {
      status: nextStatus,
      completedAt: now,
      recordedAt: now,
      synchronizedAt: input.recordedOnline === false ? null : now,
      completedByUserId: input.actor.userId,
      completedByEmployeeId: input.actor.employeeId ?? null,
      completedByLabel: input.actor.label ?? null,
      completionNote: input.note?.trim() || null,
      evidenceRecordId: input.evidenceRecordId ?? occurrence.evidenceRecordId,
      clientCommandId: input.clientCommandId?.trim() || occurrence.clientCommandId,
      deviceBoundUnitId: input.deviceBoundUnitId ?? occurrence.deviceBoundUnitId,
      authenticationMethod:
        input.actor.authenticationMethod ?? occurrence.authenticationMethod,
      recordedOnline: input.recordedOnline ?? true,
    },
  });

  await appendOccurrenceEvent(client, {
    occurrenceId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: withEvidence ? "COMPLETED_WITH_EVIDENCE" : "COMPLETED",
    actor: input.actor,
    previousStatus,
    detailJson: {
      occurrenceKey: input.requirement.occurrenceKey,
      evidenceRecordId: input.evidenceRecordId ?? null,
    },
  });

  return { occurrence: updated, deduplicated: false as const };
}

export async function markNotRequired(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    requirement: WorkRequirement;
    operationalDate: string;
    actor: WorkOccurrenceActor;
    reason: string;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveWorkAuthority(session, input.facilityId, input.departmentId);
  if (!authority.canMarkNotRequired) {
    requireWorkSupervisorAction(authority);
  }

  let occurrence = await client.departmentWorkOccurrence.findFirst({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      occurrenceKey: input.requirement.occurrenceKey,
    },
  });
  if (!occurrence) {
    occurrence = await upsertOpenOccurrence(client, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      requirement: input.requirement,
      operationalDate: input.operationalDate,
      actor: input.actor,
    });
  }

  const previousStatus = occurrence.status;
  const now = new Date();
  const updated = await client.departmentWorkOccurrence.update({
    where: { id: occurrence.id },
    data: {
      status: "NOT_REQUIRED",
      notRequiredReason: input.reason.trim(),
      notRequiredAt: now,
      notRequiredByUserId: input.actor.userId,
    },
  });

  await appendOccurrenceEvent(client, {
    occurrenceId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "NOT_REQUIRED",
    actor: input.actor,
    previousStatus,
    detailJson: { reason: input.reason.trim() },
  });

  return updated;
}

export async function reopenOccurrence(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    occurrenceId: string;
    actor: WorkOccurrenceActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveWorkAuthority(session, input.facilityId, input.departmentId);
  if (!authority.canReopen) {
    requireWorkSupervisorAction(authority);
  }

  const existing = await client.departmentWorkOccurrence.findFirst({
    where: {
      id: input.occurrenceId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Work occurrence not found.");

  const previousStatus = existing.status;
  const updated = await client.departmentWorkOccurrence.update({
    where: { id: existing.id },
    data: {
      status: "REOPENED",
      completedAt: null,
      completedByUserId: null,
      completedByEmployeeId: null,
      completedByLabel: null,
      evidenceRecordId: null,
      notRequiredAt: null,
      notRequiredReason: null,
      notRequiredByUserId: null,
    },
  });

  await appendOccurrenceEvent(client, {
    occurrenceId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "REOPENED",
    actor: input.actor,
    previousStatus,
  });

  return updated;
}

export async function reassignOccurrence(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    requirement: WorkRequirement;
    operationalDate: string;
    assignedEmployeeId: string;
    actor: WorkOccurrenceActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveWorkAuthority(session, input.facilityId, input.departmentId);
  if (!authority.canReassign) {
    requireWorkSupervisorAction(authority);
  }

  const employee = await client.employee.findFirst({
    where: {
      id: input.assignedEmployeeId,
      facilityId: input.facilityId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!employee) throw new Error("Assigned employee not found in facility.");

  let occurrence = await client.departmentWorkOccurrence.findFirst({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      occurrenceKey: input.requirement.occurrenceKey,
    },
  });
  if (!occurrence) {
    occurrence = await upsertOpenOccurrence(client, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      requirement: input.requirement,
      operationalDate: input.operationalDate,
      actor: input.actor,
    });
  }

  if (
    occurrence.status === "COMPLETED" ||
    occurrence.status === "COMPLETED_WITH_EVIDENCE"
  ) {
    throw new Error("Cannot reassign completed Work. Reopen first.");
  }

  const previousStatus = occurrence.status;
  const updated = await client.departmentWorkOccurrence.update({
    where: { id: occurrence.id },
    data: {
      originalAssignedEmployeeId:
        occurrence.originalAssignedEmployeeId ?? occurrence.assignedEmployeeId,
      assignedEmployeeId: input.assignedEmployeeId,
      reassignedAt: new Date(),
      reassignedByUserId: input.actor.userId,
      status: occurrence.status === "REOPENED" ? "REOPENED" : "OPEN",
    },
  });

  await appendOccurrenceEvent(client, {
    occurrenceId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "REASSIGNED",
    actor: input.actor,
    previousStatus,
    detailJson: { assignedEmployeeId: input.assignedEmployeeId },
  });

  return updated;
}

export async function createOneOff(
  session: AppJwtPayload,
  input: {
    work: OneOffWorkInput;
    actor: WorkOccurrenceActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveWorkAuthority(
    session,
    input.work.facilityId,
    input.work.departmentId,
  );
  if (!authority.canCreateOneOff) {
    requireWorkSupervisorAction(authority);
  }

  const unit = await client.unit.findFirst({
    where: {
      id: input.work.unitId,
      facilityId: input.work.facilityId,
      isActive: true,
    },
    select: { id: true },
  });
  if (!unit) throw new Error("Unit not found in facility.");

  if (input.work.assignedEmployeeId) {
    const employee = await client.employee.findFirst({
      where: {
        id: input.work.assignedEmployeeId,
        facilityId: input.work.facilityId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!employee) throw new Error("Assigned employee not found in facility.");
  }

  let procedureTitle: string | null = null;
  if (input.work.knowledgeArticleId) {
    const article = await client.knowledgeArticle.findFirst({
      where: {
        id: input.work.knowledgeArticleId,
        facilityId: input.work.facilityId,
        status: "PUBLISHED",
      },
      select: { id: true, title: true },
    });
    if (!article) {
      throw new Error("Procedure must be a published KnowledgeArticle in this facility.");
    }
    procedureTitle = article.title;
  }

  const nonce = cuidLike();
  const occurrenceKey = buildOccurrenceKey({
    sourceKind: "ONE_OFF",
    operationalDate: input.work.operationalDate,
    unitId: input.work.unitId,
    spaceId: input.work.spaceId,
    employeeId: input.work.assignedEmployeeId,
    oneOffNonce: nonce,
  });

  const operationalDate = new Date(
    `${input.work.operationalDate.slice(0, 10)}T00:00:00.000Z`,
  );

  const created = await client.departmentWorkOccurrence.create({
    data: {
      id: cuidLike(),
      facilityId: input.work.facilityId,
      departmentId: input.work.departmentId,
      occurrenceKey,
      sourceKind: "ONE_OFF",
      operationalDate,
      workItemLabelSnapshot: input.work.title.trim(),
      instructionsSnapshot: input.work.instructions?.trim() || null,
      priority: input.work.priority ?? "ROUTINE",
      completionMode: "EXPLICIT_CONFIRMATION",
      responsibilityMode: "UNIT_SHARED",
      unitId: input.work.unitId,
      spaceId: input.work.spaceId ?? null,
      assetId: input.work.assetId ?? null,
      windowStartLocal: input.work.windowStartLocal ?? null,
      windowEndLocal: input.work.windowEndLocal ?? null,
      dueAt: input.work.dueAt ?? null,
      status: "OPEN",
      assignedEmployeeId: input.work.assignedEmployeeId ?? null,
      knowledgeArticleId: input.work.knowledgeArticleId ?? null,
      procedureTitleSnapshot: procedureTitle,
      createdByUserId: input.actor.userId,
      authenticationMethod: input.actor.authenticationMethod ?? null,
    },
  });

  await appendOccurrenceEvent(client, {
    occurrenceId: created.id,
    facilityId: input.work.facilityId,
    departmentId: input.work.departmentId,
    eventType: "CREATED",
    actor: input.actor,
    detailJson: { oneOff: true, nonce },
  });

  return created;
}

export async function cancelOneOff(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    occurrenceId: string;
    actor: WorkOccurrenceActor;
    reason?: string | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveWorkAuthority(session, input.facilityId, input.departmentId);
  requireWorkSupervisorAction(authority);

  const existing = await client.departmentWorkOccurrence.findFirst({
    where: {
      id: input.occurrenceId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      sourceKind: "ONE_OFF",
    },
  });
  if (!existing) throw new Error("One-off Work not found.");

  const previousStatus = existing.status;
  const updated = await client.departmentWorkOccurrence.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      cancelReason: input.reason?.trim() || null,
    },
  });

  await appendOccurrenceEvent(client, {
    occurrenceId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "CANCELLED",
    actor: input.actor,
    previousStatus,
    detailJson: { reason: input.reason?.trim() || null },
  });

  return updated;
}
