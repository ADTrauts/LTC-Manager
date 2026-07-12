import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLogTaskTitle,
  completedAtForTaskStatus,
  mapLogSubmissionPriorityToTaskPriority,
  mapLogSubmissionStatusToTaskStatus,
  mapRepairPriorityToTaskPriority,
  mapRepairStatusToTaskStatus,
} from "@/lib/work/task-mappings";
import {
  buildLogTaskUpsertInput,
  syncLogSubmissionRecordToTask,
} from "@/lib/work/adapters/log-task";
import {
  buildRepairTaskUpsertInput,
  syncRepairRecordToTask,
} from "@/lib/work/adapters/repair-task";
import type { Task } from "@prisma/client";

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

test("log submission status maps to TaskStatus", () => {
  assert.equal(mapLogSubmissionStatusToTaskStatus("COMPLETED"), "COMPLETED");
  assert.equal(mapLogSubmissionStatusToTaskStatus("FAILED"), "OPEN");
  assert.equal(mapLogSubmissionStatusToTaskStatus("MISSED"), "OPEN");
});

test("log priority is conservative MEDIUM", () => {
  assert.equal(mapLogSubmissionPriorityToTaskPriority(), "MEDIUM");
});

test("repair status maps to TaskStatus", () => {
  assert.equal(mapRepairStatusToTaskStatus("OPEN"), "OPEN");
  assert.equal(mapRepairStatusToTaskStatus("IN_PROGRESS"), "IN_PROGRESS");
  assert.equal(mapRepairStatusToTaskStatus("WAITING_PARTS"), "IN_PROGRESS");
  assert.equal(mapRepairStatusToTaskStatus("CLOSED"), "COMPLETED");
});

test("repair priority maps 1:1", () => {
  assert.equal(mapRepairPriorityToTaskPriority("LOW"), "LOW");
  assert.equal(mapRepairPriorityToTaskPriority("MEDIUM"), "MEDIUM");
  assert.equal(mapRepairPriorityToTaskPriority("HIGH"), "HIGH");
  assert.equal(mapRepairPriorityToTaskPriority("URGENT"), "URGENT");
});

test("log task title includes meal when present", () => {
  assert.equal(buildLogTaskTitle({ templateName: "Fridge Temp" }), "Fridge Temp");
  assert.equal(
    buildLogTaskTitle({ templateName: "Fridge Temp", mealType: "LUNCH" }),
    "Fridge Temp (LUNCH)",
  );
});

test("completedAt is set only for COMPLETED tasks", () => {
  const stamp = new Date("2026-07-12T12:00:00Z");
  assert.equal(completedAtForTaskStatus("OPEN", stamp), null);
  assert.equal(completedAtForTaskStatus("COMPLETED", stamp)?.toISOString(), stamp.toISOString());
  assert.ok(completedAtForTaskStatus("COMPLETED", null));
});

test("log upsert input uses unique source projection keys", () => {
  const submittedAt = new Date("2026-07-12T08:00:00Z");
  const input = buildLogTaskUpsertInput({
    id: "sub_1",
    status: "FAILED",
    notes: "temp high",
    submittedAt,
    unitId: "unit_1",
    mealType: "BREAKFAST",
    submittedByEmployeeId: "emp_1",
    facilityId: "fac_1",
    departmentId: "dept_1",
    templateName: "Dish Machine",
  });

  assert.equal(input.type, "LOG");
  assert.equal(input.sourceType, "LOG_SUBMISSION");
  assert.equal(input.sourceId, "sub_1");
  assert.equal(input.facilityId, "fac_1");
  assert.equal(input.status, "OPEN");
  assert.equal(input.priority, "MEDIUM");
  assert.equal(input.title, "Dish Machine (BREAKFAST)");
  assert.equal(input.completedAt, null);
});

test("completed log maps completedAt from submittedAt", () => {
  const submittedAt = new Date("2026-07-12T08:00:00Z");
  const input = buildLogTaskUpsertInput({
    id: "sub_2",
    status: "COMPLETED",
    notes: null,
    submittedAt,
    unitId: "unit_1",
    mealType: null,
    submittedByEmployeeId: null,
    facilityId: "fac_1",
    departmentId: null,
    templateName: "Sanitizer",
  });
  assert.equal(input.status, "COMPLETED");
  assert.equal(input.completedAt?.toISOString(), submittedAt.toISOString());
});

test("repair upsert input maps priority/status and allows null unit", () => {
  const input = buildRepairTaskUpsertInput({
    id: "rep_1",
    title: "Leak under sink",
    description: "Standing water",
    priority: "URGENT",
    status: "WAITING_PARTS",
    unitId: null,
    responsibleDepartmentId: "dept_plant",
    assignedEmployeeId: null,
    dueAt: null,
    completedAt: null,
    facilityId: "fac_1",
  });

  assert.equal(input.type, "REPAIR");
  assert.equal(input.sourceType, "REPAIR");
  assert.equal(input.sourceId, "rep_1");
  assert.equal(input.unitId, null);
  assert.equal(input.status, "IN_PROGRESS");
  assert.equal(input.priority, "URGENT");
});

