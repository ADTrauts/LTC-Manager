import type { PrismaClient, RepairPriority, RepairStatus, Task } from "@prisma/client";

import {
  completedAtForTaskStatus,
  mapRepairPriorityToTaskPriority,
  mapRepairStatusToTaskStatus,
} from "@/lib/work/task-mappings";
import {
  runGuardedTaskSync,
  type TaskSyncDeps,
  type TaskSyncOutcome,
} from "@/lib/work/run-guarded-task-sync";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type RepairTaskSource = {
  id: string;
  title: string;
  description: string;
  priority: RepairPriority;
  status: RepairStatus;
  unitId: string | null;
  responsibleDepartmentId: string | null;
  assignedEmployeeId: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  facilityId: string;
};

export type RepairTaskDb = Pick<PrismaClient, "task" | "repair">;

export function buildRepairTaskUpsertInput(repair: RepairTaskSource) {
  const status = mapRepairStatusToTaskStatus(repair.status);
  const priority = mapRepairPriorityToTaskPriority(repair.priority);
  const completedAt = completedAtForTaskStatus(status, repair.completedAt);

  return {
    facilityId: repair.facilityId,
    departmentId: repair.responsibleDepartmentId,
    unitId: repair.unitId,
    operationInstanceId: null as string | null,
    type: "REPAIR" as const,
    title: repair.title,
    description: repair.description,
    status,
    priority,
    dueAt: repair.dueAt,
    completedAt,
    assignedEmployeeId: repair.assignedEmployeeId,
    sourceType: "REPAIR" as const,
    sourceId: repair.id,
  };
}

async function upsertRepairTask(
  db: RepairTaskDb,
  repair: RepairTaskSource,
): Promise<Task> {
  const data = buildRepairTaskUpsertInput(repair);
  return db.task.upsert({
    where: {
      facilityId_sourceType_sourceId: {
        facilityId: data.facilityId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
      },
    },
    create: data,
    update: {
      departmentId: data.departmentId,
      unitId: data.unitId,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      dueAt: data.dueAt,
      completedAt: data.completedAt,
      assignedEmployeeId: data.assignedEmployeeId,
    },
  });
}

/**
 * Upsert Task projection for a Repair.
 * Idempotent on (facilityId, REPAIR, repairId).
 * Never throws to callers — Repair remains source of truth.
 */
export async function syncRepairToTask(
  repairId: string,
  deps: TaskSyncDeps & { db?: RepairTaskDb } = {},
): Promise<TaskSyncOutcome> {
  const db = deps.db ?? defaultPrisma;

  return runGuardedTaskSync(
    "repair → Task",
    { repairId },
    async () => {
      const row = await db.repair.findUnique({
        where: { id: repairId },
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          status: true,
          unitId: true,
          responsibleDepartmentId: true,
          assignedEmployeeId: true,
          dueAt: true,
          completedAt: true,
          unit: { select: { facilityId: true } },
        },
      });

      if (!row) {
        throw new Error(`Repair not found: ${repairId}`);
      }

      return upsertRepairTask(db, {
        id: row.id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        status: row.status,
        unitId: row.unitId,
        responsibleDepartmentId: row.responsibleDepartmentId,
        assignedEmployeeId: row.assignedEmployeeId,
        dueAt: row.dueAt,
        completedAt: row.completedAt,
        facilityId: row.unit.facilityId,
      });
    },
    deps,
  );
}

/** Sync from an already-loaded repair projection (preferred after create/update). */
export async function syncRepairRecordToTask(
  repair: RepairTaskSource,
  deps: TaskSyncDeps & { db?: RepairTaskDb } = {},
): Promise<TaskSyncOutcome> {
  const db = deps.db ?? defaultPrisma;
  return runGuardedTaskSync(
    "repair → Task",
    { repairId: repair.id },
    () => upsertRepairTask(db, repair),
    deps,
  );
}
