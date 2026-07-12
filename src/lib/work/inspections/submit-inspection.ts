import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/prisma";
import { determineInspectionResult } from "@/lib/work/inspections/determine-inspection-result";
import { syncInspectionRecordToTask } from "@/lib/work/inspections/inspection-task";
import type {
  InspectionDefinitionSnapshot,
  SubmitInspectionInput,
  SubmitInspectionResult,
} from "@/lib/work/inspections/types";
import { validateInspectionSubmission } from "@/lib/work/inspections/validate-inspection-submission";
import type { TaskSyncDeps } from "@/lib/work/run-guarded-task-sync";

export type InspectionSubmitDb = Pick<
  PrismaClient,
  "inspectionDefinition" | "inspectionSubmission" | "$transaction"
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

/**
 * Submit an inspection:
 * 1. Validate definition + answers
 * 2. Persist submission + items atomically
 * 3. Guarded Task projection (TASK_SYNC_ENABLED); never rolls back the submission
 *
 * Idempotency: when `idempotencyKey` is provided and already exists for the facility,
 * returns the existing submission without creating duplicates.
 */
export async function submitInspection(
  input: SubmitInspectionInput,
  deps: TaskSyncDeps & { db?: InspectionSubmitDb } = {},
): Promise<SubmitInspectionResult> {
  const db = deps.db ?? defaultPrisma;

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
    const submission = await tx.inspectionSubmission.create({
      data: {
        facilityId: input.facilityId,
        definitionId: validation.definition.id,
        unitId: validation.resolvedUnitId,
        operationInstanceId: input.operationInstanceId ?? null,
        submittedByEmployeeId: input.submittedByEmployeeId ?? null,
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
      },
    });

    return submission;
  });

  const taskSource = {
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
  };

  const syncOutcome = await syncInspectionRecordToTask(taskSource, {
    isEnabled: deps.isEnabled,
    db: deps.db?.task ? { task: deps.db.task } : undefined,
  });

  let taskId: string | null = null;
  let synced = false;
  let skipped = false;

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
      // Submission remains authoritative; linking taskId is best-effort.
      console.error("[work/inspections] failed to link taskId on submission", {
        submissionId: created.id,
        taskId,
        error,
      });
    }
  } else {
    skipped = false;
    synced = false;
  }

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
  };
}
