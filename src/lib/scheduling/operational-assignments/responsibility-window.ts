import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStart,
  resolveFacilityTimezone,
} from "@/lib/operational-time";

/**
 * Parse HH:MM against a facility-local operational date into a UTC Date.
 * Does not use the browser timezone.
 */
export function parseAssignmentWindowInstant(
  serviceDateKey: string,
  timeLocal: string | null | undefined,
  facilityTimezone: string | null | undefined,
): Date | null {
  if (!timeLocal?.trim()) return null;
  const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);
  // Use noon UTC of the service date as the "now" probe so DST offset matches that civil day.
  const probe = new Date(
    Date.UTC(serviceDate.getUTCFullYear(), serviceDate.getUTCMonth(), serviceDate.getUTCDate(), 12, 0, 0, 0),
  );
  return parseFacilityLocalScheduledStart(
    timeLocal,
    probe,
    resolveFacilityTimezone(facilityTimezone),
  );
}

export function assertValidResponsibilityWindow(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
    throw new Error("Assignment start time must be before end time.");
  }
}

/** True when two active windows overlap (null bounds treated as full-day). */
export function responsibilityWindowsOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
