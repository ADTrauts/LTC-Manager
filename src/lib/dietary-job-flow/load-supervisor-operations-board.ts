/**
 * ONE coherent Supervisor Operations Board server projection (Phase 9B).
 * Composes cycle overview, assignment board pieces, coverage summary, and cheap offline conflict counts.
 * Avoid N+1: batch unit meal events and assignments.
 *
 * Due Soon window: {@link DUE_SOON_MS} (45 minutes before cycle start).
 */

import type { AppJwtPayload } from "@/lib/auth";
import { isDietaryJobFlowEnabled } from "@/lib/feature-flags";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { loadSupervisorCycleOverview } from "@/lib/operational-cycles/load-supervisor-cycle-overview";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { resolveOperationalCycle } from "@/lib/operational-cycles/resolve-operational-cycle";
import type { CycleMilestoneStatusKey } from "@/lib/operational-cycles/milestone-cycle-status";
import { buildDietaryCoverageSummary } from "@/lib/scheduling/operational-assignments/build-coverage-summary";
import { loadAssignmentPlanView } from "@/lib/scheduling/operational-assignments/assignment-plan";
import { loadDailyAssignmentBoard } from "@/lib/scheduling/operational-assignments/load-daily-assignment-board";
import { prisma } from "@/lib/prisma";

import { resolveJobFlowAuthority, requireSupervisorBoard } from "./job-flow-authority";
import {
  DUE_SOON_MS,
  type SupervisorBoardSummaryCounts,
  type SupervisorBoardUnitRow,
  type SupervisorExceptionItem,
  type SupervisorExceptionTemporal,
  type SupervisorOperationsBoard,
} from "./types";

export type LoadSupervisorOperationsBoardInput = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  now?: Date;
};

function temporalForCycle(opts: {
  now: Date;
  startsAt: Date | null;
  isLate: boolean;
  notConfirmed: boolean;
  confirmed: boolean;
}): SupervisorExceptionTemporal {
  if (opts.confirmed) return "Confirmed";
  if (opts.isLate) return "Late";
  if (opts.startsAt) {
    const until = opts.startsAt.getTime() - opts.now.getTime();
    if (until > 0 && until <= DUE_SOON_MS) return "DueSoon";
    if (until > DUE_SOON_MS) return "Upcoming";
    if (opts.notConfirmed) return "NotConfirmed";
    return "Current";
  }
  return opts.notConfirmed ? "NotConfirmed" : "Current";
}

function exceptionRank(
  group: SupervisorExceptionItem["group"],
  temporal: SupervisorExceptionTemporal,
): number {
  const groupBase: Record<SupervisorExceptionItem["group"], number> = {
    Staffing: 100,
    Coverage: 200,
    Readiness: 300,
    ServiceTiming: 400,
    OfflineSync: 500,
    Configuration: 600,
  };
  const temporalBoost: Record<SupervisorExceptionTemporal, number> = {
    Late: 0,
    Current: 10,
    DueSoon: 20,
    NotConfirmed: 30,
    Upcoming: 40,
    Confirmed: 90,
  };
  return groupBase[group] + temporalBoost[temporal];
}

/**
 * Load the Dietary Supervisor Operations Board.
 * Returns null when flag is off; throws when authority is denied.
 */
