/**
 * Phase 10A Asset history / timeline merge.
 */

import { prisma } from "@/lib/prisma";

import {
  assetStatusLabel,
  normalizeAssetStatus,
  workOrderStatusLabel,
  type AssetHistoryEvent,
} from "./types";

export type LoadAssetTimelineOptions = {
  limit?: number;
  /** ISO timestamp or Date — return events strictly older than this (keyset). */
  cursor?: Date | string | null;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Merge status history, issues, repairs, and evidence into a single descending timeline.
 */
export async function loadAssetTimeline(
  assetId: string,
  options: LoadAssetTimelineOptions = {},
): Promise<AssetHistoryEvent[]> {
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);
  const cursorAt = options.cursor ? toDate(options.cursor) : null;
  const fetchTake = limit + 5;

  const cursorFilter = cursorAt ? { lt: cursorAt } : undefined;

  const [statusRows, issues, repairs, evidence] = await Promise.all([
    prisma.assetStatusHistory.findMany({
      where: {
        assetId,
        ...(cursorFilter ? { changedAt: cursorFilter } : {}),
      },
      orderBy: { changedAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        reason: true,
        note: true,
        changedAt: true,
        sourceIssueId: true,
        sourceRepairId: true,
      },
    }),
    prisma.assetIssue.findMany({
      where: {
        assetId,
        ...(cursorFilter ? { reportedAt: cursorFilter } : {}),
      },
      orderBy: { reportedAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        issueCode: true,
        summary: true,
        status: true,
        reportedAt: true,
        triageNote: true,
        resolvedAt: true,
        closedAt: true,
      },
    }),
    prisma.repair.findMany({
      where: {
        assetId,
        ...(cursorFilter ? { requestedAt: cursorFilter } : {}),
      },
      orderBy: { requestedAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        repairCode: true,
        title: true,
        status: true,
        requestedAt: true,
        completedAt: true,
        vendorId: true,
        workPerformed: true,
        returnToServiceReady: true,
        updates: {
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: {
            id: true,
            updateText: true,
            statusAfterUpdate: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.operationalEvidenceRecord.findMany({
      where: {
        assetId,
        ...(cursorFilter ? { occurredAt: cursorFilter } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        templateName: true,
        status: true,
        outOfStandard: true,
        occurredAt: true,
        correctiveActionText: true,
      },
    }),
  ]);

  const events: AssetHistoryEvent[] = [];

  for (const row of statusRows) {
    const kind =
      row.reason === "RETURN_TO_SERVICE"
        ? "RETURN_TO_SERVICE"
        : row.reason === "RETIREMENT" || normalizeAssetStatus(row.toStatus) === "RETIRED"
          ? "ASSET_RETIRED"
          : row.reason === "INITIAL"
            ? "ASSET_CREATED"
            : "STATUS_CHANGED";
    events.push({
      id: `status:${row.id}`,
      kind,
      at: row.changedAt,
      title:
        kind === "ASSET_CREATED"
          ? "Asset registered"
          : kind === "RETURN_TO_SERVICE"
            ? "Returned to service"
            : kind === "ASSET_RETIRED"
              ? "Asset retired"
              : `Status → ${assetStatusLabel(row.toStatus)}`,
      detail:
        row.note ??
        (row.fromStatus
          ? `${assetStatusLabel(row.fromStatus)} → ${assetStatusLabel(row.toStatus)}`
          : assetStatusLabel(row.toStatus)),
      href: `/assets/${assetId}`,
      status: row.toStatus,
    });
  }

  for (const issue of issues) {
    events.push({
      id: `issue:${issue.id}`,
      kind: "ISSUE_REPORTED",
      at: issue.reportedAt,
      title: `Issue ${issue.issueCode} reported`,
      detail: issue.summary,
      href: `/asset-issues/${issue.id}`,
      status: issue.status,
    });
    if (issue.triageNote && (issue.status === "TRIAGED" || issue.status === "MONITORING")) {
      events.push({
        id: `issue-triage:${issue.id}`,
        kind: "ISSUE_TRIAGED",
        at: issue.resolvedAt ?? issue.reportedAt,
        title: `Issue ${issue.issueCode} triaged`,
        detail: issue.triageNote,
        href: `/asset-issues/${issue.id}`,
        status: issue.status,
      });
    }
  }

  for (const repair of repairs) {
    events.push({
      id: `wo-open:${repair.id}`,
      kind: "WORK_ORDER_OPENED",
      at: repair.requestedAt,
      title: `Work Order ${repair.repairCode} opened`,
      detail: repair.title,
      href: `/issues/${repair.id}`,
      status: repair.status,
    });

    if (repair.vendorId) {
      events.push({
        id: `wo-vendor:${repair.id}`,
        kind: "VENDOR_ASSIGNED",
        at: repair.requestedAt,
        title: `Vendor assigned on ${repair.repairCode}`,
        detail: null,
        href: `/issues/${repair.id}`,
        status: repair.status,
      });
    }

    if (repair.status === "COMPLETED" || repair.completedAt) {
      events.push({
        id: `wo-complete:${repair.id}`,
        kind: "WORK_COMPLETED",
        at: repair.completedAt ?? repair.requestedAt,
        title: `Work Order ${repair.repairCode} completed`,
        detail: repair.workPerformed,
        href: `/issues/${repair.id}`,
        status: repair.status,
      });
    }

    for (const update of repair.updates) {
      if (!update.statusAfterUpdate) continue;
      if (update.statusAfterUpdate === "OPEN") continue;
      events.push({
        id: `wo-update:${update.id}`,
        kind: "WORK_ORDER_STATUS_CHANGED",
        at: update.updatedAt,
        title: `${repair.repairCode} → ${workOrderStatusLabel(update.statusAfterUpdate)}`,
        detail: update.updateText,
        href: `/issues/${repair.id}`,
        status: update.statusAfterUpdate,
      });
    }
  }

  for (const record of evidence) {
    events.push({
      id: `evidence:${record.id}`,
      kind: record.correctiveActionText ? "CORRECTIVE_ACTION" : "EVIDENCE_RECORD",
      at: record.occurredAt,
      title: record.templateName,
      detail: record.correctiveActionText
        ? record.correctiveActionText
        : record.outOfStandard
          ? "Out of standard"
          : record.status,
      href: `/staffing/log-book/${record.id}`,
      status: record.status,
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));

  const filtered = cursorAt
    ? events.filter((e) => e.at.getTime() < cursorAt.getTime())
    : events;

  return filtered.slice(0, limit);
}
