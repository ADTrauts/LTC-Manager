import { prisma } from "@/lib/prisma";

export type AssignmentEventType =
  | "CREATED"
  | "UPDATED"
  | "REASSIGNED"
  | "COVERAGE_ADDED"
  | "ACTIVATED"
  | "COMPLETED"
  | "CANCELLED";

export type RecordAssignmentEventInput = {
  assignmentId: string;
  facilityId: string;
  eventType: AssignmentEventType;
  actorUserId: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  summary: string;
};

export async function recordAssignmentEvent(
  input: RecordAssignmentEventInput,
): Promise<void> {
  await prisma.operationalAssignmentEvent.create({
    data: {
      assignmentId: input.assignmentId,
      facilityId: input.facilityId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      summary: input.summary,
    },
  });
}

export type AssignmentEventView = {
  id: string;
  assignmentId: string;
  eventType: string;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  summary: string;
  createdAt: string;
};

export async function loadAssignmentEvents(
  assignmentIds: string[],
  facilityId: string,
): Promise<AssignmentEventView[]> {
  if (assignmentIds.length === 0) return [];

  const events = await prisma.operationalAssignmentEvent.findMany({
    where: {
      assignmentId: { in: assignmentIds },
      facilityId,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      assignmentId: true,
      eventType: true,
      actorUser: { select: { displayName: true } },
      fromStatus: true,
      toStatus: true,
      summary: true,
      createdAt: true,
    },
  });

  return events.map((e) => ({
    id: e.id,
    assignmentId: e.assignmentId,
    eventType: e.eventType,
    actorName: e.actorUser?.displayName ?? null,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    summary: e.summary,
    createdAt: e.createdAt.toISOString(),
  }));
}
