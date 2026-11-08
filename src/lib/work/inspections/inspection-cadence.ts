import type { InspectionCadenceType } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  toServiceDateKey,
} from "@/lib/operational-time";

export type InspectionCadenceInput = {
  cadenceType: InspectionCadenceType;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  activeFrom?: Date | null;
  activeUntil?: Date | null;
};

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** UTC weekday for a @db.Date / serviceDate value (civil YYYY-MM-DD stored as UTC midnight). */
export function serviceDateWeekday(serviceDate: Date): number {
  return serviceDate.getUTCDay();
}

export function serviceDateDayOfMonth(serviceDate: Date): number {
  return serviceDate.getUTCDate();
}

export function lastDayOfMonthUtc(serviceDate: Date): number {
  const year = serviceDate.getUTCFullYear();
  const month = serviceDate.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function isWithinActiveWindow(
  serviceDate: Date,
  activeFrom?: Date | null,
  activeUntil?: Date | null,
): boolean {
  const key = toServiceDateKey(serviceDate);
  if (activeFrom && key < toServiceDateKey(activeFrom)) return false;
  if (activeUntil && key > toServiceDateKey(activeUntil)) return false;
  return true;
}

export function doesCadenceMatchServiceDate(
  cadence: InspectionCadenceInput,
  serviceDate: Date,
): boolean {
  if (cadence.cadenceType === "ON_DEMAND") return false;
  if (!isWithinActiveWindow(serviceDate, cadence.activeFrom, cadence.activeUntil)) {
    return false;
  }

  if (cadence.cadenceType === "DAILY") return true;

  if (cadence.cadenceType === "WEEKLY") {
    const days = (cadence.daysOfWeek ?? []).filter((d) => d >= 0 && d <= 6);
    if (days.length === 0) return false;
    return days.includes(serviceDateWeekday(serviceDate));
  }

  if (cadence.cadenceType === "MONTHLY") {
    const target = cadence.dayOfMonth;
    if (!target || target < 1 || target > 31) return false;
    const dim = lastDayOfMonthUtc(serviceDate);
    const effectiveDay = Math.min(target, dim);
    return serviceDateDayOfMonth(serviceDate) === effectiveDay;
  }

  return false;
}

export function iterateServiceDatesInclusive(from: Date, through: Date): Date[] {
  const startKey = toServiceDateKey(from);
  const endKey = toServiceDateKey(through);
  if (startKey > endKey) return [];

  const dates: Date[] = [];
  let cursor = facilityLocalDateToServiceDate(startKey);
  const end = facilityLocalDateToServiceDate(endKey);
  while (toServiceDateKey(cursor) <= toServiceDateKey(end)) {
    dates.push(cursor);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1));
  }
  return dates;
}

export function formatDueTimeLabel(dueTimeLocal: string | null | undefined): string {
  const raw = (dueTimeLocal ?? "09:00").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return raw;
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${suffix}`;
}

export function buildInspectionScheduleSummary(input: {
  cadenceType: InspectionCadenceType;
  dueTimeLocal?: string | null;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
}): string {
  if (input.cadenceType === "ON_DEMAND") return "On demand";

  const timeLabel = formatDueTimeLabel(input.dueTimeLocal);

  if (input.cadenceType === "DAILY") {
    return `Daily at ${timeLabel}`;
  }

  if (input.cadenceType === "WEEKLY") {
    const days = [...new Set((input.daysOfWeek ?? []).filter((d) => d >= 0 && d <= 6))].sort(
      (a, b) => a - b,
    );
    if (days.length === 0) return `Weekly at ${timeLabel}`;
    const labels = days.map((d) => WEEKDAY_LABELS[d]!);
    if (labels.length === 1) return `Every ${labels[0]} at ${timeLabel}`;
    if (labels.length === 2) return `Every ${labels[0]} and ${labels[1]} at ${timeLabel}`;
    return `Every ${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]} at ${timeLabel}`;
  }

  if (input.cadenceType === "MONTHLY") {
    const day = input.dayOfMonth && input.dayOfMonth >= 1 ? input.dayOfMonth : 1;
    return `Monthly on day ${day} at ${timeLabel}`;
  }

  return "On demand";
}
