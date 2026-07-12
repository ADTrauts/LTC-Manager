import { resolveFacilityTimezone } from "@/lib/operational-time";

/** Format an instant in the facility timezone for issue detail / history. */
export function formatIssueTimestamp(
  value: Date | string | null | undefined,
  facilityTimezone?: string | null,
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const timeZone = resolveFacilityTimezone(facilityTimezone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
