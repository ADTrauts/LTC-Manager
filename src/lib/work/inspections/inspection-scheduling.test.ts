import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInspectionScheduleSummary,
  doesCadenceMatchServiceDate,
  iterateServiceDatesInclusive,
} from "@/lib/work/inspections/inspection-cadence";
import { facilityLocalDateTimeToUtc } from "@/lib/work/inspections/facility-local-due-at";
import {
  buildScheduledInspectionTaskInput,
  generateDueInspectionWork,
} from "@/lib/work/inspections/generate-due-inspection-work";
import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { buildUnitWorkQueue } from "@/lib/unit-workspace/build-unit-work-queue";
import { UNIT_WORK_QUEUE_PRIORITY } from "@/lib/unit-workspace/work-queue-priority";
import { UnitType } from "@prisma/client";
import { buildHandoffSections } from "@/lib/todays-work/handoffs";
import { MealType } from "@prisma/client";

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

test("cadence matching covers daily weekly monthly and skips on-demand", () => {
  const monday = facilityLocalDateToServiceDate("2026-07-13"); // Monday
  const tuesday = facilityLocalDateToServiceDate("2026-07-14");
  const first = facilityLocalDateToServiceDate("2026-07-01");

  assert.equal(
    doesCadenceMatchServiceDate({ cadenceType: "DAILY" }, monday),
    true,
  );
  assert.equal(
    doesCadenceMatchServiceDate({ cadenceType: "ON_DEMAND" }, monday),
    false,
  );
  assert.equal(
    doesCadenceMatchServiceDate({ cadenceType: "WEEKLY", daysOfWeek: [1] }, monday),
    true,
  );
  assert.equal(
    doesCadenceMatchServiceDate({ cadenceType: "WEEKLY", daysOfWeek: [1] }, tuesday),
    false,
  );
  assert.equal(
    doesCadenceMatchServiceDate({ cadenceType: "MONTHLY", dayOfMonth: 1 }, first),
    true,
  );
  assert.equal(
    doesCadenceMatchServiceDate(
      {
        cadenceType: "DAILY",
        activeFrom: facilityLocalDateToServiceDate("2026-07-14"),
      },
      monday,
    ),
    false,
  );
});

test("schedule summary is operator-friendly", () => {
  assert.equal(buildInspectionScheduleSummary({ cadenceType: "ON_DEMAND" }), "On demand");
  assert.equal(
    buildInspectionScheduleSummary({ cadenceType: "DAILY", dueTimeLocal: "09:00" }),
    "Daily at 9:00 AM",
  );
  assert.equal(
    buildInspectionScheduleSummary({
      cadenceType: "WEEKLY",
      dueTimeLocal: "14:00",
      daysOfWeek: [1, 4],
    }),
    "Every Monday and Thursday at 2:00 PM",
  );
  assert.equal(
    buildInspectionScheduleSummary({
      cadenceType: "MONTHLY",
      dueTimeLocal: "08:00",
      dayOfMonth: 1,
    }),
    "Monthly on day 1 at 8:00 AM",
  );
});

test("facility-local due time converts near UTC midnight and handles DST spring-forward", () => {
  // America/New_York evening stays on prior UTC calendar day
  const evening = facilityLocalDateTimeToUtc("2026-07-12", "20:00", "America/New_York");
  assert.ok(evening);
  assert.equal(evening!.toISOString(), "2026-07-13T00:00:00.000Z");

  // 2026-03-08 spring forward in America/New_York: 2:30 does not exist → snaps forward
  const spring = facilityLocalDateTimeToUtc("2026-03-08", "02:30", "America/New_York");
  assert.ok(spring);
  // After snap, local wall time should be 3:30 AM EDT (07:30 UTC)
  assert.equal(spring!.toISOString(), "2026-03-08T07:30:00.000Z");

  // Fall-back ambiguous 01:30 on 2025-11-02 — prefer earlier (EDT) occurrence = 05:30Z
  const fall = facilityLocalDateTimeToUtc("2025-11-02", "01:30", "America/New_York");
  assert.ok(fall);
  assert.equal(fall!.toISOString(), "2025-11-02T05:30:00.000Z");
});

test("iterateServiceDatesInclusive is inclusive and ordered", () => {
  const dates = iterateServiceDatesInclusive(
    facilityLocalDateToServiceDate("2026-07-12"),
    facilityLocalDateToServiceDate("2026-07-14"),
  );
  assert.deepEqual(dates.map(toServiceDateKey), ["2026-07-12", "2026-07-13", "2026-07-14"]);
});

test("scheduled task mapping uses INSPECTION_OCCURRENCE source", () => {
  const input = buildScheduledInspectionTaskInput({
    occurrenceId: "occ_1",
    facilityId: "fac_1",
    departmentId: "dept_1",
    unitId: "unit_1",
    definitionName: "Sanitizer station",
    description: "Check strips",
    cadenceSummary: "Daily at 9:00 AM",
    dueAt: new Date("2026-07-12T13:00:00Z"),
    unitName: "4A",
  });
  assert.equal(input.sourceType, "INSPECTION_OCCURRENCE");
  assert.equal(input.sourceId, "occ_1");
  assert.equal(input.status, "OPEN");
  assert.equal(input.priority, "MEDIUM");
  assert.equal(input.title, "Sanitizer station");
});

