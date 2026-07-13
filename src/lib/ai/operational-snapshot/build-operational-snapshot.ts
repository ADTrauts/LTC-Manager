import type { OperationalDepartmentKey } from "@/lib/department-nav";
import {
  buildOperationalTimeContext,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { loadCallDownList } from "@/lib/todays-work/load-call-down-list";
import { loadCoverageList } from "@/lib/todays-work/load-coverage-list";
import { loadHandoffs } from "@/lib/todays-work/load-handoffs";
import { loadWalkList } from "@/lib/todays-work/load-walk-list";

import {
  enforceSnapshotSize,
  sanitizeOperationalSnapshot,
} from "./sanitize-snapshot";
import {
  inspectionsAdminPath,
  staffingPath,
  todaysWorkCoveragePath,
  todaysWorkHandoffsPath,
  todaysWorkWalkPath,
  unitWorkspacePath,
} from "./source-paths";
import type {
  BuildOperationalSnapshotInput,
  OperationalSnapshot,
  SnapshotReadinessState,
} from "./types";

function toSnapshotState(status: string): SnapshotReadinessState {
  if (status === "blocked") return "needs_attention";
  if (status === "in_progress") return "in_progress";
  return "ready";
}

function buildSignals(item: {
  failed: number;
  missed: number;
  pending: number;
  openRepairCount: number;
  staffingCount: number;
}): string[] {
  const signals: string[] = [];
  if (item.failed > 0) signals.push(`${item.failed} failed logs`);
  if (item.missed > 0) signals.push(`${item.missed} missed logs`);
  if (item.pending > 0) signals.push(`${item.pending} pending logs`);
  if (item.openRepairCount > 0) signals.push(`${item.openRepairCount} open issues`);
  if (item.staffingCount === 0) signals.push("no staffing assigned");
  return signals;
}

async function loadIssueSignals(facilityId: string) {
  const open = await prisma.repair.findMany({
    where: { status: { not: "CLOSED" }, unit: { facilityId } },
    select: {
      priority: true,
      status: true,
      issueType: true,
    },
  });

  let urgent = 0;
  let high = 0;
  let inProgress = 0;
  let supplyShorts = 0;
  for (const row of open) {
    if (row.priority === "URGENT") urgent += 1;
    if (row.priority === "HIGH") high += 1;
    if (row.status === "IN_PROGRESS") inProgress += 1;
    if (row.issueType === "SUPPLY_SHORT") supplyShorts += 1;
  }
  return { urgent, high, inProgress, supplyShorts };
}

async function loadInspectionSignals(facilityId: string, now: Date) {
  const dueWindowEnd = new Date(now.getTime() + 30 * 60 * 1000);
  const [overdue, dueNow, openFindings] = await Promise.all([
    prisma.inspectionOccurrence.count({
      where: {
        facilityId,
        status: "OPEN",
        dueAt: { lt: now },
      },
    }),
    prisma.inspectionOccurrence.count({
      where: {
        facilityId,
        status: "OPEN",
        dueAt: { gte: now, lte: dueWindowEnd },
      },
    }),
    prisma.task.count({
      where: {
        facilityId,
        sourceType: "INSPECTION_FINDING",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
  ]);
  return { overdue, dueNow, openFindings };
}

/**
 * Builds a compact operational snapshot from authoritative loaders.
 * Callers must sanitize before sending to a model.
 */
export async function buildOperationalSnapshot(
  input: BuildOperationalSnapshotInput,
  options?: { maxSnapshotChars?: number },
): Promise<OperationalSnapshot> {
  const now = input.now ?? new Date();
  const department = (input.departmentContext ?? "DIETARY") as OperationalDepartmentKey;
  const facilityTimezone = await loadFacilityTimezone(prisma, input.facilityId);
  const timeCtx = buildOperationalTimeContext({ now, facilityTimezone });

  const [walk, coverage, callDowns, handoffs, issues, inspections] = await Promise.all([
    loadWalkList(input.facilityId, { activeDepartmentKey: department }),
    loadCoverageList(input.facilityId),
    loadCallDownList(input.facilityId),
    loadHandoffs(input.facilityId, { activeDepartmentKey: department }),
    loadIssueSignals(input.facilityId),
    loadInspectionSignals(input.facilityId, now),
  ]);

  const priorityLocations = walk.items
    .filter((item) => item.status !== "ready")
    .slice(0, 8)
    .map((item) => ({
      unitId: item.unitId,
      name: item.unitName,
      state: toSnapshotState(item.status),
      primaryReason: item.reason,
      signals: buildSignals(item),
      sourcePath: unitWorkspacePath(item.unitId),
    }));

  const handoffRows = handoffs.sections
    .flatMap((section) =>
      section.items.slice(0, 3).map((item) => {
        const isCallDown = item.category === "call_down";
        return {
          type: item.category,
          location: item.unitName ?? "Facility",
          summary: isCallDown
            ? `Open call-down affecting ${item.unitName ?? "a location"}`
            : item.detail || item.title,
          sourcePath: item.primaryHref.startsWith("/") ? item.primaryHref : todaysWorkHandoffsPath(),
        };
      }),
    )
    .slice(0, 6);

  const allowedSourcePaths = Array.from(
    new Set([
      ...priorityLocations.map((l) => l.sourcePath),
      ...handoffRows.map((h) => h.sourcePath),
      todaysWorkWalkPath(),
      todaysWorkCoveragePath(),
      todaysWorkHandoffsPath(),
      staffingPath(),
      inspectionsAdminPath(),
    ]),
  );

  const raw: OperationalSnapshot = {
    generatedAt: now.toISOString(),
    facilityLocalTime: `${timeCtx.facilityLocalDate} ${String(timeCtx.facilityLocal.hour).padStart(2, "0")}:${String(timeCtx.facilityLocal.minute).padStart(2, "0")}`,
    timezone: facilityTimezone,
    serviceDate: timeCtx.facilityLocalDate,
    activeDepartment: department,
    activeOperation: {
      label: walk.operationContext.serviceLabel,
      phase: walk.operationContext.phase,
      scheduledTime: walk.operationContext.scheduledTimeLabel,
      source: "operations_center",
    },
    readiness: {
      ready: walk.summary.ready,
      inProgress: walk.summary.inProgress,
      needsAttention: walk.summary.blocked,
    },
    priorityLocations,
    staffing: {
      gaps: coverage.summary.gaps,
      thinCoverage: coverage.summary.thin,
      openCallDowns: callDowns.summary.open,
    },
    issues,
    inspections,
    handoffs: handoffRows,
    allowedSourcePaths,
  };

  const sanitized = sanitizeOperationalSnapshot(raw);
  return enforceSnapshotSize(sanitized, options?.maxSnapshotChars ?? 12_000);
}

export type { OperationalSnapshot, BuildOperationalSnapshotInput };
