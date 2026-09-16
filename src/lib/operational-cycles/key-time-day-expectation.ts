/**
 * Pure helpers for generic Key Time Runtime timing (Configured → Adjusted → Actual).
 * No Dietary meal grace — due time is the due time.
 */

import { getFacilityLocalParts } from "@/lib/operational-time";

import { normalizeConfiguredTime } from "./cycle-scope";
import { addMinutesToLocalTime, expectedTodayTime, formatClock12 } from "./day-expectation";

export type KeyTimeDayTiming = {
  expectationId: string;
  spaceId: string;
  spaceName?: string | null;
  facilityRoomTypeName?: string | null;
  unitId?: string | null;
  unitName?: string | null;
  cycleId: string;
  cycleStableKey: string;
  cycleVersion: number;
  cycleLabel: string;
  parentCycleLabel: string | null;
  displayPath: string;
  keyTimeGroupId: string;
  configuredDueLocal: string;
  adjustedDueLocal: string | null;
  expectedToday: string;
  actualDueLocal: string | null;
  completedAt: Date | null;
  adjustedAt: Date | null;
  adjustedByLabel?: string | null;
  completedByLabel?: string | null;
};

export type KeyTimeStatusKey =
  | "upcoming"
  | "due"
  | "overdue"
  | "completed_on_time"
  | "completed_late"
  | "adjusted";

export type KeyTimeStatus = {
  key: KeyTimeStatusKey;
  label: string;
};

export { addMinutesToLocalTime, expectedTodayTime, formatClock12 };

export function expectedKeyTimeToday(input: {
  configuredDueLocal: string | null | undefined;
  adjustedDueLocal?: string | null | undefined;
}): string | null {
  return expectedTodayTime({
    configuredTime: input.configuredDueLocal,
    adjustedTime: input.adjustedDueLocal,
  });
}

function toMinutes(localHhMm: string): number | null {
  const normalized = normalizeConfiguredTime(localHhMm);
  if (!normalized) return null;
  const [h, m] = normalized.split(":");
  return Number(h) * 60 + Number(m);
}

export function localHhMmFromInstant(date: Date, timeZone: string): string {
  const parts = getFacilityLocalParts(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * Generic Key Time status. Does NOT apply the Dietary 15-minute meal grace.
 */
export function describeKeyTimeStatus(input: {
  configuredDueLocal: string;
  adjustedDueLocal?: string | null;
  actualDueLocal?: string | null;
  nowLocalHhMm: string;
}): KeyTimeStatus {
  const expected = expectedKeyTimeToday(input);
  if (!expected) {
    return { key: "upcoming", label: "No due time" };
  }
  const expectedClock = formatClock12(expected);
  const adjustedClock = input.adjustedDueLocal ? formatClock12(input.adjustedDueLocal) : null;

  if (input.actualDueLocal) {
    const expectedMin = toMinutes(expected);
    const actualMin = toMinutes(input.actualDueLocal);
    const actualClock = formatClock12(input.actualDueLocal);
    if (expectedMin == null || actualMin == null || !actualClock) {
      return { key: "completed_on_time", label: `Completed ${actualClock ?? ""}`.trim() };
    }
    const delta = actualMin - expectedMin;
    if (delta > 0) {
      return {
        key: "completed_late",
        label: `Completed ${delta} min late · ${actualClock}`,
      };
    }
    return {
      key: "completed_on_time",
      label: `Completed on time · ${actualClock}`,
    };
  }

  const nowMin = toMinutes(input.nowLocalHhMm);
  const expectedMin = toMinutes(expected);
  if (nowMin == null || expectedMin == null) {
    return {
      key: input.adjustedDueLocal ? "adjusted" : "upcoming",
      label: input.adjustedDueLocal
        ? `Adjusted to ${adjustedClock}`
        : `Due ${expectedClock}`,
    };
  }

  if (nowMin < expectedMin) {
    return {
      key: input.adjustedDueLocal ? "adjusted" : "upcoming",
      label: input.adjustedDueLocal
        ? `Adjusted to ${adjustedClock}`
        : `Due ${expectedClock}`,
    };
  }
  if (nowMin === expectedMin) {
    return {
      key: "due",
      label: input.adjustedDueLocal
        ? `Due now · Adjusted to ${adjustedClock}`
        : "Due now",
    };
  }
  const overdue = nowMin - expectedMin;
  return {
    key: "overdue",
    label: `Overdue ${overdue} min`,
  };
}

export function keyTimeSpaceKey(cycleId: string, spaceId: string): string {
  return `${cycleId}:${spaceId}`;
}

export type KeyTimeGroupSummary = {
  keyTimeGroupId: string;
  cycleId: string;
  cycleLabel: string;
  parentCycleLabel: string | null;
  displayPath: string;
  configuredDueLocal: string;
  expectedToday: string;
  total: number;
  completed: number;
};

/** Derived group progress — never a separate persisted aggregate. */
export function summarizeKeyTimeGroups(
  timings: readonly KeyTimeDayTiming[],
): KeyTimeGroupSummary[] {
  const byGroup = new Map<string, KeyTimeGroupSummary>();
  for (const row of timings) {
    const key = `${row.cycleId}:${row.keyTimeGroupId}:${row.expectedToday}`;
    let summary = byGroup.get(key);
    if (!summary) {
      summary = {
        keyTimeGroupId: row.keyTimeGroupId,
        cycleId: row.cycleId,
        cycleLabel: row.cycleLabel,
        parentCycleLabel: row.parentCycleLabel,
        displayPath: row.displayPath,
        configuredDueLocal: row.configuredDueLocal,
        expectedToday: row.expectedToday,
        total: 0,
        completed: 0,
      };
      byGroup.set(key, summary);
    }
    summary.total += 1;
    if (row.actualDueLocal) summary.completed += 1;
  }
  return [...byGroup.values()].sort((a, b) =>
    a.expectedToday.localeCompare(b.expectedToday) || a.cycleLabel.localeCompare(b.cycleLabel),
  );
}
