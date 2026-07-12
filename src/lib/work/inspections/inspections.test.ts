import assert from "node:assert/strict";
import test from "node:test";

import type { Task } from "@prisma/client";

import { determineInspectionResult } from "@/lib/work/inspections/determine-inspection-result";
import {
  buildInspectionTaskUpsertInput,
  mapInspectionResultToTaskStatus,
  syncInspectionRecordToTask,
} from "@/lib/work/inspections/inspection-task";
import { submitInspection } from "@/lib/work/inspections/submit-inspection";
import type {
  InspectionDefinitionSnapshot,
  ValidatedInspectionItemAnswer,
} from "@/lib/work/inspections/types";
import { validateInspectionSubmission } from "@/lib/work/inspections/validate-inspection-submission";

function withEnv(name: string, value: string | undefined, fn: () => Promise<void> | void) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    });
}

const definition: InspectionDefinitionSnapshot = {
  id: "def_1",
  facilityId: "fac_1",
  departmentId: "dept_1",
  unitId: "unit_1",
  name: "EVS Room Walk",
  isActive: true,
  items: [
    {
      id: "item_req",
      label: "Floors clear",
      isRequired: true,
      responseType: "PASS_FAIL",
      failureCreatesFollowUp: true,
      sortOrder: 1,
    },
    {
      id: "item_opt",
      label: "Baseboards",
      isRequired: false,
      responseType: "PASS_FAIL",
      failureCreatesFollowUp: false,
      sortOrder: 2,
    },
    {
      id: "item_notes",
      label: "Observer notes",
      isRequired: false,
      responseType: "TEXT",
      failureCreatesFollowUp: false,
      sortOrder: 3,
    },
  ],
};

function binaryAnswer(
  partial: Partial<ValidatedInspectionItemAnswer> &
    Pick<ValidatedInspectionItemAnswer, "definitionItemId" | "passed" | "isRequired">,
): ValidatedInspectionItemAnswer {
  return {
    valueText: null,
    valueNumber: null,
    notes: null,
    responseType: "PASS_FAIL",
    failureCreatesFollowUp: false,
    label: partial.definitionItemId,
    ...partial,
  };
}

test("valid definition structure exposes required checklist fields", () => {
  assert.equal(definition.items.length, 3);
  assert.ok(definition.items.every((item) => item.sortOrder > 0));
  assert.equal(definition.items.filter((item) => item.isRequired).length, 1);
});

test("required item missing → validation failure", () => {
  const result = validateInspectionSubmission({
    definition,
    facilityId: "fac_1",
    unitId: "unit_1",
    answers: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "REQUIRED_ITEM_MISSING");
  }
});

