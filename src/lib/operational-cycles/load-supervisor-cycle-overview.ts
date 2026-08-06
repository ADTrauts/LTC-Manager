import type { AppJwtPayload } from "@/lib/auth";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  parseFacilityLocalScheduledStart,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { resolveCycleAuthority } from "./cycle-authority";
import { loadPublishedCyclesForDate } from "./load-published-cycles";
import {
  cycleMilestoneStatusLabel,
  resolveCycleMilestoneStatus,
  type CycleMilestoneStatusKey,
} from "./milestone-cycle-status";
import { resolveOperationalCycle } from "./resolve-operational-cycle";

export type SupervisorUnitCycleRow = {
  unitId: string;
  unitName: string;
  unitType: string;
  cycleState: string;
  cycleLabel: string | null;
  mealType: string | null;
  mealTargetTime: string | null;
  milestoneStatus: CycleMilestoneStatusKey | null;
  milestoneLabel: string | null;
  exceptionRank: number;
  workspaceHref: string;
  assignmentBoardHref: string;
  builderHref: string;
};

export type SupervisorCycleOverview = {
  facilityId: string;
  departmentId: string;
  operationalDateKey: string;
  rows: SupervisorUnitCycleRow[];
  counts: {
    readyConfirmed: number;
    serviceStarted: number;
    notConfirmed: number;
    late: number;
    missingConfig: number;
    startedWithoutReady: number;
  };
};

const EXCEPTION_RANK: Record<string, number> = {
  CONFLICT_REVIEW: 10,
  STARTED_WITHOUT_READY: 20,
  SERVICE_STARTED_LATE: 30,
  NOT_CONFIRMED: 40,
  READY_NOT_CONFIRMED: 40,
  missing_config: 50,
  CORRECTED: 60,
  READY_CONFIRMED: 80,
  SERVICE_STARTED: 90,
};

/**
 * Supervisor overview across Dietary serverys — exception-first ordering.
 * Links to unit workspace, assignment board, and department builder.
 */
export async function loadSupervisorCycleOverview(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  now?: Date;
}): Promise<SupervisorCycleOverview> {
  const authority = await resolveCycleAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canViewRuntime) {
    throw new Error(authority.reason ?? "Insufficient Operational Cycle authority.");
  }

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);

  const cycles = await loadPublishedCyclesForDate(
    input.facilityId,
    input.departmentId,
    operationalDateKey,
  );

  const units = await prisma.unit.findMany({
    where: {
      facilityId: input.facilityId,
      isActive: true,
      unitType: { in: ["SERVERY", "KITCHEN"] },
      departmentResponsibilities: {
        some: { departmentId: input.departmentId },
      },
    },
    select: {
      id: true,
      name: true,
      unitType: true,
      mealTimes: {
        where: { isActive: true },
        select: { mealType: true, scheduledTime: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const events = await prisma.serveryMealServiceEvent.findMany({
    where: {
      serviceDate,
      unitId: { in: units.map((u) => u.id) },
    },
    select: {
      unitId: true,
      mealType: true,
      mealServiceReadyAt: true,
      mealServiceStartedAt: true,
      entries: {
        where: { kind: "CORRECTION" },
        select: { id: true },
        take: 1,
      },
    },
  });

  const eventByUnitMeal = new Map(
    events.map((e) => [`${e.unitId}:${e.mealType}`, e] as const),
  );

  const counts = {
    readyConfirmed: 0,
    serviceStarted: 0,
    notConfirmed: 0,
    late: 0,
    missingConfig: 0,
    startedWithoutReady: 0,
  };

  const rows: SupervisorUnitCycleRow[] = [];

  for (const unit of units) {
    const context = resolveOperationalCycle({
      cycles,
      now,
      facilityTimezone: timezone,
      operationalDateKey,
      unit: { id: unit.id, unitType: unit.unitType },
      mealTargets: unit.mealTimes,
    });

    let cycleLabel: string | null = null;
    let mealType: string | null = null;
    let mealTargetTime: string | null = null;
    let milestoneStatus: CycleMilestoneStatusKey | null = null;
    let milestoneLabel: string | null = null;
    let exceptionKey = "ok";

    if (context.state === "NOT_CONFIGURED") {
      counts.missingConfig += 1;
      exceptionKey = "missing_config";
    } else if (context.state === "NOT_APPLICABLE") {
      exceptionKey = "ok";
    } else {
      const activeOrNext =
        context.state === "ACTIVE"
          ? context.primary
          : context.state === "UPCOMING" || context.state === "BETWEEN"
            ? context.next
            : context.last;
      cycleLabel = activeOrNext.label;
      mealType = activeOrNext.mealType;
      mealTargetTime =
        context.state === "DAY_COMPLETE"
          ? context.mealTargetTime
          : context.mealTargetTime;

      if (activeOrNext.cycleType === "SERVICE" && activeOrNext.mealType) {
        const event = eventByUnitMeal.get(`${unit.id}:${activeOrNext.mealType}`) ?? null;
        const targetTime =
          unit.mealTimes.find((m) => m.mealType === activeOrNext.mealType)?.scheduledTime ??
          null;
        const mealTargetAt = targetTime
          ? parseFacilityLocalScheduledStart(targetTime, now, timezone)
          : null;

        const status = resolveCycleMilestoneStatus({
          event: event
            ? {
                mealType: event.mealType,
                mealServiceReadyAt: event.mealServiceReadyAt,
                mealServiceStartedAt: event.mealServiceStartedAt,
                hasCorrection: event.entries.length > 0,
              }
            : null,
          expectedMilestones: activeOrNext.expectedMilestones,
          mealTargetAt,
          now,
        });
        milestoneStatus = status.key;
        milestoneLabel = cycleMilestoneStatusLabel(status.key);
        exceptionKey = status.key;

        switch (status.key) {
          case "READY_CONFIRMED":
            counts.readyConfirmed += 1;
            break;
          case "SERVICE_STARTED":
            counts.serviceStarted += 1;
            break;
          case "SERVICE_STARTED_LATE":
            counts.late += 1;
            break;
          case "STARTED_WITHOUT_READY":
            counts.startedWithoutReady += 1;
            break;
          case "NOT_CONFIRMED":
          case "READY_NOT_CONFIRMED":
            counts.notConfirmed += 1;
            break;
          default:
            break;
        }
      }
    }

    rows.push({
      unitId: unit.id,
      unitName: unit.name,
      unitType: unit.unitType,
      cycleState: context.state,
      cycleLabel,
      mealType,
      mealTargetTime,
      milestoneStatus,
      milestoneLabel,
      exceptionRank: EXCEPTION_RANK[exceptionKey] ?? 100,
      workspaceHref: `/unit/${unit.id}`,
      assignmentBoardHref: `/staffing/assignments?departmentId=${input.departmentId}`,
      builderHref: `/admin/departments/${input.departmentId}?tab=cycles`,
    });
  }

  rows.sort(
    (a, b) => a.exceptionRank - b.exceptionRank || a.unitName.localeCompare(b.unitName),
  );

  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    operationalDateKey,
    rows,
    counts,
  };
}