export async function loadSupervisorOperationsBoard(
  input: LoadSupervisorOperationsBoardInput,
): Promise<SupervisorOperationsBoard | null> {
  if (!isDietaryJobFlowEnabled()) {
    return null;
  }

  const authority = await resolveJobFlowAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  requireSupervisorBoard(authority);

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);

  const [facility, department, plan, cycleOverview, board, cycles, pendingConflicts] =
    await Promise.all([
      prisma.facility.findFirst({
        where: { id: input.facilityId },
        select: { id: true, displayName: true },
      }),
      prisma.department.findFirst({
        where: { id: input.departmentId, facilityId: input.facilityId },
        select: { id: true, name: true },
      }),
      loadAssignmentPlanView(prisma, {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDateKey: operationalDateKey,
      }),
      loadSupervisorCycleOverview({
        session: input.session,
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        now,
      }),
      loadDailyAssignmentBoard({
        facilityId: input.facilityId,
        serviceDate: operationalDateKey,
        departmentId: input.departmentId,
      }),
      loadPublishedCyclesForDate(input.facilityId, input.departmentId, operationalDateKey),
      prisma.offlineConflict.count({
        where: {
          facilityId: input.facilityId,
          resolution: "PENDING",
        },
      }),
    ]);

  if (!facility || !department) {
    throw new Error("Facility or department not found.");
  }

  const assignmentRows = await prisma.operationalAssignment.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate,
      status: { in: ["PLANNED", "ACTIVE"] },
    },
    select: {
      id: true,
      employeeId: true,
      unitId: true,
      unit: { select: { name: true } },
      roleKey: true,
      status: true,
    },
  });

  const scheduledEmployeeIds = board.employees.map((e) => e.id);
  const assignedEmployeeIds = [
    ...new Set(assignmentRows.map((a) => a.employeeId).filter(Boolean)),
  ] as string[];
  const callOffEmployeeIds = board.employees.filter((e) => e.hasCallDown).map((e) => e.id);

  const coverage = await buildDietaryCoverageSummary(prisma, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDateKey: operationalDateKey,
    planStatus: plan?.status ?? null,
    assignments: assignmentRows.map((a) => ({
      unitId: a.unitId,
      unitName: a.unit?.name ?? null,
      roleKey: a.roleKey,
      status: a.status,
      hasCallDown: callOffEmployeeIds.includes(a.employeeId ?? ""),
    })),
    scheduledEmployeeIds,
    assignedEmployeeIds,
    callOffEmployeeIds,
  });

  const deptCycle = resolveOperationalCycle({
    cycles,
    now,
    facilityTimezone: timezone,
    operationalDateKey,
  });

  const currentCycleLabel = deptCycle.state === "ACTIVE" ? deptCycle.primary.label : null;
  const nextCycleLabel =
    deptCycle.state === "ACTIVE"
      ? deptCycle.next?.label ?? null
      : deptCycle.state === "UPCOMING" || deptCycle.state === "BETWEEN"
        ? deptCycle.next.label
        : null;

  const nextCycleStartsAt =
    deptCycle.state === "ACTIVE"
      ? deptCycle.next?.startsAt ?? null
      : deptCycle.state === "UPCOMING" || deptCycle.state === "BETWEEN"
        ? deptCycle.next.startsAt
        : null;

  const dueSoon =
    nextCycleStartsAt != null &&
    nextCycleStartsAt.getTime() - now.getTime() > 0 &&
    nextCycleStartsAt.getTime() - now.getTime() <= DUE_SOON_MS;

  const summary: SupervisorBoardSummaryCounts = {
    scheduled: scheduledEmployeeIds.length,
    assigned: assignedEmployeeIds.length,
    unassigned: Math.max(0, scheduledEmployeeIds.length - assignedEmployeeIds.length),
    callOffs: callOffEmployeeIds.length,
    covered: coverage.covered,
    atRisk: coverage.atRisk,
    uncovered: coverage.uncovered,
    readyConfirmed: cycleOverview.counts.readyConfirmed,
    readyNotConfirmed: cycleOverview.counts.notConfirmed,
    started: cycleOverview.counts.serviceStarted,
    startedLate: cycleOverview.counts.late,
    startedNotConfirmed: cycleOverview.counts.notConfirmed,
    conflicts: pendingConflicts + cycleOverview.counts.startedWithoutReady,
  };

  const exceptions: SupervisorExceptionItem[] = [];
  const assignmentBoardHref = `/staffing/assignments?departmentId=${input.departmentId}`;
  const builderHref = `/admin/departments/${input.departmentId}?tab=cycles`;

  for (const emp of board.employees) {
    if (emp.hasCallDown) {
      const temporal = dueSoon
        ? "DueSoon"
        : temporalForCycle({
            now,
            startsAt: nextCycleStartsAt,
            isLate: false,
            notConfirmed: false,
            confirmed: false,
          });
      exceptions.push({
        group: "Staffing",
        status: "Call-off",
        temporal,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        cycleLabel: nextCycleLabel ?? currentCycleLabel,
        sourceHref: assignmentBoardHref,
        availableActions: ["Open Assignment Board"],
        sortRank: exceptionRank("Staffing", temporal),
      });
    } else if (!assignedEmployeeIds.includes(emp.id)) {
      const temporal = dueSoon
        ? "DueSoon"
        : temporalForCycle({
            now,
            startsAt: nextCycleStartsAt,
            isLate: false,
            notConfirmed: true,
            confirmed: false,
          });
      exceptions.push({
        group: "Staffing",
        status: "Unassigned",
        temporal,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        cycleLabel: nextCycleLabel ?? currentCycleLabel,
        time: dueSoon && nextCycleStartsAt
          ? `${Math.round((nextCycleStartsAt.getTime() - now.getTime()) / 60_000)} min until ${nextCycleLabel ?? "next cycle"}`
          : null,
        sourceHref: assignmentBoardHref,
        availableActions: ["Open Assignment Board"],
        sortRank: exceptionRank("Staffing", temporal),
      });
    }
  }

  for (const row of coverage.rows) {
    if (row.state === "UNCOVERED" || row.state === "AT_RISK") {
      const temporal = dueSoon
        ? "DueSoon"
        : temporalForCycle({
            now,
            startsAt: nextCycleStartsAt,
            isLate: false,
            notConfirmed: row.state === "UNCOVERED",
            confirmed: false,
          });
      exceptions.push({
        group: "Coverage",
        status: row.state === "AT_RISK" ? "At Risk" : "Uncovered",
        temporal,
        unitId: row.unitId,
        unitName: row.unitName,
        cycleLabel: nextCycleLabel ?? currentCycleLabel,
        sourceHref: assignmentBoardHref,
        availableActions: ["Open Assignment Board"],
        sortRank: exceptionRank("Coverage", temporal),
      });
    }
  }

  for (const row of cycleOverview.rows) {
    const statusKey = row.milestoneStatus as CycleMilestoneStatusKey | null;

    if (row.cycleState === "NOT_CONFIGURED") {
      const temporal: SupervisorExceptionTemporal = "NotConfirmed";
      exceptions.push({
        group: "Configuration",
        status: "Missing cycle configuration",
        temporal,
        unitId: row.unitId,
        unitName: row.unitName,
        sourceHref: builderHref,
        availableActions: ["Open Department Builder"],
        sortRank: exceptionRank("Configuration", temporal),
      });
      continue;
    }

    if (statusKey === "READY_NOT_CONFIRMED" || statusKey === "NOT_CONFIRMED") {
      const temporal = temporalForCycle({
        now,
        startsAt: nextCycleStartsAt,
        isLate: false,
        notConfirmed: true,
        confirmed: false,
      });
      exceptions.push({
        group: "Readiness",
        status: "Ready Not Confirmed",
        temporal,
        unitId: row.unitId,
        unitName: row.unitName,
        cycleLabel: row.cycleLabel,
        time: row.mealTargetTime,
        sourceHref: row.workspaceHref,
        availableActions: ["Open Unit Workspace"],
        sortRank: exceptionRank("Readiness", temporal),
      });
    }

    if (statusKey === "SERVICE_STARTED_LATE" || statusKey === "STARTED_WITHOUT_READY") {
      const temporal: SupervisorExceptionTemporal = "Late";
      exceptions.push({
        group: "ServiceTiming",
        status: statusKey === "SERVICE_STARTED_LATE" ? "Started Late" : "Started Without Ready",
        temporal,
        unitId: row.unitId,
        unitName: row.unitName,
        cycleLabel: row.cycleLabel,
        time: row.mealTargetTime,
        sourceHref: row.workspaceHref,
        availableActions: ["Open Unit Workspace", "Review Milestone history"],
        sortRank: exceptionRank("ServiceTiming", temporal),
      });
    }
  }

  if (pendingConflicts > 0) {
    const conflicts = await prisma.offlineConflict.findMany({
      where: { facilityId: input.facilityId, resolution: "PENDING" },
      select: { id: true, unitId: true },
      take: 50,
    });
    const unitIds = [...new Set(conflicts.map((c) => c.unitId))];
    const units = await prisma.unit.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(units.map((u) => [u.id, u.name]));
    for (const c of conflicts) {
      const temporal: SupervisorExceptionTemporal = "Current";
      exceptions.push({
        group: "OfflineSync",
        status: "Conflict review required",
        temporal,
        unitId: c.unitId,
        unitName: nameById.get(c.unitId) ?? null,
        sourceHref: `/unit/${c.unitId}`,
        availableActions: ["Resolve offline conflict"],
        sortRank: exceptionRank("OfflineSync", temporal),
      });
    }
  }

  exceptions.sort(
    (a, b) => a.sortRank - b.sortRank || (a.unitName ?? "").localeCompare(b.unitName ?? ""),
  );

  const viewAllUnits: SupervisorBoardUnitRow[] = cycleOverview.rows.map((row) => {
    const cov = coverage.rows.find((r) => r.unitId === row.unitId);
    return {
      unitId: row.unitId,
      unitName: row.unitName,
      unitType: row.unitType,
      cycleLabel: row.cycleLabel,
      cycleState: row.cycleState,
      mealTargetTime: row.mealTargetTime,
      milestoneLabel: row.milestoneLabel,
      coverageState: cov?.state ?? null,
      workspaceHref: row.workspaceHref,
    };
  });

  return {
    header: {
      facilityId: facility.id,
      facilityName: facility.displayName,
      departmentId: department.id,
      departmentName: department.name,
      operationalDateKey,
      currentCycleLabel,
      nextCycleLabel,
      planStatus: plan?.status ?? null,
      lastUpdated: now.toISOString(),
    },
    summary,
    exceptions,
    viewAllUnits,
  };
}
