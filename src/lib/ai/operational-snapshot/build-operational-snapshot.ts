import type { OperationalDepartmentKey } from "@/lib/department-nav";
import {
  buildOperationalTimeContext,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { loadPresenceCallOffs } from "@/lib/scheduling/load-presence-call-offs";

import { loadPublishedOperationWindow } from "./published-window";
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
} from "./source-paths";
import type {
  BuildOperationalSnapshotInput,
  OperationalSnapshot,
} from "./types";

async function loadIssueSignals(facilityId: string) {
  const open = await prisma.repair.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      unit: { facilityId },
    },
    select: {
      priority: true,
      status: true,
    },
  });

  let urgent = 0;
  let high = 0;
  let inProgress = 0;
  for (const row of open) {
    if (row.priority === "URGENT") urgent += 1;
    if (row.priority === "HIGH") high += 1;
    if (row.status === "IN_PROGRESS") inProgress += 1;
  }
  return { urgent, high, inProgress, supplyShorts: 0 };
}

async function loadInspectionSignals(_facilityId: string, _now: Date) {
  return { overdue: 0, dueNow: 0, openFindings: 0 };
}

/**
 * Compact operational snapshot from facts that do not require a session.
 * Leftover dashboard / walk / coverage / computed-readiness loaders are gated off
 * (Phase 6Q). Presence call-offs, open issues, and inspections remain.
 */
export async function buildOperationalSnapshot(
  input: BuildOperationalSnapshotInput,
  options?: { maxSnapshotChars?: number },
): Promise<OperationalSnapshot> {
  const now = input.now ?? new Date();
  const department = (input.departmentContext ?? "DIETARY") as OperationalDepartmentKey;
  const facilityTimezone = await loadFacilityTimezone(prisma, input.facilityId);
  const timeCtx = buildOperationalTimeContext({ now, facilityTimezone });

  const [callOffs, issues, inspections, activeOperation] = await Promise.all([
    loadPresenceCallOffs(input.facilityId),
    loadIssueSignals(input.facilityId),
    loadInspectionSignals(input.facilityId, now),
    loadPublishedOperationWindow({
      facilityId: input.facilityId,
      departmentKey: department === "ALL" ? null : department,
      now,
      timezone: facilityTimezone,
      serviceDate: timeCtx.facilityLocalDate,
    }),
  ]);

  const handoffRows = callOffs.items.slice(0, 6).map((item) => ({
    type: "call_down",
    location: item.oldUnitName ?? item.newUnitName ?? "Facility",
    summary: `${item.employeeName}: ${item.reason}`,
    sourcePath: staffingPath(),
  }));

  const allowedSourcePaths = Array.from(
    new Set([
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
    activeOperation,
    readiness: {
      ready: 0,
      inProgress: 0,
      needsAttention: 0,
    },
    priorityLocations: [],
    staffing: {
      gaps: 0,
      thinCoverage: 0,
      openCallDowns: callOffs.summary.total,
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
