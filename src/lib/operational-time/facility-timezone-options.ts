/**
 * Curated IANA timezones for facility administration.
 * Values are stored as-is on Facility.timezone.
 */
export const FACILITY_TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (America/New_York)" },
  { value: "America/Chicago", label: "Central (America/Chicago)" },
  { value: "America/Denver", label: "Mountain (America/Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (America/Los_Angeles)" },
  { value: "America/Phoenix", label: "Arizona (America/Phoenix)" },
  { value: "America/Anchorage", label: "Alaska (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Pacific/Honolulu)" },
] as const;

export type FacilityTimezoneOptionValue = (typeof FACILITY_TIMEZONE_OPTIONS)[number]["value"];

export const FACILITY_TIMEZONE_VALUES: readonly string[] = FACILITY_TIMEZONE_OPTIONS.map(
  (option) => option.value,
);

export function isCuratedFacilityTimezone(value: string): value is FacilityTimezoneOptionValue {
  return (FACILITY_TIMEZONE_VALUES as readonly string[]).includes(value);
}
