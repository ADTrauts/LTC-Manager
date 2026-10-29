import { isValidIanaTimezone } from "./resolve-facility-timezone";

export type IanaTimezoneChoice = { value: string; label: string };
export type IanaTimezoneGroup = { region: string; zones: IanaTimezoneChoice[] };

const CURATED_FALLBACK = [
  "UTC",
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
];

const clientGroups = new Map<string, IanaTimezoneGroup[]>();
const serverGroups = new Map<string, IanaTimezoneGroup[]>();

function regionFor(zone: string): string {
  const slash = zone.indexOf("/");
  return slash === -1 ? zone : zone.slice(0, slash);
}

function labelFor(zone: string): string {
  const readable = zone.replaceAll("_", " ");
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortGeneric",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    if (name && name !== zone && name !== readable) return `${readable} (${name})`;
  } catch {
    // An unrecognized zone still needs a visible choice.
  }
  return readable;
}

function supportedZones(): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return CURATED_FALLBACK;
}

function buildGroups(zones: Iterable<string>): IanaTimezoneGroup[] {
  const grouped = new Map<string, IanaTimezoneChoice[]>();
  for (const zone of [...zones].sort((a, b) => a.localeCompare(b))) {
    const region = regionFor(zone);
    const choices = grouped.get(region) ?? [];
    choices.push({ value: zone, label: labelFor(zone) });
    grouped.set(region, choices);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, choices]) => ({ region, zones: choices }));
}

/** Full IANA list for a browser control. Cached so a subscribed snapshot stays stable. */
export function listIanaTimezoneGroups(current?: string | null): IanaTimezoneGroup[] {
  const extra = current?.trim() ?? "";
  const key = extra || "__none__";
  const cached = clientGroups.get(key);
  if (cached) return cached;
  const zones = new Set(supportedZones());
  zones.add("UTC");
  if (extra && isValidIanaTimezone(extra)) zones.add(extra);
  const groups = buildGroups(zones);
  clientGroups.set(key, groups);
  return groups;
}

/** Server render keeps the saved zone only, so the browser list cannot mismatch hydration. */
export function savedTimezoneGroup(current: string): IanaTimezoneGroup[] {
  const zone = current.trim() || "UTC";
  const cached = serverGroups.get(zone);
  if (cached) return cached;
  const groups = [{ region: regionFor(zone), zones: [{ value: zone, label: labelFor(zone) }] }];
  serverGroups.set(zone, groups);
  return groups;
}