test("generator creates one occurrence+Task and is idempotent", async () => {
  const occurrences = new Map<string, { id: string; dueAt: Date; status: string; taskId: string | null }>();
  const tasks = new Map<string, { id: string; status: string; dueAt: Date | null }>();
  let occurrenceCreates = 0;
  let taskCreates = 0;

  const definition = {
    id: "def_daily",
    name: "Sanitizer station",
    description: "Check strips",
    facilityId: "fac_1",
    departmentId: "dept_1",
    unitId: "unit_1",
    cadenceType: "DAILY" as const,
    dueTimeLocal: "10:00",
    daysOfWeek: [] as number[],
    dayOfMonth: null,
    activeFrom: null,
    activeUntil: null,
    unit: { name: "4A" },
  };

  const db = {
    facility: {
      findUnique: async () => ({ timezone: "America/New_York" }),
      findMany: async () => [{ id: "fac_1" }],
    },
    inspectionDefinition: {
      findMany: async () => [definition],
      update: async () => ({ id: definition.id }),
    },
    inspectionOccurrence: {
      findUnique: async ({
        where,
      }: {
        where: { definitionId_serviceDate: { definitionId: string; serviceDate: Date } };
      }) => {
        const key = `${where.definitionId_serviceDate.definitionId}:${toServiceDateKey(where.definitionId_serviceDate.serviceDate)}`;
        return occurrences.get(key) ?? null;
      },
      create: async ({
        data,
      }: {
        data: {
          definitionId: string;
          serviceDate: Date;
          dueAt: Date;
          status: string;
        };
      }) => {
        occurrenceCreates += 1;
        const id = `occ_${occurrenceCreates}`;
        const key = `${data.definitionId}:${toServiceDateKey(data.serviceDate)}`;
        const row = { id, dueAt: data.dueAt, status: data.status, taskId: null as string | null };
        occurrences.set(key, row);
        return { id };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { taskId?: string; dueAt?: Date };
      }) => {
        for (const row of occurrences.values()) {
          if (row.id === where.id) {
            if (data.taskId) row.taskId = data.taskId;
            if (data.dueAt) row.dueAt = data.dueAt;
          }
        }
        return { id: where.id };
      },
    },
    task: {
      findUnique: async ({
        where,
      }: {
        where: { facilityId_sourceType_sourceId: { sourceId: string } };
      }) => {
        const row = tasks.get(where.facilityId_sourceType_sourceId.sourceId);
        return row ? { id: row.id, status: row.status } : null;
      },
      create: async ({
        data,
      }: {
        data: { sourceId: string; status: string; dueAt: Date | null };
      }) => {
        taskCreates += 1;
        const id = `task_${taskCreates}`;
        tasks.set(data.sourceId, { id, status: data.status, dueAt: data.dueAt });
        return { id };
      },
      update: async () => ({ id: "task_1" }),
    },
  };

  await withEnv("TASK_SYNC_ENABLED", "true", async () => {
    const first = await generateDueInspectionWork(
      {
        facilityId: "fac_1",
        date: "2026-07-12",
        facilityTimezone: "America/New_York",
      },
      { db: db as never },
    );
    assert.equal(first.occurrencesCreated, 1);
    assert.equal(first.tasksCreated, 1);

    const second = await generateDueInspectionWork(
      {
        facilityId: "fac_1",
        date: "2026-07-12",
        facilityTimezone: "America/New_York",
      },
      { db: db as never },
    );
    assert.equal(second.occurrencesCreated, 0);
    assert.equal(second.occurrencesExisting, 1);
    assert.equal(occurrenceCreates, 1);
    assert.equal(taskCreates, 1);
  });
});

test("unit work queue surfaces overdue before due-now and hides far-future", () => {
  const now = new Date("2026-07-12T14:00:00Z");
  const queue = buildUnitWorkQueue({
    unit: {
      id: "unit-1",
      name: "Prep",
      unitType: UnitType.KITCHEN,
      isActive: true,
      mealTimes: [],
    },
    activeLogTab: null,
    mealServiceEventByMeal: new Map(),
    scheduledInspections: [
      {
        id: "occ-overdue",
        definitionId: "def-1",
        definitionName: "Sanitizer station",
        dueAt: new Date("2026-07-12T12:00:00Z"),
        dueTimeLocal: "08:00",
      },
      {
        id: "occ-due",
        definitionId: "def-2",
        definitionName: "Dish machine",
        dueAt: new Date("2026-07-12T14:10:00Z"),
        dueTimeLocal: "10:10",
      },
      {
        id: "occ-far",
        definitionId: "def-3",
        definitionName: "Evening walk",
        dueAt: new Date("2026-07-12T20:00:00Z"),
        dueTimeLocal: "16:00",
      },
    ],
    queries: { assignments: [], submissions: [], openRepairs: [] },
    now,
  });

  assert.equal(queue.primaryItem?.kind, "inspection-overdue");
  assert.ok(queue.items.some((item) => item.kind === "inspection-due"));
  assert.ok(!queue.items.some((item) => item.id.includes("occ-far")));
  assert.ok(UNIT_WORK_QUEUE_PRIORITY.INSPECTION_OVERDUE < UNIT_WORK_QUEUE_PRIORITY.INSPECTION_DUE_NOW);
});

test("today handoffs include overdue scheduled inspections in immediate", () => {
  const sections = buildHandoffSections({
    walkListItems: [],
    coverageItems: [],
    callDownItems: [],
    repairs: [],
    inspectionFindings: [],
    scheduledInspections: [
      {
        id: "occ-1",
        definitionId: "def-1",
        definitionName: "Sanitizer station",
        dueAt: new Date("2026-07-12T12:00:00Z"),
        overdue: true,
        unitId: "unit-1",
        unitName: "4A",
      },
    ],
    mealBoards: [],
    operationContext: {
      mealType: MealType.LUNCH,
      mealLabel: "Lunch",
      serviceLabel: "Lunch service",
      phase: "Preparation",
      scheduledTimeLabel: "11:30 AM",
      minutesUntilService: 20,
    },
  });

  const immediate = sections.find((section) => section.key === "immediate");
  assert.ok(immediate?.items.some((item) => item.id === "inspection-due:occ-1"));
});
