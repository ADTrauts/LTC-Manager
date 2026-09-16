/**
 * User-facing operational type helpers.
 * Persistence remains DepartmentRoomArchetype (profile-scoped). No SpaceType writes.
 */

import type { DepartmentActionableLocation } from "./department-locations";

export function operationalTypeKeyFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (!slug) return "type";
  if (!/^[a-z]/.test(slug)) return `type_${slug}`.slice(0, 64);
  return slug;
}

export function uniqueOperationalTypeKey(
  name: string,
  existingKeys: readonly string[],
): string {
  const taken = new Set(existingKeys);
  const base = operationalTypeKeyFromName(name);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `_${n}`;
    const key = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
    if (!taken.has(key)) return key;
  }
  return `${base.slice(0, 56)}_${Date.now().toString(36)}`.slice(0, 64);
}

export function locationConfigurationLabel(location: DepartmentActionableLocation): string | null {
  if (location.kind !== "room") return null;
  if (location.hasOverrides && location.patternLabel) {
    return `Custom · ${location.patternLabel}`;
  }
  if (location.hasOverrides) return "Custom";
  if (location.hasPattern && location.patternLabel) {
    return location.patternLabel;
  }
  return null;
}

export type OperationalTypeGroup = {
  patternKey: string | null;
  label: string;
  rooms: DepartmentActionableLocation[];
};

/** Secondary projection — rooms only. Neighborhoods stay in the By location hierarchy. */
export function groupRoomsByOperationalType(
  locations: readonly DepartmentActionableLocation[],
): OperationalTypeGroup[] {
  const rooms = locations.filter((l) => l.kind === "room");
  const order: string[] = [];
  const byKey = new Map<string, OperationalTypeGroup>();

  for (const room of rooms) {
    const key = room.patternKey ?? "__none__";
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, {
        patternKey: room.patternKey,
        label: room.patternLabel ?? "No operational type",
        rooms: [],
      });
    }
    byKey.get(key)!.rooms.push(room);
  }

  const named = order.filter((key) => key !== "__none__");
  const none = order.includes("__none__") ? ["__none__"] : [];
  return [...named, ...none].map((key) => byKey.get(key)!);
}
