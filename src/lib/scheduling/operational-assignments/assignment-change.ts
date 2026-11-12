import type { Prisma } from "@prisma/client";
import { toServiceDateKey } from "@/lib/operational-time";
import { enqueueAssignmentChanged } from "@/lib/notifications/live-publishers";
import { recordAssignmentEvent, type RecordAssignmentEventInput } from "./assignment-events";
import type { CoverageSlotSnapshot } from "../coverage-episodes/observe";
import { recordCoverageEpisodeTransitions } from "../coverage-episodes/record";

export async function writeAssignmentChangeAttention(
  tx: Prisma.TransactionClient,
  input: {
    facilityId: string;
    departmentId: string;
    assignmentId: string;
    employeeId: string;
    serviceDate: Date;
    subjectLabel: string;
    unitId?: string | null;
    spaceId?: string | null;
    coverageBefore: ReadonlyMap<string, CoverageSlotSnapshot> | null;
    event: Omit<RecordAssignmentEventInput, "client">;
  },
): Promise<{ assignmentOutboxId: string; coverageOutboxIds: string[] }> {
  const recorded = await recordAssignmentEvent({ ...input.event, client: tx });
  const intake = await enqueueAssignmentChanged(tx, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    assignmentId: input.assignmentId,
    assignmentEventId: recorded.id,
    serviceDate: toServiceDateKey(input.serviceDate),
    assigneeEmployeeId: input.employeeId,
    subjectLabel: input.subjectLabel,
    occurredAt: recorded.createdAt,
    unitId: input.unitId,
    spaceId: input.spaceId,
  });
  const coverageOutboxIds = input.coverageBefore ? await recordCoverageEpisodeTransitions(tx, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDateKey: toServiceDateKey(input.serviceDate),
    before: input.coverageBefore,
    occurredAt: recorded.createdAt,
    sourceType: "assignment_event",
    sourceId: recorded.id,
  }) : [];
  return { assignmentOutboxId: intake.id, coverageOutboxIds };
}
