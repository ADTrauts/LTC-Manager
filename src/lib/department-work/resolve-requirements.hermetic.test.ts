import assert from "node:assert/strict";
import test from "node:test";

import { buildOccurrenceKey } from "./occurrence-key";
import { resolveWorkRequirements } from "./resolve-requirements";
import type { PublishedWorkPlanForResolve } from "./types";

const plan: PublishedWorkPlanForResolve = {
  id: "plan1",
  stableKey: "servery_opening",
  version: 1,
  name: "Servery Opening",
  status: "PUBLISHED",
  effectiveStartDate: null,
  effectiveEndDate: null,
  weekdays: [],
  applicabilities: [{ kind: "DEPARTMENT_UNIT", unitId: "u1", spaceId: null, spaceType: null, assetId: null, assetType: null }],
  items: [
    {
      id: "item1",
      itemKey: "verify_stations",
      label: "Verify stations",
      instructions: null,
      displaySequence: 10,
      priority: "ROUTINE",
      completionMode: "EXPLICIT_CONFIRMATION",
      responsibilityMode: "UNIT_SHARED",
      scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
      cycleStableKeys: [],
      windowStartLocal: null,
      windowEndLocal: null,
      dueOffsetKind: null,
      dueOffsetMinutes: null,
      roleKeys: [],
      unitId: null,
      spaceId: null,
      assetId: null,
      knowledgeArticleId: null,
      procedureTitleSnapshot: null,
      linkedTemplateStableKey: null,
      linkedTemplateId: null,
      supervisorVisible: true,
    },
  ],
};

test("occurrence key is deterministic for plan work", () => {
  const a = buildOccurrenceKey({
    sourceKind: "WORK_PLAN",
    workPlanStableKey: "servery_opening",
    workPlanVersion: 1,
    workItemKey: "verify_stations",
    operationalDate: "2026-08-06",
    unitId: "u1",
    spaceId: null,
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
  });
  const b = buildOccurrenceKey({
    sourceKind: "WORK_PLAN",
    workPlanStableKey: "servery_opening",
    workPlanVersion: 1,
    workItemKey: "verify_stations",
    operationalDate: "2026-08-06",
    unitId: "u1",
  });
  assert.equal(a, b);
  assert.match(a, /^plan\|/);
});

test("draft assignments never produce requirements without confirmed assignment", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T15:00:00.000Z"),
    unitId: "u1",
    publishedPlans: [plan],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 0);
});

test("confirmed unit assignment derives unit-shared requirement", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    publishedPlans: [plan],
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "e1", unitId: "u1", roleKey: "COOK" }],
    existingOccurrences: [],
  });
  assert.ok(reqs.length >= 1);
  assert.equal(reqs[0]!.responsibilityMode, "UNIT_SHARED");
  assert.equal(reqs[0]!.workItemKey, "verify_stations");
});

test("past due uses PAST_DUE_NOT_CONFIRMED not failed", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-05",
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    publishedPlans: [plan],
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "e1", unitId: "u1", roleKey: null }],
    existingOccurrences: [],
  });
  assert.ok(reqs.some((r) => r.state === "PAST_DUE_NOT_CONFIRMED"));
  assert.ok(!reqs.some((r) => String(r.state).toLowerCase().includes("fail")));
});

test("EACH_ASSIGNED_EMPLOYEE reserved and skipped at runtime", () => {
  const eachPlan: PublishedWorkPlanForResolve = {
    ...plan,
    items: [
      {
        ...plan.items[0]!,
        responsibilityMode: "EACH_ASSIGNED_EMPLOYEE",
      },
    ],
  };
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    publishedPlans: [eachPlan],
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "e1", unitId: "u1", roleKey: null }],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 0);
});

test("linked accepted evidence completes work without duplicate occurrence", () => {
  const linkedPlan: PublishedWorkPlanForResolve = {
    ...plan,
    items: [
      {
        ...plan.items[0]!,
        completionMode: "LINKED_EVIDENCE",
        linkedTemplateStableKey: "cooler_temperature_log",
      },
    ],
  };
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    publishedPlans: [linkedPlan],
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "e1", unitId: "u1", roleKey: null }],
    existingOccurrences: [],
    acceptedEvidence: [
      {
        id: "ev1",
        templateStableKey: "cooler_temperature_log",
        templateId: "t1",
        unitId: "u1",
        status: "COMPLETED",
      },
    ],
  });
  assert.equal(reqs[0]!.state, "COMPLETED_WITH_EVIDENCE");
  assert.equal(reqs[0]!.evidenceRecordId, "ev1");
  assert.equal(reqs[0]!.occurrenceId, null);
});

const roomCleanItem = plan.items[0]!;

test("SPACE_TYPE PATIENT_ROOM expands one requirement per matching space", () => {
  const spacePlan: PublishedWorkPlanForResolve = {
    ...plan,
    stableKey: "routine_room_clean",
    applicabilities: [{ kind: "SPACE_TYPE", unitId: null, spaceId: null, spaceType: "PATIENT_ROOM", assetId: null, assetType: null }],
    items: [{ ...roomCleanItem, itemKey: "surfaces", label: "Clean surfaces" }],
  };
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "evs",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    spaces: [
      { id: "r1", spaceType: "PATIENT_ROOM", unitId: "u1" },
      { id: "r2", spaceType: "PATIENT_ROOM", unitId: "u1" },
      { id: "hall", spaceType: "PUBLIC_AREA", unitId: "u1" },
    ],
    publishedPlans: [spacePlan],
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "e1", unitId: "u1", roleKey: null }],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 2);
  assert.deepEqual(
    reqs.map((r) => r.spaceId).sort(),
    ["r1", "r2"],
  );
});

test("SPECIFIC_SPACE expands only that space", () => {
  const specificPlan: PublishedWorkPlanForResolve = {
    ...plan,
    stableKey: "room_turn",
    applicabilities: [
      { kind: "SPECIFIC_SPACE", unitId: null, spaceId: "r2", spaceType: null, assetId: null, assetType: null },
    ],
    items: [{ ...roomCleanItem, itemKey: "special_clean", label: "Special clean" }],
  };
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "evs",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    spaces: [
      { id: "r1", spaceType: "PATIENT_ROOM", unitId: "u1" },
      { id: "r2", spaceType: "PATIENT_ROOM", unitId: "u1" },
    ],
    publishedPlans: [specificPlan],
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "e1", unitId: "u1", roleKey: null }],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.spaceId, "r2");
});

test("Dietary DEPARTMENT_UNIT plan without spaces still one unit-level requirement", () => {
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "d1",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    publishedPlans: [plan],
    publishedCycles: [],
    confirmedAssignments: [{ employeeId: "e1", unitId: "u1", roleKey: "COOK" }],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.spaceId, null);
  assert.equal(reqs[0]!.unitId, "u1");
});

test("space expansion still requires confirmed assignment", () => {
  const spacePlan: PublishedWorkPlanForResolve = {
    ...plan,
    stableKey: "routine_room_clean",
    applicabilities: [{ kind: "SPACE_TYPE", unitId: null, spaceId: null, spaceType: "PATIENT_ROOM", assetId: null, assetType: null }],
  };
  const reqs = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "evs",
    operationalDateKey: "2026-08-06",
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "America/New_York",
    unitId: "u1",
    spaces: [{ id: "r1", spaceType: "PATIENT_ROOM", unitId: "u1" }],
    publishedPlans: [spacePlan],
    publishedCycles: [],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.equal(reqs.length, 0);
});
