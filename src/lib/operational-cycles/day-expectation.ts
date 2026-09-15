/**
 * Pure helpers for Configured → Adjusted → Actual meal-service timing.
 * expectedToday = adjustedTime ?? configuredTime.
 */

import { getFacilityLocalParts } from "@/lib/operational-time";

import { normalizeConfiguredTime } from "./cycle-scope";

export const DEFAULT_LATE_GRACE_MS = 15 * 60 * 1000;

export type DayMealTiming = {
  expectationId: string;
  unitId: string;
  mealType: string;
  cycleId: string;
  cycleStableKey: string;
  cycleVersion: number;
  cycleLabel: string;
  milestone: string;
  configuredTime: string | null;
  adjustedTime: string | null;
  expectedToday: string | null;
  adjustedAt: Date | null;
  adjustedByLabel?: string | null;
};

export function expectedTodayTime(input: {
  configuredTime: string | null | undefined;
  adjustedTime: string | null | undefined;
}): string | null {
  return input.adjustedTime?.trim() || input.configuredTime?.trim() || null;
}

export function addMinutesToLocalTime(localHhMm: string, minutes: number): string | null {
  const normalized = normalizeConfiguredTime(localHhMm);
  if (!normalized) return null;
  const [hoursRaw, minutesRaw] = normalized.split(":");
  const start = Number(hoursRaw) * 60 + Number(minutesRaw);
  const next = ((start + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const hours = Math.floor(next / 60);
  const mins = next % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function localHhMmFromInstant(date: Date, timeZone: string): string {
  const parts = getFacilityLocalParts(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function formatClock12(localHhMm: string | null | undefined): string | null {
  if (!localHhMm) return null;
  const normalized = normalizeConfiguredTime(localHhMm);
  if (!normalized) return localHhMm;
  const [hoursRaw, minutesRaw] = normalized.split(":");
  const hours = Number(hoursRaw);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutesRaw} ${period}`;
}

export type MealServiceTimingStatus = {
  key:
    | "not_configured"
    | "not_started"
    | "on_time"
    | "started_late"
    | "started";
  label: string;
};

export function describeMealServiceTiming(input: {
  configuredTime: string | null | undefined;
  adjustedTime: string | null | undefined;
  actualLocalHhMm?: string | null;
  lateGraceMs?: number;
}): MealServiceTimingStatus {
  const expected = expectedTodayTime(input);
  if (!expected) {
    return { key: "not_configured", label: "Expected time not configured" };
  }
  if (!input.actualLocalHhMm) {
    return { key: "not_started", label: "Not started" };
  }
  const expectedMin = toMinutes(expected);
  const actualMin = toMinutes(input.actualLocalHhMm);
  if (expectedMin == null || actualMin == null) {
    return { key: "started", label: `Started ${formatClock12(input.actualLocalHhMm)}` };
  }
  const deltaMin = actualMin - expectedMin;
  const graceMin = Math.round((input.lateGraceMs ?? DEFAULT_LATE_GRACE_MS) / 60000);
  const adjustedClock = formatClock12(input.adjustedTime);
  const actualClock = formatClock12(input.actualLocalHhMm);
  if (input.adjustedTime && actualClock) {
    if (deltaMin > graceMin) {
      return {
        key: "started_late",
        label: `Adjusted to ${adjustedClock} · Started ${actualClock}`,
      };
    }
    return {
      key: "on_time",
      label: `Adjusted to ${adjustedClock} · Started ${actualClock}`,
    };
  }
  if (deltaMin > graceMin) {
    return {
      key: "started_late",
      label: `Started ${deltaMin} min late`,
    };
  }
  return { key: "on_time", label: "On time" };
}

function toMinutes(localHhMm: string): number | null {
  const normalized = normalizeConfiguredTime(localHhMm);
  if (!normalized) return null;
  const [h, m] = normalized.split(":");
  return Number(h) * 60 + Number(m);
}

export function timingKey(unitId: string, mealType: string): string {
  return `${unitId}:${mealType}`;
}
