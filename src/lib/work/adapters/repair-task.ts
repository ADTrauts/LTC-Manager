import type { RepairPriority, RepairStatus } from "@prisma/client";

import {
  completedAtForTaskStatus,
  mapRepairPriorityToTaskPriority,
  mapRepairStatusToTaskStatus,
} from "@/lib/work/task-mappings";
import {
  type TaskSyncDeps,
  type TaskSyncOutcome,
} from "@/lib/work/run-guarded-task-sync";
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

/** Task projection is retired. The work order stays the source of truth. */
export async function syncRepairToTask(
  _repairId: string,
  _deps: TaskSyncDeps = {},
): Promise<TaskSyncOutcome> {
  return { ok: true, skipped: true, reason: "flag_disabled" };
}

/** Task projection is retired. The work order stays the source of truth. */
export async function syncRepairRecordToTask(
  _repair: RepairTaskSource,
  _deps: TaskSyncDeps = {},
): Promise<TaskSyncOutcome> {
  return { ok: true, skipped: true, reason: "flag_disabled" };
}
