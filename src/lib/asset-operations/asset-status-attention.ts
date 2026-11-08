/**
 * An Asset status transition is already decided by the Asset domain.
 * This file publishes that transition. It does not decide usability,
 * and Asset criticality is not notification priority.
 */

import type { AssetStatus, Prisma, PrismaClient } from "@prisma/client";

import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import {
  ASSET_OUT_OF_SERVICE_THREAD_KIND,
  assetOutageEndedIntakeDedupeKey,
  assetOutOfServiceIntakeDedupeKey,
  assetOutOfServiceThreadKey,
  assetReturnedToServiceIntakeDedupeKey,
} from "@/lib/notifications/thread-key";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";

type Db = PrismaClient | Prisma.TransactionClient;

const USABLE: ReadonlySet<string> = new Set(["OPERATIONAL", "DEGRADED", "ACTIVE"]);

export async function enqueueAssetStatusAttention(
  tx: Db,
  input: {
    facilityId: string;
    assetId: string;
    historyId: string;
    fromStatus: AssetStatus | null;
    toStatus: AssetStatus;
    reason: string;
    occurredAt: Date;
  },
): Promise<string[]> {
  if (input.reason === "INITIAL") return [];
  const from = input.fromStatus;
  const to = input.toStatus;
  const opened = to === "OUT_OF_SERVICE" && from !== "OUT_OF_SERVICE";
  const recovered = from === "OUT_OF_SERVICE" && USABLE.has(to);
  const retired = from === "OUT_OF_SERVICE" && to === "RETIRED";
  if (!opened && !recovered && !retired) return [];

  const asset = await tx.asset.findFirst({
    where: { id: input.assetId, unit: { facilityId: input.facilityId } },
    select: {
      id: true,
      name: true,
      assetCode: true,
      departmentId: true,
      unitId: true,
      spaceId: true,
      unit: { select: { name: true, facilityId: true } },
      space: { select: { name: true } },
    },
  });
  if (!asset || asset.unit.facilityId !== input.facilityId || !asset.departmentId) return [];

  if (opened) {
    const timeZone = await loadFacilityTimezone(tx, input.facilityId);
    const place = [asset.unit.name, asset.space?.name].filter(Boolean).join(" · ").slice(0, 120);
    const subject = `${asset.name.trim()} (${asset.assetCode})`.slice(0, 80);
    const result = await enqueueNotificationEvent(tx as Prisma.TransactionClient, {
      facilityId: input.facilityId,
      departmentId: asset.departmentId,
      eventType: "asset.out_of_service",
      aggregateType: "asset_status",
      aggregateId: input.historyId,
      occurredAt: input.occurredAt,
      dedupeKey: assetOutOfServiceIntakeDedupeKey(input.historyId),
      payload: {
        assetId: asset.id,
        historyId: input.historyId,
        operationalDate: toServiceDateKey(getFacilityServiceDate(timeZone, input.occurredAt)),
        unitId: asset.unitId,
        spaceId: asset.spaceId,
        locationLabel: place,
        subjectLabel: subject,
      },
    });
    return [result.id];
  }

  const candidates = await tx.assetStatusHistory.findMany({
    where: {
      assetId: asset.id,
      toStatus: "OUT_OF_SERVICE",
      id: { not: input.historyId },
      reason: { not: "INITIAL" },
    },
    orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    select: { id: true, changedAt: true },
    take: 8,
  });
  const leaves = await tx.assetStatusHistory.findMany({
    where: {
      assetId: asset.id,
      fromStatus: "OUT_OF_SERVICE",
      toStatus: { not: "OUT_OF_SERVICE" },
      id: { not: input.historyId },
    },
    select: { changedAt: true },
  });
  const stillOpen = candidates.filter(
    (row) => !leaves.some((leave) => leave.changedAt.getTime() > row.changedAt.getTime()),
  );
  if (stillOpen.length === 0) return [];
  let outage = stillOpen[0]!;
  if (stillOpen.length > 1 && stillOpen[0]!.changedAt.getTime() === stillOpen[1]!.changedAt.getTime()) {
    const keys = stillOpen.map((row) =>
      assetOutOfServiceThreadKey({
        kind: ASSET_OUT_OF_SERVICE_THREAD_KIND,
        facilityId: input.facilityId,
        assetId: asset.id,
        historyId: row.id,
      }),
    );
    const notices = await tx.notification.findMany({
      where: { facilityId: input.facilityId, dedupeKey: { in: keys } },
      select: { dedupeKey: true, resolvedAt: true, expiresAt: true },
    });
    const closed = new Set(
      notices.filter((row) => row.resolvedAt || row.expiresAt).map((row) => row.dedupeKey),
    );
    const open = stillOpen.find((row, index) => !closed.has(keys[index]!));
    if (open) outage = open;
  }

  const result = await enqueueNotificationEvent(tx as Prisma.TransactionClient, {
    facilityId: input.facilityId,
    departmentId: asset.departmentId,
    eventType: retired ? "asset.outage_ended" : "asset.returned_to_service",
    aggregateType: "asset_status",
    aggregateId: input.historyId,
    occurredAt: input.occurredAt,
    dedupeKey: retired
      ? assetOutageEndedIntakeDedupeKey(input.historyId)
      : assetReturnedToServiceIntakeDedupeKey(input.historyId),
    payload: {
      assetId: asset.id,
      historyId: outage.id,
      ...(retired ? { endedReason: "asset_retired" } : {}),
    },
  });
  return [result.id];
}

export async function processAssetStatusAttention(client: PrismaClient, outboxIds: string[]): Promise<void> {
  for (const outboxId of outboxIds) {
    try {
      await processNotificationOutboxRow(client, { outboxId });
    } catch {
      // The Asset transition is committed. The outbox row stays retryable.
    }
  }
}
