import type { PrismaClient } from "@prisma/client";

import { isTaskSyncEnabled } from "@/lib/feature-flags";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  buildInspectionScheduleSummary,
  doesCadenceMatchServiceDate,
  iterateServiceDatesInclusive,
} from "@/lib/work/inspections/inspection-cadence";
import {
  DEFAULT_INSPECTION_DUE_TIME_LOCAL,
  facilityLocalDateTimeToUtc,
} from "@/lib/work/inspections/facility-local-due-at";
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

export type GenerateDueInspectionWorkDb = Pick<
  PrismaClient,
  "inspectionDefinition" | "inspectionOccurrence" | "task" | "facility"
>;

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
 * Materialize InspectionOccurrence rows (and optional Tasks) for active recurring definitions.
 * Idempotent on (definitionId, serviceDate). Never creates placeholder submissions.
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

  const definitions = await db.inspectionDefinition.findMany({
    where: {
      facilityId: input.facilityId,
      isActive: true,
      cadenceType: { not: "ON_DEMAND" },
    },
    select: {
      id: true,
      name: true,
      description: true,
      facilityId: true,
      departmentId: true,
      unitId: true,
      cadenceType: true,
      dueTimeLocal: true,
      daysOfWeek: true,
      dayOfMonth: true,
      activeFrom: true,
      activeUntil: true,
      unit: { select: { name: true } },
    },
  });

  let occurrencesCreated = 0;
  let occurrencesExisting = 0;
  let tasksCreated = 0;
  let tasksUpdated = 0;
  let tasksSkipped = 0;

  const serviceDates = iterateServiceDatesInclusive(fromServiceDate, throughServiceDate);

  for (const definition of definitions) {
    const cadenceSummary = buildInspectionScheduleSummary({
      cadenceType: definition.cadenceType,
      dueTimeLocal: definition.dueTimeLocal,
      daysOfWeek: definition.daysOfWeek,
      dayOfMonth: definition.dayOfMonth,
    });
    const dueTimeLocal = definition.dueTimeLocal?.trim() || DEFAULT_INSPECTION_DUE_TIME_LOCAL;

    let maxGenerated: Date | null = null;

    for (const serviceDate of serviceDates) {
      if (
        !doesCadenceMatchServiceDate(
          {
            cadenceType: definition.cadenceType,
            daysOfWeek: definition.daysOfWeek,
            dayOfMonth: definition.dayOfMonth,
            activeFrom: definition.activeFrom,
            activeUntil: definition.activeUntil,
          },
          serviceDate,
        )
      ) {
        continue;
      }

      const localDateKey = toServiceDateKey(serviceDate);
      const dueAt =
        facilityLocalDateTimeToUtc(localDateKey, dueTimeLocal, facilityTimezone) ??
        new Date(serviceDate.getTime() + 9 * 60 * 60 * 1000);

      const existing = await db.inspectionOccurrence.findUnique({
        where: {
          definitionId_serviceDate: {
            definitionId: definition.id,
            serviceDate,
          },
        },
        select: { id: true, taskId: true, status: true, dueAt: true },
      });

      let occurrenceId: string;
      if (existing) {
        occurrencesExisting += 1;
        occurrenceId = existing.id;
        if (existing.status === "OPEN" && existing.dueAt.getTime() !== dueAt.getTime()) {
          await db.inspectionOccurrence.update({
            where: { id: existing.id },
            data: { dueAt },
          });
        }
      } else {
        const created = await db.inspectionOccurrence.create({
          data: {
            definitionId: definition.id,
            facilityId: definition.facilityId,
            departmentId: definition.departmentId,
            unitId: definition.unitId,
            serviceDate,
            dueAt,
            status: "OPEN",
          },
          select: { id: true },
        });
        occurrencesCreated += 1;
        occurrenceId = created.id;
      }

      const taskData = buildScheduledInspectionTaskInput({
        occurrenceId,
        facilityId: definition.facilityId,
        departmentId: definition.departmentId,
        unitId: definition.unitId,
        definitionName: definition.name,
        description: definition.description,
        cadenceSummary,
        dueAt,
        unitName: definition.unit?.name ?? null,
      });

      // Inline upsert so we can count create vs update correctly under the flag.
      const isEnabled = deps.isEnabled ?? isTaskSyncEnabled;
      if (!isEnabled()) {
        tasksSkipped += 1;
      } else {
        const existingTask = await db.task.findUnique({
          where: {
            facilityId_sourceType_sourceId: {
              facilityId: taskData.facilityId,
              sourceType: taskData.sourceType,
              sourceId: taskData.sourceId,
            },
          },
          select: { id: true, status: true },
        });

        try {
          if (existingTask) {
            if (existingTask.status === "OPEN" || existingTask.status === "IN_PROGRESS") {
              await db.task.update({
                where: { id: existingTask.id },
                data: {
                  departmentId: taskData.departmentId,
                  unitId: taskData.unitId,
                  title: taskData.title,
                  description: taskData.description,
                  dueAt: taskData.dueAt,
                  priority: taskData.priority,
                },
              });
              tasksUpdated += 1;
            }
            await db.inspectionOccurrence.update({
              where: { id: occurrenceId },
              data: { taskId: existingTask.id },
            });
          } else {
            const task = await db.task.create({ data: taskData });
            tasksCreated += 1;
            await db.inspectionOccurrence.update({
              where: { id: occurrenceId },
              data: { taskId: task.id },
            });
          }
        } catch (error) {
          console.error("[work/inspections] failed to sync occurrence Task", {
            occurrenceId,
            error,
          });
        }
      }

      if (!maxGenerated || toServiceDateKey(serviceDate) > toServiceDateKey(maxGenerated)) {
        maxGenerated = serviceDate;
      }
    }

    if (maxGenerated) {
      await db.inspectionDefinition.update({
        where: { id: definition.id },
        data: { lastGeneratedThrough: maxGenerated },
      });
    }
  }

  return {
    facilityId: input.facilityId,
    fromServiceDate: toServiceDateKey(fromServiceDate),
    throughServiceDate: toServiceDateKey(throughServiceDate),
    definitionsConsidered: definitions.length,
    occurrencesCreated,
    occurrencesExisting,
    tasksCreated,
    tasksUpdated,
    tasksSkipped,
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
