/**
 * Facility timezone resolver.
 *
 * No Facility.timezone column exists yet — do not add a migration in this milestone.
 * Default existing facilities to America/New_York. When a stored timezone is available
 * later, pass it through `resolveFacilityTimezone(stored)` to replace the fallback.
 */
export const DEFAULT_FACILITY_TIMEZONE = "America/New_York";

export function resolveFacilityTimezone(storedTimezone?: string | null): string {
  const trimmed = storedTimezone?.trim();
  if (!trimmed) {
    return DEFAULT_FACILITY_TIMEZONE;
  }

  try {
    // Validate IANA zone; invalid values fall back to the documented default.
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_FACILITY_TIMEZONE;
  }
}
