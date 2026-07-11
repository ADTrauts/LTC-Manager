import type { RoomAreaOperationalStatus } from "@prisma/client";

/**
 * Room/area statuses that represent critical incomplete EVS service for the current day.
 * These drive Needs Attention unless work is clearly assigned and underway.
 */
export const EVS_CRITICAL_ROOM_STATUSES: readonly RoomAreaOperationalStatus[] = [
  "ISOLATION",
  "TERMINAL_CLEAN_PENDING",
] as const;

/** Discharge turnover is a high-priority current-service commitment. */
export const EVS_DISCHARGE_ROOM_STATUS: RoomAreaOperationalStatus = "DISCHARGE";

/** Dirty means cleaning/service is still in the active work cycle. */
export const EVS_ACTIVE_CLEANING_ROOM_STATUS: RoomAreaOperationalStatus = "DIRTY";

/** Complete for current EVS service commitment. */
export const EVS_COMPLETE_ROOM_STATUSES: readonly RoomAreaOperationalStatus[] = [
  "CLEAN",
  "OCCUPIED",
] as const;

export type EvsRoomAreaStatusRow = {
  unitId: string;
  status: RoomAreaOperationalStatus;
  notes?: string | null;
  updatedAt?: Date | null;
  statusDate?: Date;
};

export type EvsRoomAreaSignals = {
  evsRoomStatus: RoomAreaOperationalStatus | null;
  evsRoomStatusUpdatedAt: Date | null;
  /** Isolation or terminal clean pending for the facility-local service date. */
  evsCriticalRoomCondition: boolean;
  /** Discharge clean still open for the facility-local service date. */
  evsDischargePending: boolean;
  /** Area marked dirty — cleaning cycle in progress. */
  evsActiveCleaning: boolean;
  /** CLEAN/OCCUPIED for the current service date. */
  evsRoomServiceComplete: boolean;
  /** True when a RoomAreaStatus row exists for the current service date. */
  evsRoomStatusPresent: boolean;
};

export function emptyEvsRoomAreaSignals(): EvsRoomAreaSignals {
  return {
    evsRoomStatus: null,
    evsRoomStatusUpdatedAt: null,
    evsCriticalRoomCondition: false,
    evsDischargePending: false,
    evsActiveCleaning: false,
    evsRoomServiceComplete: false,
    evsRoomStatusPresent: false,
  };
}

export function deriveEvsRoomAreaSignals(
  row: EvsRoomAreaStatusRow | null | undefined,
): EvsRoomAreaSignals {
  if (!row) {
    return emptyEvsRoomAreaSignals();
  }

  const status = row.status;
  return {
    evsRoomStatus: status,
    evsRoomStatusUpdatedAt: row.updatedAt ?? null,
    evsCriticalRoomCondition: (EVS_CRITICAL_ROOM_STATUSES as readonly string[]).includes(status),
    evsDischargePending: status === EVS_DISCHARGE_ROOM_STATUS,
    evsActiveCleaning: status === EVS_ACTIVE_CLEANING_ROOM_STATUS,
    evsRoomServiceComplete: (EVS_COMPLETE_ROOM_STATUSES as readonly string[]).includes(status),
    evsRoomStatusPresent: true,
  };
}

export function groupEvsRoomAreaSignalsByUnit(
  rows: EvsRoomAreaStatusRow[],
): Map<string, EvsRoomAreaSignals> {
  const byUnit = new Map<string, EvsRoomAreaSignals>();
  for (const row of rows) {
    byUnit.set(row.unitId, deriveEvsRoomAreaSignals(row));
  }
  return byUnit;
}

export function evsCriticalRoomReason(status: RoomAreaOperationalStatus | null): string {
  if (status === "ISOLATION") return "Isolation cleaning needs attention";
  if (status === "TERMINAL_CLEAN_PENDING") return "Terminal cleaning needs attention";
  if (status === "DISCHARGE") return "Discharge cleaning needs attention";
  return "Priority EVS room condition needs attention";
}

export function evsActiveRoomReason(status: RoomAreaOperationalStatus | null): string {
  if (status === "DISCHARGE") return "Discharge cleaning is in progress";
  if (status === "DIRTY") return "Current cleaning is in progress";
  return "EVS service is in progress";
}
