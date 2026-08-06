import type { AppJwtPayload } from "@/lib/auth";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { resolveCycleAuthority } from "./cycle-authority";
import { loadPublishedCyclesForDate } from "./load-published-cycles";
import { loadSupervisorCycleOverview } from "./load-supervisor-cycle-overview";
import { resolveOperationalCycle } from "./resolve-operational-cycle";

export type GmCycleSummary = {
  facilityId: string;
  departmentId: string;
  operationalDateKey: string;
  currentLabel: string | null;
  nextLabel: string | null;
  readiness: {
    readyConfirmed: number;
    serviceStarted: number;
    notConfirmed: number;
    late: number;
    missingConfig: number;
  };
};

/**
 * Light GM summary — current/next cycle label plus readiness counts.
 * Does not redesign the GM dashboard.
 */
export async function loadGmCycleSummary(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  now?: Date;
}): Promise<GmCycleSummary | null> {
  const authority = await resolveCycleAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canViewRuntime) {
    return null;
  }

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));

  const cycles = await loadPublishedCyclesForDate(
    input.facilityId,
    input.departmentId,
    operationalDateKey,
  );

  const context = resolveOperationalCycle({
    cycles,
    now,
    facilityTimezone: timezone,
    operationalDateKey,
  });

  let currentLabel: string | null = null;
  let nextLabel: string | null = null;
  switch (context.state) {
    case "ACTIVE":
      currentLabel = context.primary.label;
      nextLabel = context.next?.label ?? null;
      break;
    case "UPCOMING":
      nextLabel = context.next.label;
      break;
    case "BETWEEN":
      currentLabel = context.previous.label;
      nextLabel = context.next.label;
      break;
    case "DAY_COMPLETE":
      currentLabel = context.last.label;
      break;
    default:
      break;
  }

  const overview = await loadSupervisorCycleOverview({
    session: input.session,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    now,
  });

  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    operationalDateKey,
    currentLabel,
    nextLabel,
    readiness: {
      readyConfirmed: overview.counts.readyConfirmed,
      serviceStarted: overview.counts.serviceStarted,
      notConfirmed: overview.counts.notConfirmed,
      late: overview.counts.late,
      missingConfig: overview.counts.missingConfig,
    },
  };
}
