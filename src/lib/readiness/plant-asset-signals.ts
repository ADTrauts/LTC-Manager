/**
 * Plant readiness helpers from existing Asset + PreventiveMaintenanceSchedule data.
 *
 * Limitations (documented, not invented):
 * - Asset has no criticality field — OUT_OF_SERVICE is the unavailable signal;
 *   repair priority is used for work-order criticality.
 * - PM schedules have nextDueAt but no separate priority/criticality or
 *   completion log beyond linked PREVENTIVE repairs.
 */

export type PlantAssetRow = {
  id: string;
  unitId: string;
  name: string;
  status: string;
  equipmentType?: string | null;
};

export type PlantPmScheduleRow = {
  id: string;
  name: string;
  nextDueAt: Date;
  asset: {
    unitId: string;
    name: string;
    status: string;
  };
};

export type PlantUnitSignals = {
  outOfServiceAssetCount: number;
  primaryOutOfServiceAssetName: string | null;
  overduePmScheduleCount: number;
  primaryOverduePmName: string | null;
  dueTodayPmScheduleCount: number;
  /** Due-today PM with an IN_PROGRESS or assigned PREVENTIVE work order underway. */
  pmDueTodayUnderwayCount: number;
};

export function emptyPlantUnitSignals(): PlantUnitSignals {
  return {
    outOfServiceAssetCount: 0,
    primaryOutOfServiceAssetName: null,
    overduePmScheduleCount: 0,
    primaryOverduePmName: null,
    dueTodayPmScheduleCount: 0,
    pmDueTodayUnderwayCount: 0,
  };
}

export function groupOutOfServiceAssetsByUnit(assets: PlantAssetRow[]): Map<string, PlantUnitSignals> {
  const byUnit = new Map<string, PlantUnitSignals>();

  for (const asset of assets) {
    if (asset.status !== "OUT_OF_SERVICE") continue;
    const current = byUnit.get(asset.unitId) ?? emptyPlantUnitSignals();
    current.outOfServiceAssetCount += 1;
    if (!current.primaryOutOfServiceAssetName) {
      current.primaryOutOfServiceAssetName = asset.name;
    }
    byUnit.set(asset.unitId, current);
  }

  return byUnit;
}

/**
 * Classify active PM schedules that fall on or before the facility-local today window.
 * Callers must already exclude future (nextDueAt >= windowEnd) schedules in the query.
 */
export function applyPmScheduleSignals(input: {
  byUnit: Map<string, PlantUnitSignals>;
  schedules: PlantPmScheduleRow[];
  now: Date;
  /** Schedules with an open PREVENTIVE repair that is assigned or IN_PROGRESS. */
  underwayScheduleIds: Set<string>;
}): Map<string, PlantUnitSignals> {
  const { byUnit, schedules, now, underwayScheduleIds } = input;

  for (const schedule of schedules) {
    const unitId = schedule.asset.unitId;
    const current = byUnit.get(unitId) ?? emptyPlantUnitSignals();
    const dueAt = schedule.nextDueAt.getTime();
    const overdue = dueAt <= now.getTime();

    if (overdue) {
      current.overduePmScheduleCount += 1;
      if (!current.primaryOverduePmName) {
        current.primaryOverduePmName = schedule.name;
      }
    } else {
      // Still ahead of now but within today's loaded window → due later today.
      current.dueTodayPmScheduleCount += 1;
      if (underwayScheduleIds.has(schedule.id)) {
        current.pmDueTodayUnderwayCount += 1;
      }
    }

    byUnit.set(unitId, current);
  }

  return byUnit;
}

export function plantOutOfServiceReason(assetName: string | null): string {
  return assetName ? `${assetName} needs attention` : "Critical equipment is out of service";
}

export function plantOverduePmReason(scheduleName: string | null): string {
  return scheduleName
    ? `${scheduleName} preventive maintenance is overdue`
    : "Preventive maintenance is overdue";
}

export function plantActiveRepairReason(title: string | null): string {
  return title ? `${title} is in progress` : "Priority repair is being worked";
}
