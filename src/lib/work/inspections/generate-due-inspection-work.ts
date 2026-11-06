import type { PrismaClient } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { TaskSyncDeps } from "@/lib/work/run-guarded-task-sync";

export type GenerateDueInspectionWorkInput = {
  facilityId: string;
  /** Facility-local YYYY-MM-DD or @db.Date. Defaults to facility-local today. */
  date?: Date | string;
  /** Inclusive end local date. Defaults to `date`. */
  throughDate?: Date | string;
  facilityTimezone?: string | null;
  now?: Date;
};

export type GenerateDueInspectionWorkResult = {
  facilityId: string;
  fromServiceDate: string;
  throughServiceDate: string;
  definitionsConsidered: number;
  occurrencesCreated: number;
  occurrencesExisting: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksSkipped: number;
};

export type GenerateDueInspectionWorkDb = Pick<PrismaClient, "facility">;

function toServiceDate(value: Date | string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  if (typeof value === "string") return facilityLocalDateToServiceDate(value);
  return facilityLocalDateToServiceDate(toServiceDateKey(value));
}

export function buildScheduledInspectionTaskInput(input: {
  occurrenceId: string;
  facilityId: string;
  departmentId: string | null;
  unitId: string | null;
  definitionName: string;
  description: string | null;
  cadenceSummary: string;
  dueAt: Date;
  unitName?: string | null;
}) {
  const locationLine = input.unitName ? `Location: ${input.unitName}` : null;
  const description = [
    locationLine,
    `Schedule: ${input.cadenceSummary}`,
    input.description ? `Instructions: ${input.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId: input.unitId,
    operationInstanceId: null as string | null,
    type: "INSPECTION" as const,
    title: input.definitionName,
    description: description || null,
    status: "OPEN" as const,
    priority: "MEDIUM" as const,
    dueAt: input.dueAt,
    completedAt: null as Date | null,
    assignedEmployeeId: null as string | null,
    sourceType: "INSPECTION_OCCURRENCE" as const,
    sourceId: input.occurrenceId,
  };
}

/**
 * Due inspections are Catalog Records. This generator no longer creates
 * inspection occurrences or tasks. Historical rows stay until the table drop.
 */
export async function generateDueInspectionWork(
  input: GenerateDueInspectionWorkInput,
  deps: TaskSyncDeps & { db?: GenerateDueInspectionWorkDb } = {},
): Promise<GenerateDueInspectionWorkResult> {
  const db = deps.db ?? defaultPrisma;
  const now = input.now ?? new Date();
  const facilityTimezone =
    input.facilityTimezone ?? (await loadFacilityTimezone(db, input.facilityId));
  const today = getFacilityServiceDate(facilityTimezone, now);
  const fromServiceDate = toServiceDate(input.date, today);
  const throughServiceDate = toServiceDate(input.throughDate, fromServiceDate);
  return {
    facilityId: input.facilityId,
    fromServiceDate: toServiceDateKey(fromServiceDate),
    throughServiceDate: toServiceDateKey(throughServiceDate),
    definitionsConsidered: 0,
    occurrencesCreated: 0,
    occurrencesExisting: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    tasksSkipped: 0,
  };
}

export async function generateDueInspectionWorkForFacilities(
  input: {
    facilityId?: string;
    date?: Date | string;
    throughDate?: Date | string;
    now?: Date;
  } = {},
  deps: TaskSyncDeps & { db?: GenerateDueInspectionWorkDb & Pick<PrismaClient, "facility"> } = {},
): Promise<GenerateDueInspectionWorkResult[]> {
  const db = deps.db ?? defaultPrisma;
  if (input.facilityId) {
    return [await generateDueInspectionWork({ ...input, facilityId: input.facilityId }, deps)];
  }

  const facilities = await db.facility.findMany({ select: { id: true } });
  const results: GenerateDueInspectionWorkResult[] = [];
  for (const facility of facilities) {
    results.push(await generateDueInspectionWork({ ...input, facilityId: facility.id }, deps));
  }
  return results;
}
