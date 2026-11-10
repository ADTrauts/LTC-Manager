/**
 * A submitted Record that is out of standard.
 * Records already decided that. This file only publishes the fact.
 * It does not read field values, and it does not treat corrective text as resolution.
 */

import type { Prisma } from "@prisma/client";

import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import { evidenceFailedIntakeDedupeKey } from "@/lib/notifications/thread-key";
import { toServiceDateKey } from "@/lib/operational-time";

type Tx = Prisma.TransactionClient;

export async function enqueueEvidenceFailed(
  tx: Tx,
  record: {
    id: string;
    facilityId: string;
    departmentId: string;
    outOfStandard: boolean;
    occurredAt: Date;
    operationalDate: Date;
    unitId: string | null;
    spaceId: string | null;
    assetId: string | null;
    placeLabelSnapshot: string | null;
    templateName: string;
  },
): Promise<string | null> {
  if (!record.outOfStandard) return null;
  let unitId = record.unitId;
  const spaceId = record.spaceId;
  if (!unitId && !spaceId && record.assetId) {
    const asset = await tx.asset.findFirst({
      where: { id: record.assetId, unit: { facilityId: record.facilityId } },
      select: { unitId: true },
    });
    unitId = asset?.unitId ?? null;
  }
  const result = await enqueueNotificationEvent(tx, {
    facilityId: record.facilityId,
    departmentId: record.departmentId,
    eventType: "evidence.failed",
    aggregateType: "evidence_record",
    aggregateId: record.id,
    occurredAt: record.occurredAt,
    dedupeKey: evidenceFailedIntakeDedupeKey(record.id),
    payload: {
      recordId: record.id,
      operationalDate: toServiceDateKey(record.operationalDate),
      unitId,
      spaceId,
      locationLabel: record.placeLabelSnapshot?.trim() || "",
      subjectLabel: record.templateName.trim().slice(0, 80) || "Record",
    },
  });
  return result.id;
}
