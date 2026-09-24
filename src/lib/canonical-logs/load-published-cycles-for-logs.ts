/**
 * Date-effective Operational Cycles for canonical Logs, batched for 14-day history.
 * Reuses cycle window resolution — does not invent Log-specific cycle logic.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { enumerateServiceDateKeys } from "./expectation-history";
import {
  isApplicableWeekday,
  resolveCycleWindowInstants,
} from "@/lib/operational-cycles/cycle-windows";
import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time";

import type { PublishedCycleForLogs } from "./resolve-log-requirements";

type Db = PrismaClient | Prisma.TransactionClient;

type CycleRow = {
  stableKey: string;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function rowCoversDate(row: CycleRow, dateKey: string): boolean {
  const from = toServiceDateKey(row.effectiveFrom);
  const to = row.effectiveTo ? toServiceDateKey(row.effectiveTo) : null;
  return from <= dateKey && (!to || dateKey <= to);
}

function toPublishedCycle(
  row: CycleRow,
  operationalDateKey: string,
  timezone: string,
): PublishedCycleForLogs | null {
  if (!row.startLocal || !row.endLocal) return null;
  const instants = resolveCycleWindowInstants({
    operationalDateKey,
    startLocal: row.startLocal,
    endLocal: row.endLocal,
    overnight: row.overnight,
    facilityTimezone: timezone,
  });
  if (!instants) return null;
  return {
    stableKey: row.stableKey,
    label: row.label,
    startLocal: row.startLocal,
    endLocal: row.endLocal,
    overnight: row.overnight,
    startsAt: instants.startsAt,
    endsAt: instants.endsAt,
  };
}

async function loadCoveringPeriodCycles(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
  fromDateKey: string;
  toDateKey: string;
}): Promise<CycleRow[]> {
  const fromDate = facilityLocalDateToServiceDate(input.fromDateKey);
  const toDate = facilityLocalDateToServiceDate(input.toDateKey);
  return input.client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      nodeKind: "PERIOD",
      effectiveFrom: { lte: toDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: fromDate } }],
      AND: [
        {
          OR: [{ status: "PUBLISHED" }, { status: "RETIRED", effectiveTo: { not: null } }],
        },
      ],
    },
    select: {
      stableKey: true,
      label: true,
      startLocal: true,
      endLocal: true,
      overnight: true,
      applicableDaysOfWeek: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
    orderBy: [{ displaySequence: "asc" }, { stableKey: "asc" }, { id: "asc" }],
  });
}

function cyclesForDate(
  rows: readonly CycleRow[],
  operationalDateKey: string,
  timezone: string,
): PublishedCycleForLogs[] {
  const out: PublishedCycleForLogs[] = [];
  for (const row of rows) {
    if (!rowCoversDate(row, operationalDateKey)) continue;
    if (!isApplicableWeekday(row.applicableDaysOfWeek, operationalDateKey, timezone)) continue;
    const mapped = toPublishedCycle(row, operationalDateKey, timezone);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Today's published/date-effective cycles for one department (weekday-filtered). */
export async function loadPublishedCyclesForLogsOnDate(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
  operationalDateKey: string;
  timezone: string;
}): Promise<PublishedCycleForLogs[]> {
  const rows = await loadCoveringPeriodCycles({
    client: input.client,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    fromDateKey: input.operationalDateKey,
    toDateKey: input.operationalDateKey,
  });
  return cyclesForDate(rows, input.operationalDateKey, input.timezone);
}

/**
 * One query per department for the history window, then in-memory per-date filter.
 * Callers must not loop loadPublishedCyclesForDate per history day.
 */
export async function loadPublishedCyclesForLogsDateRange(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
  fromDateKey: string;
  toDateKey: string;
  timezone: string;
}): Promise<Record<string, PublishedCycleForLogs[]>> {
  const rows = await loadCoveringPeriodCycles({
    client: input.client,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    fromDateKey: input.fromDateKey,
    toDateKey: input.toDateKey,
  });
  const out: Record<string, PublishedCycleForLogs[]> = {};
  for (const dateKey of enumerateServiceDateKeys(input.fromDateKey, input.toDateKey)) {
    out[dateKey] = cyclesForDate(rows, dateKey, input.timezone);
  }
  return out;
}
