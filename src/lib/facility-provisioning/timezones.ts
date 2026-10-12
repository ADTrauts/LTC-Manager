export const DEFAULT_FACILITY_TIMEZONE = "America/New_York";

export const FACILITY_TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "America/Toronto",
  "America/Vancouver",
  "UTC",
] as const;

export function isValidFacilityTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if ((FACILITY_TIMEZONE_OPTIONS as readonly string[]).includes(trimmed)) return true;
  try {
    const supported =
      typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [];
    return supported.includes(trimmed);
  } catch {
    return false;
  }
}
