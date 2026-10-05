/**
 * Location History is a projection over stored source facts.
 * There is no LocationHistory ledger table.
 *
 * Placement uses the location stored on the source row. Live Asset location
 * is never used to rewrite historical Request / Issue / Repair entries.
 * Repair stores unitId only — no spaceId in this phase.
 */

import { prisma } from "@/lib/prisma";

import {
  LOCATION_HISTORY_SOURCES,
  type LocationHistorySource,
} from "./history-boundaries";

export type LocationHistoryEventKind =
  | "REQUEST_SUBMITTED"
  | "ISSUE_REPORTED"
  | "WORK_ORDER_OPENED"
  | "WORK_ORDER_STATUS_CHANGED"
  | "WORK_COMPLETED"
  | "EVIDENCE_RECORD"
  | "WORK_OCCURRENCE"
  | "KEY_POINT_ACTUAL"
  | "ASSIGNMENT"
  | "PLACE_NAME_CHANGED";

export type LocationHistoryEvent = {
  id: string;
  kind: LocationHistoryEventKind;
  at: Date;
  title: string;
  detail: string | null;
  href: string | null;
  status?: string | null;
  source: LocationHistorySource;
  sourceId: string;
  unitId: string | null;
  spaceId: string | null;
};

export type LoadLocationHistoryInput = {
  facilityId: string;
  unitId: string;
  spaceId?: string | null;
  limit?: number;
  cursor?: Date | string | null;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function matchesSpaceFilter(
  storedSpaceId: string | null | undefined,
  spaceId: string | null | undefined,
): boolean {
  if (!spaceId) return true;
  return storedSpaceId === spaceId;
}

export async function loadLocationHistory(
  input: LoadLocationHistoryInput,
): Promise<LocationHistoryEvent[]> {
  const unit = await prisma.unit.findFirst({
    where: { id: input.unitId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!unit) {
    throw new Error("Location not found.");
  }

  const limit = Math.min(Math.max(input.limit ?? 40, 1), 200);
  const cursorAt = input.cursor ? toDate(input.cursor) : null;
  const fetchTake = limit + 8;
  const cursorFilter = cursorAt ? { lt: cursorAt } : undefined;
  const spaceId = input.spaceId ?? null;

  const spaces = await prisma.unitSpace.findMany({
    where: { unitId: unit.id },
    select: { id: true },
  });
  const spaceIds = spaces.map((row) => row.id);

  const [
    requests,
    issues,
    repairs,
    evidence,
    occurrences,
    keyPoints,
    assignments,
    placeChanges,
  ] = await Promise.all([
    prisma.operationalRequest.findMany({
      where: {
        facilityId: input.facilityId,
        unitId: unit.id,
        ...(spaceId ? { spaceId } : {}),
        ...(cursorFilter ? { reportedAt: cursorFilter } : {}),
      },
      orderBy: { reportedAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        requestCode: true,
        summary: true,
        status: true,
        reportedAt: true,
        unitId: true,
        spaceId: true,
      },
    }),
    prisma.assetIssue.findMany({
      where: {
        facilityId: input.facilityId,
        unitId: unit.id,
        ...(spaceId ? { spaceId } : {}),
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
        unitId: true,
        spaceId: true,
      },
    }),
    prisma.repair.findMany({
      where: {
        unitId: unit.id,
        unit: { facilityId: input.facilityId },
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
        unitId: true,
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
        facilityId: input.facilityId,
        unitId: unit.id,
        ...(spaceId ? { spaceId } : {}),
        ...(cursorFilter ? { occurredAt: cursorFilter } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        templateName: true,
        status: true,
        occurredAt: true,
        unitId: true,
        spaceId: true,
        placeLabelSnapshot: true,
      },
    }),
    prisma.departmentWorkOccurrence.findMany({
      where: {
        facilityId: input.facilityId,
        unitId: unit.id,
        ...(spaceId ? { spaceId } : {}),
        ...(cursorFilter ? { createdAt: cursorFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        workItemLabelSnapshot: true,
        status: true,
        createdAt: true,
        completedAt: true,
        unitId: true,
        spaceId: true,
      },
    }),
    spaceIds.length
      ? prisma.operationalCycleKeyPointActual.findMany({
          where: {
            facilityId: input.facilityId,
            spaceId: spaceId ?? { in: spaceIds },
            ...(cursorFilter ? { recordedAt: cursorFilter } : {}),
          },
          orderBy: { recordedAt: "desc" },
          take: fetchTake,
          select: {
            id: true,
            cycleStableKey: true,
            actualLocal: true,
            recordedAt: true,
            spaceId: true,
          },
        })
      : Promise.resolve([]),
    prisma.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        ...(spaceId
          ? { locations: { some: { unitSpaceId: spaceId } } }
          : {
              OR: [
                { unitId: unit.id },
                { locations: { some: { unitId: unit.id } } },
              ],
            }),
        ...(cursorFilter ? { createdAt: cursorFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        roleLabel: true,
        status: true,
        createdAt: true,
        unitId: true,
        locations: {
          select: { unitId: true, unitSpaceId: true, labelSnapshot: true },
          take: 4,
        },
      },
    }),
    prisma.placeNameChange.findMany({
      where: {
        facilityId: input.facilityId,
        ...(spaceId
          ? { unitSpaceId: spaceId }
          : {
              OR: [{ unitId: unit.id }, { unitSpaceId: { in: spaceIds } }],
            }),
        ...(cursorFilter ? { recordedAt: cursorFilter } : {}),
      },
      orderBy: { recordedAt: "desc" },
      take: fetchTake,
      select: {
        id: true,
        previousLabel: true,
        newLabel: true,
        recordedAt: true,
        unitId: true,
        unitSpaceId: true,
      },
    }),
  ]);

  const events: LocationHistoryEvent[] = [];

  for (const request of requests) {
    events.push({
      id: `request:${request.id}`,
      kind: "REQUEST_SUBMITTED",
      at: request.reportedAt,
      title: `Request submitted — ${request.summary}`,
      detail: request.requestCode,
      href: `/operational-requests/${request.id}`,
      status: request.status,
      source: "OperationalRequest",
      sourceId: request.id,
      unitId: request.unitId,
      spaceId: request.spaceId,
    });
  }

  for (const issue of issues) {
    events.push({
      id: `issue:${issue.id}`,
      kind: "ISSUE_REPORTED",
      at: issue.reportedAt,
      title: `Issue reported — ${issue.summary}`,
      detail: issue.issueCode,
      href: `/asset-issues/${issue.id}`,
      status: issue.status,
      source: "AssetIssue",
      sourceId: issue.id,
      unitId: issue.unitId,
      spaceId: issue.spaceId,
    });
  }

  for (const repair of repairs) {
    if (!matchesSpaceFilter(null, spaceId)) {
      continue;
    }
    events.push({
      id: `wo-open:${repair.id}`,
      kind: "WORK_ORDER_OPENED",
      at: repair.requestedAt,
      title: `Work Order opened — ${repair.title}`,
      detail: repair.repairCode,
      href: `/repairs/${repair.id}`,
      status: repair.status,
      source: "Repair",
      sourceId: repair.id,
      unitId: repair.unitId,
      spaceId: null,
    });
    if (repair.status === "COMPLETED" || repair.completedAt) {
      events.push({
        id: `wo-complete:${repair.id}`,
        kind: "WORK_COMPLETED",
        at: repair.completedAt ?? repair.requestedAt,
        title: `Work Order completed — ${repair.title}`,
        detail: repair.repairCode,
        href: `/repairs/${repair.id}`,
        status: repair.status,
        source: "Repair",
        sourceId: repair.id,
        unitId: repair.unitId,
        spaceId: null,
      });
    }
    for (const update of repair.updates) {
      if (!update.statusAfterUpdate || update.statusAfterUpdate === "OPEN") continue;
      events.push({
        id: `wo-update:${update.id}`,
        kind: "WORK_ORDER_STATUS_CHANGED",
        at: update.updatedAt,
        title: `Work Order ${repair.repairCode} — ${update.statusAfterUpdate}`,
        detail: update.updateText,
        href: `/repairs/${repair.id}`,
        status: update.statusAfterUpdate,
        source: "Repair",
        sourceId: repair.id,
        unitId: repair.unitId,
        spaceId: null,
      });
    }
  }

  for (const record of evidence) {
    events.push({
      id: `evidence:${record.id}`,
      kind: "EVIDENCE_RECORD",
      at: record.occurredAt,
      title: record.templateName,
      detail: record.placeLabelSnapshot ?? record.status,
      href: `/staffing/log-book/${record.id}`,
      status: record.status,
      source: "OperationalEvidenceRecord",
      sourceId: record.id,
      unitId: record.unitId,
      spaceId: record.spaceId,
    });
  }

  for (const occurrence of occurrences) {
    events.push({
      id: `work:${occurrence.id}`,
      kind: "WORK_OCCURRENCE",
      at: occurrence.completedAt ?? occurrence.createdAt,
      title: occurrence.workItemLabelSnapshot,
      detail: occurrence.status,
      href: null,
      status: occurrence.status,
      source: "DepartmentWorkOccurrence",
      sourceId: occurrence.id,
      unitId: occurrence.unitId,
      spaceId: occurrence.spaceId,
    });
  }

  for (const actual of keyPoints) {
    events.push({
      id: `key-point:${actual.id}`,
      kind: "KEY_POINT_ACTUAL",
      at: actual.recordedAt,
      title: actual.cycleStableKey,
      detail: actual.actualLocal,
      href: null,
      status: null,
      source: "OperationalCycleKeyPointActual",
      sourceId: actual.id,
      unitId: unit.id,
      spaceId: actual.spaceId,
    });
  }

  for (const assignment of assignments) {
    const location = assignment.locations[0];
    events.push({
      id: `assignment:${assignment.id}`,
      kind: "ASSIGNMENT",
      at: assignment.createdAt,
      title: assignment.roleLabel,
      detail: location?.labelSnapshot ?? assignment.status,
      href: null,
      status: assignment.status,
      source: "OperationalAssignment",
      sourceId: assignment.id,
      unitId: assignment.unitId ?? location?.unitId ?? unit.id,
      spaceId: location?.unitSpaceId ?? null,
    });
  }

  for (const change of placeChanges) {
    events.push({
      id: `place:${change.id}`,
      kind: "PLACE_NAME_CHANGED",
      at: change.recordedAt,
      title: `Place renamed to ${change.newLabel}`,
      detail: change.previousLabel,
      href: null,
      status: null,
      source: "PlaceNameChange",
      sourceId: change.id,
      unitId: change.unitId ?? unit.id,
      spaceId: change.unitSpaceId,
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  const filtered = cursorAt
    ? events.filter((event) => event.at.getTime() < cursorAt.getTime())
    : events;
  return filtered.slice(0, limit);
}

export { LOCATION_HISTORY_SOURCES };
