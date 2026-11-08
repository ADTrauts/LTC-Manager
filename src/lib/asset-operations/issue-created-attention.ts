/**
 * A new Issue exists.
 * The Issue domain already decided that. This file only publishes the fact.
 * Issue priority and operational impact are not notification priority.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { issueCreatedIntakeDedupeKey } from "@/lib/notifications/thread-key";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";

type Db = PrismaClient | Prisma.TransactionClient;

export async function enqueueIssueCreated(
  tx: Prisma.TransactionClient,
  issue: {
    id: string;
    facilityId: string;
    departmentId: string;
    unitId: string;
    spaceId: string | null;
    assetId: string | null;
    summary: string;
    reportedAt: Date;
  },
): Promise<string | null> {
  const [timeZone, unit, space, asset] = await Promise.all([
    loadFacilityTimezone(tx, issue.facilityId),
    tx.unit.findFirst({
      where: { id: issue.unitId, facilityId: issue.facilityId },
      select: { name: true },
    }),
    issue.spaceId
      ? tx.unitSpace.findFirst({
          where: { id: issue.spaceId, facilityId: issue.facilityId },
          select: { name: true },
        })
      : Promise.resolve(null),
    issue.assetId
      ? tx.asset.findFirst({
          where: { id: issue.assetId, unit: { facilityId: issue.facilityId } },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  if (!unit) throw new Error("Issue unit is not in this facility.");
  const locationLabel = [asset?.name, unit.name, space?.name].filter(Boolean).join(" · ").slice(0, 120);
  const result = await enqueueNotificationEvent(tx, {
    facilityId: issue.facilityId,
    departmentId: issue.departmentId,
    eventType: "issue.created",
    aggregateType: "issue",
    aggregateId: issue.id,
    occurredAt: issue.reportedAt,
    dedupeKey: issueCreatedIntakeDedupeKey(issue.id),
    payload: {
      issueId: issue.id,
      operationalDate: toServiceDateKey(getFacilityServiceDate(timeZone, issue.reportedAt)),
      unitId: issue.unitId,
      spaceId: issue.spaceId,
      locationLabel,
      subjectLabel: issue.summary.trim().slice(0, 80) || "Issue",
    },
  });
  return result.id;
}

export async function commitIssueCreation<
  T extends {
    id: string;
    facilityId: string;
    departmentId: string;
    unitId: string;
    spaceId: string | null;
    assetId: string | null;
    summary: string;
    reportedAt: Date;
  },
>(client: Db, create: (tx: Db) => Promise<T>): Promise<T> {
  const owns = typeof (client as PrismaClient).$transaction === "function";
  const write = async (tx: Db) => {
    const issue = await create(tx);
    const outboxId = await enqueueIssueCreated(tx as Prisma.TransactionClient, issue);
    return { issue, outboxId };
  };
  if (!owns) return (await write(client)).issue;
  const written = await (client as PrismaClient).$transaction((tx) => write(tx));
  if (written.outboxId) {
    try {
      await processNotificationOutboxRow(client as PrismaClient, { outboxId: written.outboxId });
    } catch {
      // The Issue is committed. The outbox row stays retryable.
    }
  }
  return written.issue;
}

/** Process a creation notice after an outer transaction commits. Already-processed rows are left alone. */
export async function processIssueCreatedOutbox(client: PrismaClient, issueId: string): Promise<void> {
  const row = await client.notificationOutbox.findFirst({
    where: { dedupeKey: issueCreatedIntakeDedupeKey(issueId), processedAt: null },
    select: { id: true },
  });
  if (!row) return;
  try {
    await processNotificationOutboxRow(client, { outboxId: row.id });
  } catch {
    // The Issue is committed. The outbox row stays retryable.
  }
}
