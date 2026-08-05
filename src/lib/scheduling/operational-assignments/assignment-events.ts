import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AssignmentEventType =
  | "CREATED"
  | "UPDATED"
  | "REASSIGNED"
  | "COVERAGE_ADDED"
  | "ACTIVATED"
  | "COMPLETED"
  | "CANCELLED"
  | "PLAN_CONFIRMED"
  | "PLAN_REOPENED"
  | "PLAN_CLOSED"
  | "OVERRIDE"
  | "CALL_OFF_AFFECTED"
  | "COVERAGE_ACKNOWLEDGED";

export type RecordAssignmentEventInput = {
  assignmentId?: string | null;
  planId?: string | null;
  facilityId: string;
  eventType: AssignmentEventType;
  actorUserId: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  summary: string;
  departmentId?: string | null;
  employeeId?: string | null;
  unitId?: string | null;
  serviceDate?: Date | null;
  actorRole?: string | null;
  authMethod?: string | null;
  reason?: string | null;
  priorValuesJson?: string | null;
  newValuesJson?: string | null;
  client?: PrismaClient | Prisma.TransactionClient;
};

export async function recordAssignmentEvent(
  input: RecordAssignmentEventInput,
): Promise<void> {
  if (!input.assignmentId && !input.planId) {
    throw new Error("Assignment event requires assignmentId or planId.");
  }
  const client = input.client ?? prisma;
  await client.operationalAssignmentEvent.create({
    data: {
      assignmentId: input.assignmentId ?? null,
      planId: input.planId ?? null,
      facilityId: input.facilityId,
      departmentId: input.departmentId ?? null,
      employeeId: input.employeeId ?? null,
      unitId: input.unitId ?? null,
      serviceDate: input.serviceDate ?? null,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole ?? null,
      authMethod: input.authMethod ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      summary: input.summary,
      reason: input.reason ?? null,
      priorValuesJson: input.priorValuesJson ?? null,
      newValuesJson: input.newValuesJson ?? null,
    },
  });
}

export type AssignmentEventView = {
  id: string;
  assignmentId: string | null;
  planId: string | null;
  eventType: string;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  summary: string;
  reason: string | null;
  createdAt: string;
};

export async function loadAssignmentEvents(
  assignmentIds: string[],
  facilityId: string,
): Promise<AssignmentEventView[]> {
  if (assignmentIds.length === 0) return [];
  const rows = await prisma.operationalAssignmentEvent.findMany({
    where: { facilityId, assignmentId: { in: assignmentIds } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      assignmentId: true,
      planId: true,
      eventType: true,
      fromStatus: true,
      toStatus: true,
      summary: true,
      reason: true,
      createdAt: true,
      actorUser: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    assignmentId: r.assignmentId,
    planId: r.planId,
    eventType: r.eventType,
    actorName: r.actorUser?.displayName ?? null,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    summary: r.summary,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}
