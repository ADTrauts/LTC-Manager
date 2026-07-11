import { buildOperationalTimeContext } from "@/lib/operational-time";

import { emptyEvsRoomAreaSignals } from "./evs-room-signals";
import { emptyPlantUnitSignals } from "./plant-asset-signals";
import { resolveReadinessProfile } from "./profiles";
import type { ReadinessSummary, UnitReadiness, UnitReadinessSignals } from "./types";

type OptionalSignalKey =
  | "profileKey"
  | "mealLabel"
  | "primaryUrgentRepairTitle"
  | "primaryHighRepairTitle"
  | "assignedSignificantRepairCount"
  | "unassignedUrgentOrHighCount"
  | "overdueCriticalRepairCount"
  | "normalPriorityOpenRepairCount"
  | "assignedNormalRepairCount"
  | "preventiveMaintenanceInProgressCount"
  | "requiresEvsCoverage"
  | "evsRoomStatus"
  | "evsRoomStatusUpdatedAt"
  | "evsCriticalRoomCondition"
  | "evsDischargePending"
  | "evsActiveCleaning"
  | "evsRoomServiceComplete"
  | "evsRoomStatusPresent"
  | "outOfServiceAssetCount"
  | "primaryOutOfServiceAssetName"
  | "overduePmScheduleCount"
  | "primaryOverduePmName"
  | "dueTodayPmScheduleCount"
  | "pmDueTodayUnderwayCount"
  | "significantActivelyWorkedCount"
  | "urgentNotActivelyWorkedCount"
  | "primarySignificantInProgressTitle";

export type UnitReadinessSignalInput = Omit<UnitReadinessSignals, OptionalSignalKey> &
  Partial<Pick<UnitReadinessSignals, OptionalSignalKey>>;

function normalizeSignals(partial: UnitReadinessSignalInput): UnitReadinessSignals {
  return {
    profileKey: "DIETARY",
    mealLabel: "service",
    primaryUrgentRepairTitle: null,
    primaryHighRepairTitle: null,
    assignedSignificantRepairCount: 0,
    unassignedUrgentOrHighCount: 0,
    overdueCriticalRepairCount: 0,
    normalPriorityOpenRepairCount: 0,
    assignedNormalRepairCount: 0,
    preventiveMaintenanceInProgressCount: 0,
    requiresEvsCoverage: false,
    ...emptyEvsRoomAreaSignals(),
    ...emptyPlantUnitSignals(),
    significantActivelyWorkedCount: 0,
    urgentNotActivelyWorkedCount: 0,
    primarySignificantInProgressTitle: null,
    ...partial,
  };
}

export function computeUnitReadiness(
  rawSignals: UnitReadinessSignalInput,
  options?: {
    now?: Date;
    facilityTimezone?: string | null;
    minutesUntilService?: number | null;
    scheduledStartLocal?: string | null;
  },
): UnitReadiness {
  const signals = normalizeSignals(rawSignals);
  const operationalTime = buildOperationalTimeContext({
    now: options?.now,
    facilityTimezone: options?.facilityTimezone,
    mealType: null,
    mealLabel: signals.mealLabel,
    operationPhase: signals.operationPhase,
    scheduledStartLocal: options?.scheduledStartLocal,
    minutesUntilService: options?.minutesUntilService,
  });

  const profile = resolveReadinessProfile(signals.profileKey);
  const result = profile.evaluate({ signals, operationalTime });

  return {
    unitId: signals.unitId,
    unitName: signals.unitName,
    unitType: signals.unitType,
    state: result.state,
    reason: result.primaryReason,
    reasonCodes: result.contributingSignals.map((item) => item.code),
    profileKey: result.profileKey,
    evaluatedAt: result.evaluatedAt,
  };
}

export function summarizeReadiness(items: UnitReadiness[]): ReadinessSummary {
  let ready = 0;
  let inProgress = 0;
  let blocked = 0;

  for (const item of items) {
    if (item.state === "blocked") blocked += 1;
    else if (item.state === "in_progress") inProgress += 1;
    else ready += 1;
  }

  return { total: items.length, ready, inProgress, blocked };
}
