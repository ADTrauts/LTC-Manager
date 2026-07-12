import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/prisma";
import { completeScheduledInspectionOccurrence } from "@/lib/work/inspections/complete-scheduled-occurrence";
import { determineInspectionResult } from "@/lib/work/inspections/determine-inspection-result";
import { syncInspectionRecordToTask } from "@/lib/work/inspections/inspection-task";
import {
  syncInspectionFollowUpTasks,
  syncInspectionFollowUpTasksFromContext,
  type FollowUpSyncResult,
} from "@/lib/work/inspections/sync-inspection-follow-up-tasks";
import type {
  InspectionDefinitionSnapshot,
  SubmitInspectionInput,
  SubmitInspectionResult,
  SubmitInspectionSuccess,
} from "@/lib/work/inspections/types";
import { validateInspectionSubmission } from "@/lib/work/inspections/validate-inspection-submission";
import type { TaskSyncDeps } from "@/lib/work/run-guarded-task-sync";

export type InspectionSubmitDb = Pick<
  PrismaClient,
  "inspectionDefinition" | "inspectionSubmission" | "inspectionOccurrence" | "$transaction"
> & {
  task?: PrismaClient["task"];
};

function toDefinitionSnapshot(row: {
  id: string;
  facilityId: string;
  departmentId: string | null;
  unitId: string | null;
  name: string;
  isActive: boolean;
  items: Array<{
    id: string;
    label: string;
    isRequired: boolean;
    responseType: InspectionDefinitionSnapshot["items"][number]["responseType"];
    failureCreatesFollowUp: boolean;
    sortOrder: number;
  }>;
}): InspectionDefinitionSnapshot {
  return {
    id: row.id,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    unitId: row.unitId,
    name: row.name,
    isActive: row.isActive,
    items: row.items.map((item) => ({
      id: item.id,
      label: item.label,
      isRequired: item.isRequired,
      responseType: item.responseType,
      failureCreatesFollowUp: item.failureCreatesFollowUp,
      sortOrder: item.sortOrder,
    })),
  };
}

function toFollowUpSyncResult(outcome: FollowUpSyncResult): SubmitInspectionSuccess["followUpSync"] {
  return {
    attempted: outcome.attempted,
    skipped: outcome.skipped,
    qualifyingCount: outcome.qualifyingCount,
    taskIds: outcome.createdOrUpdatedIds,
  };
}

async function repairFollowUpTasks(
  submissionId: string,
  deps: TaskSyncDeps & { db?: InspectionSubmitDb },
): Promise<SubmitInspectionSuccess["followUpSync"]> {
  const outcome = await syncInspectionFollowUpTasks(submissionId, {
    isEnabled: deps.isEnabled,
    db:
      deps.db?.task && deps.db.inspectionSubmission
        ? {
            task: deps.db.task,
            inspectionSubmission: deps.db.inspectionSubmission,
          }
        : undefined,
  });
  return toFollowUpSyncResult(outcome);
}

/**
 * Submit an inspection:
 * 1. Validate definition + answers
 * 2. Persist submission + items atomically
 * 3. If occurrenceId: complete scheduled Task (no duplicate execution Task)
 *    Else: guarded INSPECTION_SUBMISSION Task projection
 * 4. Guarded follow-up Task sync for qualifying failed items
 *
 * Submission remains authoritative: Task sync failures never roll back the write.
 */
