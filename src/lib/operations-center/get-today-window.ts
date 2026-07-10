import { getFacilityLocalTodayWindow } from "@/lib/operational-time";

export type TodayWindow = {
  start: Date;
  end: Date;
};

/**
 * Facility-local midnight through next midnight for service-date scoped queries.
 * Defaults to America/New_York when timezone is omitted/invalid.
 */
export function getTodayWindow(
  referenceDate: Date = new Date(),
  facilityTimezone?: string | null,
): TodayWindow {
  return getFacilityLocalTodayWindow(facilityTimezone, referenceDate);
}