test("item from wrong definition → validation failure", () => {
  const result = validateInspectionSubmission({
    definition,
    facilityId: "fac_1",
    unitId: "unit_1",
    answers: [
      { definitionItemId: "item_req", passed: true },
      { definitionItemId: "item_other_def", passed: true },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "UNKNOWN_ITEM");
  }
});

test("inactive definition → validation failure", () => {
  const result = validateInspectionSubmission({
    definition: { ...definition, isActive: false },
    facilityId: "fac_1",
    unitId: "unit_1",
    answers: [{ definitionItemId: "item_req", passed: true }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "DEFINITION_INACTIVE");
  }
});

test("unit scope mismatch → validation failure", () => {
  const result = validateInspectionSubmission({
    definition,
    facilityId: "fac_1",
    unitId: "unit_other",
    answers: [{ definitionItemId: "item_req", passed: true }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "UNIT_SCOPE_MISMATCH");
  }
});

test("all required items pass → PASSED", () => {
  const validated = validateInspectionSubmission({
    definition,
    facilityId: "fac_1",
    unitId: "unit_1",
    answers: [{ definitionItemId: "item_req", passed: true }],
  });
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(determineInspectionResult(validated.answers).result, "PASSED");
});

test("optional finding → PASSED_WITH_FINDINGS", () => {
  const withOptionalFail = determineInspectionResult([
    binaryAnswer({ definitionItemId: "item_req", passed: true, isRequired: true }),
    binaryAnswer({ definitionItemId: "item_opt", passed: false, isRequired: false }),
  ]);
  assert.equal(withOptionalFail.result, "PASSED_WITH_FINDINGS");

  const withNotes = determineInspectionResult([
    binaryAnswer({ definitionItemId: "item_req", passed: true, isRequired: true }),
    {
      definitionItemId: "item_notes",
      passed: null,
      valueText: "Dust behind fridge",
      valueNumber: null,
      notes: "Needs follow-up wipe",
      isRequired: false,
      responseType: "TEXT",
      failureCreatesFollowUp: false,
      label: "Observer notes",
    },
  ]);
  assert.equal(withNotes.result, "PASSED_WITH_FINDINGS");
});

test("required item failure → FAILED", () => {
  const result = determineInspectionResult([
    binaryAnswer({ definitionItemId: "item_req", passed: false, isRequired: true }),
    binaryAnswer({ definitionItemId: "item_opt", passed: true, isRequired: false }),
  ]);
  assert.equal(result.result, "FAILED");
  assert.deepEqual(result.failedRequiredItemIds, ["item_req"]);
});

test("inspection Task projection maps every result to COMPLETED", () => {
  assert.equal(mapInspectionResultToTaskStatus("PASSED"), "COMPLETED");
  assert.equal(mapInspectionResultToTaskStatus("PASSED_WITH_FINDINGS"), "COMPLETED");
  assert.equal(mapInspectionResultToTaskStatus("FAILED"), "COMPLETED");

  const input = buildInspectionTaskUpsertInput({
    id: "sub_1",
    facilityId: "fac_1",
    departmentId: "dept_1",
    unitId: "unit_1",
    operationInstanceId: null,
    submittedByEmployeeId: "emp_1",
    submittedAt: new Date("2026-07-12T15:00:00Z"),
    result: "FAILED",
    notes: "Floors sticky",
    definitionName: "EVS Room Walk",
  });
  assert.equal(input.type, "INSPECTION");
  assert.equal(input.sourceType, "INSPECTION_SUBMISSION");
  assert.equal(input.sourceId, "sub_1");
  assert.equal(input.status, "COMPLETED");
  assert.ok(input.completedAt);
});

test("TASK_SYNC_ENABLED=false skips inspection Task upsert", async () => {
  let upsertCalls = 0;
  await withEnv("TASK_SYNC_ENABLED", undefined, async () => {
    const outcome = await syncInspectionRecordToTask(
      {
        id: "sub_off",
        facilityId: "fac_1",
        departmentId: null,
        unitId: null,
        operationInstanceId: null,
        submittedByEmployeeId: null,
        submittedAt: new Date(),
        result: "PASSED",
        notes: null,
        definitionName: "Walk",
      },
      {
        db: {
          task: {
            upsert: async () => {
              upsertCalls += 1;
              return { id: "t" } as Task;
            },
          },
        } as never,
      },
    );
    assert.deepEqual(outcome, { ok: true, skipped: true, reason: "flag_disabled" });
    assert.equal(upsertCalls, 0);
  });
});

test("TASK_SYNC_ENABLED=true upserts one INSPECTION Task and is idempotent", async () => {
  const upsertArgs: unknown[] = [];
  await withEnv("TASK_SYNC_ENABLED", "true", async () => {
    const db = {
      task: {
        upsert: async (args: unknown) => {
          upsertArgs.push(args);
          return { id: "task_insp_1" } as Task;
        },
      },
    };
    const source = {
      id: "sub_on",
      facilityId: "fac_1",
      departmentId: "dept_1",
      unitId: "unit_1",
      operationInstanceId: null,
      submittedByEmployeeId: null,
      submittedAt: new Date("2026-07-12T16:00:00Z"),
      result: "PASSED_WITH_FINDINGS" as const,
      notes: null,
      definitionName: "EVS Room Walk",
    };
    const first = await syncInspectionRecordToTask(source, { db: db as never });
    const second = await syncInspectionRecordToTask(source, { db: db as never });
    assert.equal(first.ok, true);
    assert.equal(first.skipped, false);
    assert.equal(second.ok, true);
    assert.equal(upsertArgs.length, 2);
    const where = (upsertArgs[0] as { where: { facilityId_sourceType_sourceId: unknown } })
      .where.facilityId_sourceType_sourceId;
    assert.deepEqual(where, {
      facilityId: "fac_1",
      sourceType: "INSPECTION_SUBMISSION",
      sourceId: "sub_on",
    });
  });
});

test("submitInspection writes atomically and respects idempotency + flag", async () => {
  const createdIds: string[] = [];
  let transactionCalls = 0;
  let upsertCalls = 0;
  let updateCalls = 0;

  const store = new Map<
    string,
    {
      id: string;
      facilityId: string;
      definitionId: string;
      unitId: string | null;
      operationInstanceId: string | null;
      submittedByEmployeeId: string | null;
      submittedAt: Date;
      result: "PASSED" | "PASSED_WITH_FINDINGS" | "FAILED";
      notes: string | null;
      taskId: string | null;
      idempotencyKey: string | null;
    }
  >();

  const db = {
    inspectionDefinition: {
      findUnique: async () => ({
        id: definition.id,
        facilityId: definition.facilityId,
        departmentId: definition.departmentId,
        unitId: definition.unitId,
        name: definition.name,
        isActive: definition.isActive,
        items: definition.items,
      }),
    },
    inspectionSubmission: {
      findUnique: async ({
        where,
      }: {
        where: { facilityId_idempotencyKey: { facilityId: string; idempotencyKey: string } };
      }) => {
        const key = `${where.facilityId_idempotencyKey.facilityId}:${where.facilityId_idempotencyKey.idempotencyKey}`;
        const row = store.get(key);
        if (!row) return null;
        return {
          ...row,
          definition: {
            name: definition.name,
            departmentId: definition.departmentId,
          },
        };
      },
      create: async ({
        data,
      }: {
        data: {
          facilityId: string;
          definitionId: string;
          unitId: string | null;
          operationInstanceId: string | null;
          submittedByEmployeeId: string | null;
          result: "PASSED" | "PASSED_WITH_FINDINGS" | "FAILED";
          notes: string | null;
          idempotencyKey: string | null;
          items: { create: unknown[] };
        };
      }) => {
        const id = `sub_${createdIds.length + 1}`;
        createdIds.push(id);
        assert.ok(Array.isArray(data.items.create));
        assert.equal(data.items.create.length, 1);
        const row = {
          id,
          facilityId: data.facilityId,
          definitionId: data.definitionId,
          unitId: data.unitId,
          operationInstanceId: data.operationInstanceId,
          submittedByEmployeeId: data.submittedByEmployeeId,
          submittedAt: new Date("2026-07-12T17:00:00Z"),
          result: data.result,
          notes: data.notes,
          taskId: null,
          idempotencyKey: data.idempotencyKey,
        };
        if (data.idempotencyKey) {
          store.set(`${data.facilityId}:${data.idempotencyKey}`, row);
        }
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { taskId: string };
      }) => {
        updateCalls += 1;
        for (const row of store.values()) {
          if (row.id === where.id) row.taskId = data.taskId;
        }
        return { id: where.id, taskId: data.taskId };
      },
    },
    task: {
      upsert: async () => {
        upsertCalls += 1;
        return { id: "task_from_insp" } as Task;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCalls += 1;
      return fn(db);
    },
  };

  await withEnv("TASK_SYNC_ENABLED", "false", async () => {
    const first = await submitInspection(
      {
        facilityId: "fac_1",
        definitionId: "def_1",
        unitId: "unit_1",
        idempotencyKey: "retry-1",
        answers: [{ definitionItemId: "item_req", passed: true }],
      },
      { db: db as never },
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.deduplicated, false);
    assert.equal(first.submission.result, "PASSED");
    assert.equal(first.taskSync.synced, false);
    assert.equal(first.taskSync.skipped, true);
    assert.equal(transactionCalls, 1);
    assert.equal(upsertCalls, 0);
    assert.equal(createdIds.length, 1);
  });

  await withEnv("TASK_SYNC_ENABLED", "true", async () => {
    const duplicate = await submitInspection(
      {
        facilityId: "fac_1",
        definitionId: "def_1",
        unitId: "unit_1",
        idempotencyKey: "retry-1",
        answers: [{ definitionItemId: "item_req", passed: false }],
      },
      { db: db as never },
    );
    assert.equal(duplicate.ok, true);
    if (!duplicate.ok) return;
    assert.equal(duplicate.deduplicated, true);
    assert.equal(duplicate.submission.id, "sub_1");
    assert.equal(duplicate.submission.result, "PASSED");
    assert.equal(createdIds.length, 1);

    const synced = await submitInspection(
      {
        facilityId: "fac_1",
        definitionId: "def_1",
        unitId: "unit_1",
        idempotencyKey: "retry-2",
        answers: [{ definitionItemId: "item_req", passed: false }],
      },
      { db: db as never },
    );
    assert.equal(synced.ok, true);
    if (!synced.ok) return;
    assert.equal(synced.submission.result, "FAILED");
    assert.equal(synced.taskSync.synced, true);
    assert.equal(synced.submission.taskId, "task_from_insp");
    assert.equal(upsertCalls, 1);
    assert.equal(updateCalls, 1);
  });
});

test("Task sync failure does not invalidate inspection submission", async () => {
  const db = {
    inspectionDefinition: {
      findUnique: async () => ({
        id: definition.id,
        facilityId: definition.facilityId,
        departmentId: definition.departmentId,
        unitId: definition.unitId,
        name: definition.name,
        isActive: definition.isActive,
        items: definition.items,
      }),
    },
    inspectionSubmission: {
      findUnique: async () => null,
      create: async () => ({
        id: "sub_fail_sync",
        facilityId: "fac_1",
        definitionId: "def_1",
        unitId: "unit_1",
        operationInstanceId: null,
        submittedByEmployeeId: null,
        submittedAt: new Date(),
        result: "PASSED" as const,
        notes: null,
        taskId: null,
      }),
      update: async () => {
        throw new Error("should not update taskId when sync fails");
      },
    },
    task: {
      upsert: async () => {
        throw new Error("db down");
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };

  const previousError = console.error;
  console.error = () => {};
  try {
    await withEnv("TASK_SYNC_ENABLED", "true", async () => {
      const result = await submitInspection(
        {
          facilityId: "fac_1",
          definitionId: "def_1",
          unitId: "unit_1",
          answers: [{ definitionItemId: "item_req", passed: true }],
        },
        { db: db as never },
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.submission.id, "sub_fail_sync");
      assert.equal(result.submission.taskId, null);
      assert.equal(result.taskSync.synced, false);
      assert.equal(result.taskSync.attempted, true);
    });
  } finally {
    console.error = previousError;
  }
});