export async function submitInspection(
  input: SubmitInspectionInput,
  deps: TaskSyncDeps & { db?: InspectionSubmitDb } = {},
): Promise<SubmitInspectionResult> {
  const db = deps.db ?? defaultPrisma;
  const occurrenceId =
    typeof input.occurrenceId === "string" && input.occurrenceId.trim().length > 0
      ? input.occurrenceId.trim()
      : null;

  const idempotencyKey =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
      ? input.idempotencyKey.trim()
      : null;

  if (idempotencyKey) {
    const existing = await db.inspectionSubmission.findUnique({
      where: {
        facilityId_idempotencyKey: {
          facilityId: input.facilityId,
          idempotencyKey,
        },
      },
      select: {
        id: true,
        facilityId: true,
        definitionId: true,
        unitId: true,
        operationInstanceId: true,
        submittedByEmployeeId: true,
        submittedAt: true,
        result: true,
        notes: true,
        taskId: true,
        definition: {
          select: { name: true, departmentId: true },
        },
      },
    });

    if (existing) {
      const followUpSync = await repairFollowUpTasks(existing.id, deps);
      return {
        ok: true,
        deduplicated: true,
        submission: {
          id: existing.id,
          facilityId: existing.facilityId,
          definitionId: existing.definitionId,
          unitId: existing.unitId,
          operationInstanceId: existing.operationInstanceId,
          submittedByEmployeeId: existing.submittedByEmployeeId,
          submittedAt: existing.submittedAt,
          result: existing.result,
          notes: existing.notes,
          taskId: existing.taskId,
          definitionName: existing.definition.name,
          departmentId: existing.definition.departmentId,
        },
        taskSync: {
          attempted: false,
          synced: false,
          skipped: true,
          taskId: existing.taskId,
        },
        followUpSync,
      };
    }
  }

  if (occurrenceId) {
    const occurrence = await db.inspectionOccurrence.findFirst({
      where: {
        id: occurrenceId,
        facilityId: input.facilityId,
        definitionId: input.definitionId,
        status: "OPEN",
      },
      select: { id: true },
    });
    if (!occurrence) {
      return {
        ok: false,
        validation: {
          ok: false,
          code: "DEFINITION_NOT_FOUND",
          message: "Scheduled inspection was not found or is already completed.",
        },
      };
    }
  }

  const definitionRow = await db.inspectionDefinition.findUnique({
    where: { id: input.definitionId },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      unitId: true,
      name: true,
      isActive: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          label: true,
          isRequired: true,
          responseType: true,
          failureCreatesFollowUp: true,
          sortOrder: true,
        },
      },
    },
  });

  const validation = validateInspectionSubmission({
    definition: definitionRow ? toDefinitionSnapshot(definitionRow) : null,
    facilityId: input.facilityId,
    unitId: input.unitId,
    answers: input.answers,
  });

  if (!validation.ok) {
    return { ok: false, validation };
  }

  const determined = determineInspectionResult(validation.answers);

  const created = await db.$transaction(async (tx) => {
    return tx.inspectionSubmission.create({
      data: {
        facilityId: input.facilityId,
        definitionId: validation.definition.id,
        unitId: validation.resolvedUnitId,
        operationInstanceId: input.operationInstanceId ?? null,
        submittedByEmployeeId: input.submittedByEmployeeId ?? null,
        occurrenceId,
        result: determined.result,
        notes: input.notes?.trim() || null,
        idempotencyKey,
        items: {
          create: validation.answers.map((answer) => ({
            definitionItemId: answer.definitionItemId,
            passed: answer.passed,
            valueText: answer.valueText,
            valueNumber: answer.valueNumber,
            notes: answer.notes,
          })),
        },
      },
      select: {
        id: true,
        facilityId: true,
        definitionId: true,
        unitId: true,
        operationInstanceId: true,
        submittedByEmployeeId: true,
        submittedAt: true,
        result: true,
        notes: true,
        taskId: true,
        occurrenceId: true,
        items: {
          select: {
            id: true,
            passed: true,
            valueText: true,
            valueNumber: true,
            notes: true,
            definitionItem: {
              select: {
                id: true,
                label: true,
                failureCreatesFollowUp: true,
                responseType: true,
              },
            },
          },
        },
      },
    });
  });

  let taskId: string | null = null;
  let synced = false;
  let skipped = false;

  if (created.occurrenceId) {
    const scheduled = await completeScheduledInspectionOccurrence(
      {
        occurrenceId: created.occurrenceId,
        facilityId: created.facilityId,
        definitionId: created.definitionId,
        submissionId: created.id,
        submittedAt: created.submittedAt,
        submittedByEmployeeId: created.submittedByEmployeeId,
      },
      {
        isEnabled: deps.isEnabled,
        db:
          deps.db?.task && deps.db.inspectionOccurrence
            ? { task: deps.db.task, inspectionOccurrence: deps.db.inspectionOccurrence }
            : undefined,
      },
    );
    taskId = scheduled.taskId;
    synced = scheduled.synced;
    skipped = scheduled.skipped;
    if (taskId) {
      try {
        await db.inspectionSubmission.update({
          where: { id: created.id },
          data: { taskId },
        });
      } catch (error) {
        console.error("[work/inspections] failed to link scheduled taskId on submission", {
          submissionId: created.id,
          taskId,
          error,
        });
      }
    }
  } else {
    const syncOutcome = await syncInspectionRecordToTask(
      {
        id: created.id,
        facilityId: created.facilityId,
        departmentId: validation.definition.departmentId,
        unitId: created.unitId,
        operationInstanceId: created.operationInstanceId,
        submittedByEmployeeId: created.submittedByEmployeeId,
        submittedAt: created.submittedAt,
        result: created.result,
        notes: created.notes,
        definitionName: validation.definition.name,
      },
      {
        isEnabled: deps.isEnabled,
        db: deps.db?.task ? { task: deps.db.task } : undefined,
      },
    );

    if (syncOutcome.ok && syncOutcome.skipped) {
      skipped = true;
    } else if (syncOutcome.ok && !syncOutcome.skipped) {
      synced = true;
      taskId = syncOutcome.task.id;
      try {
        await db.inspectionSubmission.update({
          where: { id: created.id },
          data: { taskId },
        });
      } catch (error) {
        console.error("[work/inspections] failed to link taskId on submission", {
          submissionId: created.id,
          taskId,
          error,
        });
      }
    }
  }

  const followUpOutcome = await syncInspectionFollowUpTasksFromContext(
    {
      submissionId: created.id,
      facilityId: created.facilityId,
      departmentId: validation.definition.departmentId,
      unitId: created.unitId,
      unitName: null,
      operationInstanceId: created.operationInstanceId,
      definitionName: validation.definition.name,
      submittedAt: created.submittedAt,
      submittedByName: null,
      executionTaskId: taskId,
      findings: created.items.map((item) => ({
        submissionItemId: item.id,
        definitionItemId: item.definitionItem.id,
        itemLabel: item.definitionItem.label,
        passed: item.passed,
        valueText: item.valueText,
        valueNumber: item.valueNumber,
        notes: item.notes,
        failureCreatesFollowUp: item.definitionItem.failureCreatesFollowUp,
        responseType: item.definitionItem.responseType,
      })),
    },
    {
      isEnabled: deps.isEnabled,
      db: deps.db?.task ? { task: deps.db.task } : undefined,
    },
  );

  return {
    ok: true,
    deduplicated: false,
    submission: {
      id: created.id,
      facilityId: created.facilityId,
      definitionId: created.definitionId,
      unitId: created.unitId,
      operationInstanceId: created.operationInstanceId,
      submittedByEmployeeId: created.submittedByEmployeeId,
      submittedAt: created.submittedAt,
      result: created.result,
      notes: created.notes,
      taskId,
      definitionName: validation.definition.name,
      departmentId: validation.definition.departmentId,
    },
    taskSync: {
      attempted: true,
      synced,
      skipped,
      taskId,
    },
    followUpSync: toFollowUpSyncResult(followUpOutcome),
  };
}
