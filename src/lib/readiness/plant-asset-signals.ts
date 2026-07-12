/**
 * Plant readiness helpers from Asset + PreventiveMaintenanceSchedule data.
 *
 * Asset.criticality (CRITICAL | IMPORTANT | ROUTINE) distinguishes operational
 * essential equipment from routine assets. Existing assets default to ROUTINE.
 * Do not invent criticality from asset names.
 */

import type { AssetCriticalityValue } from "@/lib/asset-criticality";
import { normalizeAssetCriticality } from "@/lib/asset-criticality";

export type PlantAssetRow = {
  id: string;
  unitId: string;
  name: string;
  status: string;
  criticality?: string | null;
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
    criticality?: string | null;
  };
};

export type PlantOpenRepairRow = {
  id: string;
  unitId?: string;
  assetId?: string | null;
  priority: string;
  status?: string | null;
  assignedEmployeeId?: string | null;
  dueAt?: Date | null;
};

export type PlantUnitSignals = {
  /** All OUT_OF_SERVICE assets on the unit (any criticality). */
  outOfServiceAssetCount: number;
  criticalOutOfServiceCount: number;
  primaryCriticalOutOfServiceName: string | null;
  importantOutOfServiceCount: number;
  primaryImportantOutOfServiceName: string | null;
  /** IMPORTANT OOS with assigned / IN_PROGRESS work. */
  importantOutOfServiceAddressedCount: number;
  /** IMPORTANT OOS with no active work, or unassigned/overdue significant repair. */
  importantOutOfServiceUnaddressedCount: number;
  routineOutOfServiceCount: number;
  /** Overdue PM on CRITICAL assets only (drives Needs Attention). */
  overdueCriticalPmCount: number;
  primaryOverdueCriticalPmName: string | null;
  overdueImportantPmCount: number;
  overdueRoutinePmCount: number;
  /** Due later today (not overdue) on any criticality. */
  dueTodayPmScheduleCount: number;
  /** Due-today PM underway on CRITICAL or IMPORTANT assets. */
  pmDueTodayUnderwayElevatedCount: number;
};

export function emptyPlantUnitSignals(): PlantUnitSignals {
  return {
    outOfServiceAssetCount: 0,
    criticalOutOfServiceCount: 0,
    primaryCriticalOutOfServiceName: null,
    importantOutOfServiceCount: 0,
    primaryImportantOutOfServiceName: null,
    importantOutOfServiceAddressedCount: 0,
    importantOutOfServiceUnaddressedCount: 0,
    routineOutOfServiceCount: 0,
    overdueCriticalPmCount: 0,
    primaryOverdueCriticalPmName: null,
    overdueImportantPmCount: 0,
    overdueRoutinePmCount: 0,
    dueTodayPmScheduleCount: 0,
    pmDueTodayUnderwayElevatedCount: 0,
  };
}

function criticalityOf(value: string | null | undefined): AssetCriticalityValue {
  return normalizeAssetCriticality(value);
}

export function groupOutOfServiceAssetsByUnit(
  assets: PlantAssetRow[],
  openRepairs: PlantOpenRepairRow[] = [],
  now: Date = new Date(),
): Map<string, PlantUnitSignals> {
  const byUnit = new Map<string, PlantUnitSignals>();
  const repairsByAssetId = new Map<string, PlantOpenRepairRow[]>();
  for (const repair of openRepairs) {
    if (!repair.assetId) continue;
    const list = repairsByAssetId.get(repair.assetId) ?? [];
    list.push(repair);
    repairsByAssetId.set(repair.assetId, list);
  }

  for (const asset of assets) {
    if (asset.status !== "OUT_OF_SERVICE") continue;
    const current = byUnit.get(asset.unitId) ?? emptyPlantUnitSignals();
    current.outOfServiceAssetCount += 1;
    const criticality = criticalityOf(asset.criticality);

    if (criticality === "CRITICAL") {
      current.criticalOutOfServiceCount += 1;
      if (!current.primaryCriticalOutOfServiceName) {
        current.primaryCriticalOutOfServiceName = asset.name;
      }
    } else if (criticality === "IMPORTANT") {
      current.importantOutOfServiceCount += 1;
      if (!current.primaryImportantOutOfServiceName) {
        current.primaryImportantOutOfServiceName = asset.name;
      }
      const related = repairsByAssetId.get(asset.id) ?? [];
      const hasBlockingRepair = related.some((repair) => {
        const significant = repair.priority === "URGENT" || repair.priority === "HIGH";
        const unassigned = !repair.assignedEmployeeId;
        const overdue = Boolean(repair.dueAt && repair.dueAt.getTime() <= now.getTime());
        return significant && (unassigned || overdue);
      });
      const hasActiveWork = related.some(
        (repair) => Boolean(repair.assignedEmployeeId) || repair.status === "IN_PROGRESS",
      );

      if (hasBlockingRepair || !hasActiveWork) {
        current.importantOutOfServiceUnaddressedCount += 1;
      } else {
        current.importantOutOfServiceAddressedCount += 1;
      }
    } else {
      current.routineOutOfServiceCount += 1;
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
    const criticality = criticalityOf(schedule.asset.criticality);
    const underway = underwayScheduleIds.has(schedule.id);

    if (overdue) {
      if (criticality === "CRITICAL") {
        current.overdueCriticalPmCount += 1;
        if (!current.primaryOverdueCriticalPmName) {
          current.primaryOverdueCriticalPmName = schedule.name;
        }
      } else if (criticality === "IMPORTANT") {
        current.overdueImportantPmCount += 1;
        if (underway) {
          current.pmDueTodayUnderwayElevatedCount += 1;
        }
      } else {
        current.overdueRoutinePmCount += 1;
      }
    } else {
      current.dueTodayPmScheduleCount += 1;
      if (underway && (criticality === "CRITICAL" || criticality === "IMPORTANT")) {
        current.pmDueTodayUnderwayElevatedCount += 1;
      }
    }

    byUnit.set(unitId, current);
  }

  return byUnit;
}

export function plantOutOfServiceReason(assetName: string | null): string {
  return assetName ? `${assetName} needs attention` : "Critical equipment is out of service";
}

export function plantOutOfServiceAddressedReason(assetName: string | null): string {
  return assetName
    ? `${assetName} is being addressed`
    : "Important equipment outage is being addressed";
}

export function plantOverduePmReason(scheduleName: string | null): string {
  return scheduleName
    ? `${scheduleName} preventive maintenance is overdue`
    : "Preventive maintenance is overdue";
}

export function plantActiveRepairReason(title: string | null): string {
  return title ? `${title} is in progress` : "Priority repair is being worked";
}
