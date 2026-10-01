import type { Prisma, PrismaClient } from "@prisma/client";

import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

import { waiverCreateDecision } from "./waiver";

type Db = PrismaClient | Prisma.TransactionClient;

export async function createOperationalRecordWaiver(
  client: Db,
  input: {
    facilityId: string;
    departmentId: string;
    logAttachmentId: string;
    requirementKey: string;
    operationalDateKey: string;
    reason: string;
    actorMaySubmit: boolean;
    recordedByUserId?: string | null;
    recordedByEmployeeId?: string | null;
    recordedByLabel?: string | null;
    recordedAt?: Date;
  },
): Promise<{ id: string }> {
  const attachment = await client.logAttachment.findFirst({
    where: {
      id: input.logAttachmentId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    select: { id: true, waiverAllowed: true },
  });
  if (!attachment) throw new Error("Record requirement not found.");
  const existing = await client.operationalEvidenceRecord.findFirst({
    where: {
      facilityId: input.facilityId,
      followsRecordId: null,
      OR: [{ requirementKey: input.requirementKey }, { logRequirementKey: input.requirementKey }],
    },
    select: { id: true },
  });
  const decision = waiverCreateDecision({
    waiverAllowed: attachment.waiverAllowed,
    slotAlreadyRecorded: Boolean(existing),
    actorMaySubmit: input.actorMaySubmit,
    reason: input.reason,
  });
  if (!decision.ok) throw new Error(decision.reason);
  const recordedAt = input.recordedAt ?? new Date();
  const created = await client.operationalRecordWaiver.create({
    data: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      logAttachmentId: attachment.id,
      requirementKey: input.requirementKey,
      operationalDate: facilityLocalDateToServiceDate(input.operationalDateKey),
      reason: input.reason.trim(),
      recordedByUserId: input.recordedByUserId ?? null,
      recordedByEmployeeId: input.recordedByEmployeeId ?? null,
      recordedByLabel: input.recordedByLabel ?? null,
      recordedAt,
    },
    select: { id: true },
  });
  return created;
}