test("closed repair maps to COMPLETED with completedAt", () => {
  const closedAt = new Date("2026-07-12T18:00:00Z");
  const input = buildRepairTaskUpsertInput({
    id: "rep_2",
    title: "Door hinge",
    description: "Fixed",
    priority: "LOW",
    status: "CLOSED",
    unitId: "unit_1",
    responsibleDepartmentId: null,
    assignedEmployeeId: null,
    dueAt: null,
    completedAt: closedAt,
    facilityId: "fac_1",
  });
  assert.equal(input.status, "COMPLETED");
  assert.equal(input.completedAt?.toISOString(), closedAt.toISOString());
});

test("TASK_SYNC_ENABLED=false skips Task upsert", async () => {
  let upsertCalls = 0;
  const db = {
    task: {
      upsert: async () => {
        upsertCalls += 1;
        return { id: "task_should_not" } as Task;
      },
    },
  };

  await withEnv("TASK_SYNC_ENABLED", undefined, async () => {
    const outcome = await syncLogSubmissionRecordToTask(
      {
        id: "sub_off",
        status: "COMPLETED",
        notes: null,
        submittedAt: new Date(),
        unitId: "unit_1",
        mealType: null,
        submittedByEmployeeId: null,
        facilityId: "fac_1",
        departmentId: null,
        templateName: "Check",
      },
      { db: db as never },
    );
    assert.deepEqual(outcome, { ok: true, skipped: true, reason: "flag_disabled" });
    assert.equal(upsertCalls, 0);
  });
});

test("TASK_SYNC_ENABLED=true upserts Task and repeated sync is idempotent", async () => {
  const upsertArgs: unknown[] = [];
  const db = {
    task: {
      upsert: async (args: unknown) => {
        upsertArgs.push(args);
        return { id: "task_1" } as Task;
      },
    },
  };

  await withEnv("TASK_SYNC_ENABLED", "true", async () => {
    const source = {
      id: "sub_on",
      status: "COMPLETED" as const,
      notes: null,
      submittedAt: new Date("2026-07-12T09:00:00Z"),
      unitId: "unit_1",
      mealType: null,
      submittedByEmployeeId: null,
      facilityId: "fac_1",
      departmentId: null,
      templateName: "Check",
    };

    const first = await syncLogSubmissionRecordToTask(source, { db: db as never });
    const second = await syncLogSubmissionRecordToTask(source, { db: db as never });

    assert.equal(first.ok, true);
    assert.equal(first.skipped, false);
    assert.equal(second.ok, true);
    assert.equal(upsertArgs.length, 2);

    const where = (upsertArgs[0] as { where: { facilityId_sourceType_sourceId: unknown } })
      .where.facilityId_sourceType_sourceId;
    assert.deepEqual(where, {
      facilityId: "fac_1",
      sourceType: "LOG_SUBMISSION",
      sourceId: "sub_on",
    });
    assert.deepEqual(
      (upsertArgs[1] as { where: { facilityId_sourceType_sourceId: unknown } }).where
        .facilityId_sourceType_sourceId,
      where,
    );
  });
});

test("repair sync updates Task status on status change and survives upsert failure", async () => {
  await withEnv("TASK_SYNC_ENABLED", "true", async () => {
    const statuses: string[] = [];
    const okDb = {
      task: {
        upsert: async (args: { create: { status: string }; update: { status: string } }) => {
          statuses.push(args.update.status);
          return { id: "task_r1" } as Task;
        },
      },
    };

    const open = await syncRepairRecordToTask(
      {
        id: "rep_sync",
        title: "Valve",
        description: "Leak",
        priority: "HIGH",
        status: "OPEN",
        unitId: "unit_1",
        responsibleDepartmentId: "dept_1",
        assignedEmployeeId: null,
        dueAt: null,
        completedAt: null,
        facilityId: "fac_1",
      },
      { db: okDb as never },
    );
    assert.equal(open.ok, true);
    assert.equal(statuses.at(-1), "OPEN");

    const closed = await syncRepairRecordToTask(
      {
        id: "rep_sync",
        title: "Valve",
        description: "Leak",
        priority: "HIGH",
        status: "CLOSED",
        unitId: "unit_1",
        responsibleDepartmentId: "dept_1",
        assignedEmployeeId: null,
        dueAt: null,
        completedAt: new Date("2026-07-12T20:00:00Z"),
        facilityId: "fac_1",
      },
      { db: okDb as never },
    );
    assert.equal(closed.ok, true);
    assert.equal(statuses.at(-1), "COMPLETED");

    const failingDb = {
      task: {
        upsert: async () => {
          throw new Error("db down");
        },
      },
    };
    const previousError = console.error;
    console.error = () => {};
    try {
      const failed = await syncRepairRecordToTask(
        {
          id: "rep_fail",
          title: "Valve",
          description: "Leak",
          priority: "MEDIUM",
          status: "OPEN",
          unitId: null,
          responsibleDepartmentId: null,
          assignedEmployeeId: null,
          dueAt: null,
          completedAt: null,
          facilityId: "fac_1",
        },
        { db: failingDb as never },
      );
      assert.equal(failed.ok, false);
      assert.equal(failed.skipped, false);
    } finally {
      console.error = previousError;
    }
  });
});
