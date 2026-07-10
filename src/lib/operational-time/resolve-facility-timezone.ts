/**
 * Facility timezone resolver.
 *
 * Prefers the stored Facility.timezone IANA value when present and valid.
 * Falls back to America/New_York for missing or invalid data.
 */
export const DEFAULT_FACILITY_TIMEZONE = "America/New_York";

export function isValidIanaTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function resolveFacilityTimezone(storedTimezone?: string | null): string {
  const trimmed = storedTimezone?.trim();
  if (!trimmed) {
    return DEFAULT_FACILITY_TIMEZONE;
  }

  if (!isValidIanaTimezone(trimmed)) {
    return DEFAULT_FACILITY_TIMEZONE;
  }

  return trimmed;
}
