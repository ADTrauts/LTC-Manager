import assert from "node:assert/strict";
import test from "node:test";

import type { Task } from "@prisma/client";

import {
  buildInspectionFollowUpTitle,
  buildInspectionFollowUpUpsertInput,
  isQualifyingInspectionFollowUp,
  syncInspectionFollowUpTasksFromContext,
  followUpStatusLabel,
} from "@/lib/work/inspections/sync-inspection-follow-up-tasks";

function withEnv(name: string, value: string | undefined, fn: () => Promise<void> | void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
}

const baseFinding = {
  submissionItemId: "item_sub_1",
  definitionItemId: "item_def_1",
  itemLabel: "Dishwasher rinse",
  passed: false as boolean | null,
  valueText: null,
  valueNumber: null,
  notes: "Residue on trays",
  failureCreatesFollowUp: true,
  responseType: "PASS_FAIL",
};

test("qualifying follow-up requires failed response and failureCreatesFollowUp", () => {
  assert.equal(isQualifyingInspectionFollowUp(baseFinding), true);
  assert.equal(
    isQualifyingInspectionFollowUp({ ...baseFinding, failureCreatesFollowUp: false }),
    false,
  );
  assert.equal(isQualifyingInspectionFollowUp({ ...baseFinding, passed: true }), false);
  assert.equal(isQualifyingInspectionFollowUp({ ...baseFinding, passed: null }), false);
});

test("follow-up title and upsert mapping are operator-friendly and conservative", () => {
  assert.equal(
    buildInspectionFollowUpTitle({ itemLabel: "Dishwasher rinse", definitionName: "EVS Walk" }),
    "Correct failed Dishwasher rinse",
  );
  assert.equal(
    buildInspectionFollowUpTitle({
      itemLabel: "Replace expired sanitizer test strips",
      definitionName: "EVS Walk",
    }),
    "Replace expired sanitizer test strips",
  );

  const input = buildInspectionFollowUpUpsertInput(
    {
      submissionId: "sub_1",
      facilityId: "fac_1",
      departmentId: "dept_1",
      unitId: "unit_1",
      unitName: "4A",
      operationInstanceId: null,
      definitionName: "EVS Room Walk",
      submittedAt: new Date("2026-07-12T15:00:00Z"),
      submittedByName: "Pat Lee",
      executionTaskId: "task_exec",
    },
    baseFinding,
  );

  assert.equal(input.type, "INSPECTION");
  assert.equal(input.sourceType, "INSPECTION_FINDING");
  assert.equal(input.sourceId, "item_sub_1");
  assert.equal(input.status, "OPEN");
  assert.equal(input.priority, "MEDIUM");
  assert.equal(input.facilityId, "fac_1");
  assert.equal(input.departmentId, "dept_1");
  assert.equal(input.unitId, "unit_1");
  assert.match(input.description ?? "", /EVS Room Walk/);
  assert.match(input.description ?? "", /Dishwasher rinse/);
  assert.match(input.description ?? "", /Fail/);
});

test("TASK_SYNC_ENABLED=false skips follow-up Task writes", async () => {
  let creates = 0;
  await withEnv("TASK_SYNC_ENABLED", undefined, async () => {
    const result = await syncInspectionFollowUpTasksFromContext(
      {
        submissionId: "sub_1",
        facilityId: "fac_1",
        departmentId: null,
        unitId: "unit_1",
        unitName: "4A",
        operationInstanceId: null,
        definitionName: "Walk",
        submittedAt: new Date(),
        submittedByName: null,
        executionTaskId: null,
        findings: [baseFinding],
      },
      {
        db: {
          task: {
            findUnique: async () => null,
            create: async () => {
              creates += 1;
              return { id: "t1" } as Task;
            },
            update: async () => ({ id: "t1" } as Task),
          },
        } as never,
      },
    );
    assert.equal(result.skipped, true);
    assert.equal(creates, 0);
  });
});

test("follow-up sync creates one Task per qualifying finding and is idempotent", async () => {
  const store = new Map<string, { id: string; status: string; title: string }>();
  let creates = 0;
  let updates = 0;

  const db = {
    task: {
      findUnique: async ({
        where,
      }: {
        where: { facilityId_sourceType_sourceId: { sourceId: string } };
      }) => {
        const row = store.get(where.facilityId_sourceType_sourceId.sourceId);
        return row ? { id: row.id, status: row.status } : null;
      },
      create: async ({ data }: { data: { sourceId: string; title: string; status: string } }) => {
        creates += 1;
        const row = { id: `task_${creates}`, status: data.status, title: data.title };
        store.set(data.sourceId, row);
        return row as Task;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { title?: string };
      }) => {
        updates += 1;
        for (const [sourceId, row] of store) {
          if (row.id === where.id) {
            const next = { ...row, title: data.title ?? row.title };
            store.set(sourceId, next);
            return next as Task;
          }
        }
        throw new Error("missing");
      },
    },
  };

  const context = {
    submissionId: "sub_1",
    facilityId: "fac_1",
    departmentId: "dept_1",
    unitId: "unit_1",
    unitName: "4A",
    operationInstanceId: null,
    definitionName: "EVS Walk",
    submittedAt: new Date("2026-07-12T15:00:00Z"),
    submittedByName: "Pat",
    executionTaskId: "exec_1",
    findings: [
      baseFinding,
      {
        ...baseFinding,
        submissionItemId: "item_sub_2",
        itemLabel: "Baseboards",
        failureCreatesFollowUp: false,
      },
      {
        ...baseFinding,
        submissionItemId: "item_sub_3",
        itemLabel: "Optional note",
        passed: true,
        failureCreatesFollowUp: true,
        notes: "dust",
      },
      {
        ...baseFinding,
        submissionItemId: "item_sub_4",
        itemLabel: "Replace expired sanitizer test strips",
        failureCreatesFollowUp: true,
      },
    ],
  };

  await withEnv("TASK_SYNC_ENABLED", "true", async () => {
    const first = await syncInspectionFollowUpTasksFromContext(context, { db: db as never });
    assert.equal(first.qualifyingCount, 2);
    assert.equal(first.createdOrUpdatedIds.length, 2);
    assert.equal(creates, 2);

    // Simulate lifecycle progress on first task — re-sync must not reset status.
    const firstSource = [...store.values()][0]!;
    firstSource.status = "IN_PROGRESS";

    const second = await syncInspectionFollowUpTasksFromContext(context, { db: db as never });
    assert.equal(second.qualifyingCount, 2);
    assert.equal(creates, 2);
    assert.equal(updates, 2);
    assert.equal([...store.values()].some((row) => row.status === "IN_PROGRESS"), true);
  });
});

test("follow-up status labels are operator-friendly", () => {
  assert.equal(followUpStatusLabel("OPEN"), "Open follow-up");
  assert.equal(followUpStatusLabel("IN_PROGRESS"), "In progress");
  assert.equal(followUpStatusLabel("COMPLETED"), "Resolved");
  assert.equal(followUpStatusLabel("CANCELLED"), "Cancelled");
});
