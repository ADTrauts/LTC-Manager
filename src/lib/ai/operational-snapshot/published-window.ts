import { formatCycleWindow } from "@/lib/operational-cycles/cycle-display";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import {
  resolveOperationalCycle,
  summarizeActiveCycleContext,
} from "@/lib/operational-cycles/resolve-operational-cycle";
import type { OperationalCycleContext } from "@/lib/operational-cycles/types";
import { prisma } from "@/lib/prisma";

import type { OperationalSnapshotActiveOperation } from "./types";

/**
 * The published Cycle and Phase that are underway, or no window.
 * A later Cycle is not treated as current. Several phases at once stay one Cycle
 * with no single phase.
 */
export function publishedWindowFromCycleContext(
  context: OperationalCycleContext,
): OperationalSnapshotActiveOperation | null {
  if (context.state !== "ACTIVE") return null;

  const { phaseLabels } = summarizeActiveCycleContext(context.activeCycles);
  const roots = [
    ...new Set(context.activeCycles.map((occ) => occ.ancestorLabels[0] ?? occ.label)),
  ];
  if (roots.length === 0) return null;

  const label = roots.length === 1 ? roots[0]! : roots.join(" · ");
  const childPhases = phaseLabels.filter((phase) => phase !== label);
  const phase = childPhases.length === 1 ? childPhases[0]! : null;
  const windowSource = phase
    ? context.activeCycles.find((occ) => occ.depth > 0 && occ.label === phase) ?? null
    : roots.length === 1
      ? context.activeCycles.find((occ) => occ.depth === 0 && occ.label === label) ?? null
      : null;
  const scheduledTime =
    windowSource && windowSource.startLocal.trim() && windowSource.endLocal.trim()
      ? formatCycleWindow(windowSource.startLocal, windowSource.endLocal)
      : null;

  return {
    label,
    phase,
    scheduledTime: scheduledTime === "Key Point" ? null : scheduledTime,
    source: "published_cycle",
  };
}

export async function loadPublishedOperationWindow(input: {
  facilityId: string;
  departmentKey: string | null;
  now: Date;
  timezone: string;
  serviceDate: string;
}): Promise<OperationalSnapshotActiveOperation | null> {
  if (!input.departmentKey || input.departmentKey === "ALL") return null;

  const department = await prisma.department.findFirst({
    where: {
      facilityId: input.facilityId,
      key: input.departmentKey,
      isActive: true,
    },
    select: { id: true },
  });
  if (!department) return null;

  const cycles = await loadPublishedCyclesForDate(
    input.facilityId,
    department.id,
    input.serviceDate,
  );
  return publishedWindowFromCycleContext(
    resolveOperationalCycle({
      cycles,
      now: input.now,
      facilityTimezone: input.timezone,
      operationalDateKey: input.serviceDate,
    }),
  );
}
