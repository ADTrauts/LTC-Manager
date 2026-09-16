/**
 * Load published Operational Cycles for Log Attachment BUILD UX (labels only — never MealType).
 */

import type { PrismaClient } from "@prisma/client";

import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

export type CycleOptionForLogs = {
  stableKey: string;
  label: string;
};

export async function loadCycleOptionsForDepartment(
  client: PrismaClient,
  facilityId: string,
  departmentId: string,
  now: Date = new Date(),
): Promise<CycleOptionForLogs[]> {
  const timezone = await loadFacilityTimezone(client, facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const cycles = await loadPublishedCyclesForDate(facilityId, departmentId, todayKey, client);
  return cycles
    .map((c) => ({ stableKey: c.stableKey, label: c.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function cycleLabelMap(options: readonly CycleOptionForLogs[]): Map<string, string> {
  return new Map(options.map((o) => [o.stableKey, o.label]));
}
