/**
 * Exercises the real SQL behind the Dietary milestone write, so it needs a throwaway Postgres
 * database that has had `prisma migrate deploy` and the seed applied.
 *
 * Set SERVERY_MILESTONE_TEST_DATABASE_URL to point at one. Without it the suite skips, which keeps
 * `npm test` hermetic on a fresh clone. Never point this at a database holding real data: the suite
 * creates and deletes employees, milestone events, and entries.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";

import type { MealType, PrismaClient } from "@prisma/client";

import type { ServeryMilestoneActor } from "./record-milestone";

const TEST_DATABASE_URL = process.env.SERVERY_MILESTONE_TEST_DATABASE_URL;
const skip = TEST_DATABASE_URL
  ? false
  : "set SERVERY_MILESTONE_TEST_DATABASE_URL to a disposable migrated database to run these";

process.env.AUTH_SECRET ??= "servery-milestone-db-test-secret";

type Fixture = {
  db: PrismaClient;
  lib: typeof import("./record-milestone");
  facilityId: string;
  unitId: string;
  otherUnitId: string;
  dietaryDepartmentId: string;
  mealType: MealType;
};

let fixture: Fixture | null = null;
const createdEmployeeIds: string[] = [];
const touchedUnitIds = new Set<string>();

async function getFixture(): Promise<Fixture | null> {
  if (fixture) return fixture;
  const { PrismaClient: Client } = await import("@prisma/client");
  const db = new Client({ datasources: { db: { url: TEST_DATABASE_URL } } });

  const unit = await db.unit.findFirst({
    where: {
      unitType: "SERVERY",
      isActive: true,
      mealTimes: { some: { isActive: true } },
      facility: { departments: { some: { key: "DIETARY", isActive: true } } },
    },
    select: {
      id: true,
      facilityId: true,
      mealTimes: { where: { isActive: true }, select: { mealType: true }, take: 1 },
    },
  });
  if (!unit) return null;

  const dietary = await db.department.findFirstOrThrow({
    where: { facilityId: unit.facilityId, key: "DIETARY", isActive: true },
    select: { id: true },
  });
  const otherUnit = await db.unit.findFirst({
    where: { facilityId: unit.facilityId, id: { not: unit.id } },
    select: { id: true },
  });

  fixture = {
    db,
    lib: await import("./record-milestone"),
    facilityId: unit.facilityId,
    unitId: unit.id,
    otherUnitId: otherUnit?.id ?? unit.id,
    dietaryDepartmentId: dietary.id,
    mealType: unit.mealTimes[0]!.mealType,
  };
  touchedUnitIds.add(unit.id);
  return fixture;
}

/** A Dietary employee scoped to the fixture unit, unique per test so cases cannot interfere. */
async function makeActor(
  f: Fixture,
  overrides: {
    role?: ServeryMilestoneActor["role"];
    inDietary?: boolean;
    unitId?: string | null;
    status?: "ACTIVE" | "OFF" | "TERMINATED";
    authMethod?: ServeryMilestoneActor["authMethod"];
  } = {},
): Promise<ServeryMilestoneActor> {
  const employee = await f.db.employee.create({
    data: {
      facilityId: f.facilityId,
      firstName: "Milestone",
      lastName: `Test ${Math.random().toString(36).slice(2, 8)}`,
      roleType: overrides.role ?? "STAFF",
      status: overrides.status ?? "ACTIVE",
      primaryDepartmentId: overrides.inDietary === false ? null : f.dietaryDepartmentId,
      unitAccesses:
        overrides.unitId === null
          ? undefined
          : { create: [{ unitId: overrides.unitId ?? f.unitId }] },
    },
    select: { id: true },
  });
  createdEmployeeIds.push(employee.id);
  return {
    userId: null,
    employeeId: employee.id,
    role: overrides.role ?? "STAFF",
    authMethod: overrides.authMethod ?? "QUICK_PIN",
  };
}

function uniqueActionId(label: string): string {
  return `test_${label}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

/** Remove any event rows this suite created for the fixture unit, cascading to entries. */
async function resetEvents(f: Fixture) {
  await f.db.serveryMealServiceEvent.deleteMany({
    where: { unitId: { in: [...touchedUnitIds] } },
  });
}

after(async () => {
  if (!fixture) return;
  await fixture.db.serveryMilestoneEntry.deleteMany({
    where: { actorEmployeeId: { in: createdEmployeeIds } },
  });
  await fixture.db.employeeUnitAccess.deleteMany({
    where: { employeeId: { in: createdEmployeeIds } },
  });
  await fixture.db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  await fixture.db.$disconnect();
});

test("a PIN session records an attributable milestone", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const actor = await makeActor(f, { authMethod: "QUICK_PIN" });

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("pin_attrib"),
      actor,
    },
    f.db,
  );

  assert.equal(result.ok, true);
  const entry = await f.db.serveryMilestoneEntry.findFirstOrThrow({
    where: { event: { unitId: f.unitId }, milestone: "READY" },
    select: { actorEmployeeId: true, actorUserId: true, authMethod: true, actorRole: true, kind: true },
  });
  // The defect this covers: PIN sessions have no User row, so the previous model recorded no actor
  // at all for exactly the shared-tablet case the workflow exists to serve.
  assert.equal(entry.actorEmployeeId, actor.employeeId);
  assert.equal(entry.actorUserId, null);
  assert.equal(entry.authMethod, "QUICK_PIN");
  assert.equal(entry.actorRole, "STAFF");
  assert.equal(entry.kind, "ORIGINAL");
});

test("replaying the same command produces one record", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const actor = await makeActor(f);
  const clientActionId = uniqueActionId("replay");
  const command = {
    facilityId: f.facilityId,
    unitId: f.unitId,
    mealType: f.mealType,
    milestone: "READY" as const,
    action: "RECORD" as const,
    clientActionId,
    actor,
  };

  const first = await f.lib.recordServeryMilestone(command, f.db);
  const second = await f.lib.recordServeryMilestone(command, f.db);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.occurredAt.getTime(), first.occurredAt.getTime());

  const count = await f.db.serveryMilestoneEntry.count({
    where: { event: { unitId: f.unitId }, milestone: "READY" },
  });
  assert.equal(count, 1);
});

test("concurrent identical commands settle on one authoritative record", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const actor = await makeActor(f);
  const command = {
    facilityId: f.facilityId,
    unitId: f.unitId,
    mealType: f.mealType,
    milestone: "SERVICE_STARTED" as const,
    action: "RECORD" as const,
    clientActionId: uniqueActionId("concurrent"),
    actor,
  };

  const results = await Promise.all([
    f.lib.recordServeryMilestone(command, f.db),
    f.lib.recordServeryMilestone(command, f.db),
    f.lib.recordServeryMilestone(command, f.db),
  ]);

  assert.ok(results.every((r) => r.ok));
  const count = await f.db.serveryMilestoneEntry.count({
    where: { event: { unitId: f.unitId }, milestone: "SERVICE_STARTED" },
  });
  assert.equal(count, 1);
});

test("a second record of an already-recorded milestone is refused, not silently applied", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const actor = await makeActor(f);
  const base = {
    facilityId: f.facilityId,
    unitId: f.unitId,
    mealType: f.mealType,
    milestone: "READY" as const,
    action: "RECORD" as const,
    actor,
  };

  const first = await f.lib.recordServeryMilestone(
    { ...base, clientActionId: uniqueActionId("first") },
    f.db,
  );
  const second = await f.lib.recordServeryMilestone(
    { ...base, clientActionId: uniqueActionId("second") },
    f.db,
  );

  assert.equal(first.ok, true);
  assert.deepEqual(second, { ok: false, reason: "ALREADY_RECORDED" });
  if (!first.ok) return;

  const event = await f.db.serveryMealServiceEvent.findFirstOrThrow({
    where: { unitId: f.unitId },
    select: { mealServiceReadyAt: true },
  });
  // The original occurrence time survives a competing press.
  assert.equal(event.mealServiceReadyAt?.getTime(), first.occurredAt.getTime());
});

test("a correction preserves the original entry and the value it replaced", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const staff = await makeActor(f, { role: "STAFF" });
  const supervisor = await makeActor(f, { role: "SUPERVISOR" });

  const original = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("orig"),
      actor: staff,
    },
    f.db,
  );
  assert.equal(original.ok, true);
  if (!original.ok) return;

  const correctedTo = new Date(original.occurredAt.getTime() - 15 * 60_000);
  const correction = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "CORRECT",
      clientActionId: uniqueActionId("corr"),
      occurredAt: correctedTo,
      reason: "Recorded from the wrong tablet",
      actor: supervisor,
    },
    f.db,
  );
  assert.equal(correction.ok, true);

  const entries = await f.db.serveryMilestoneEntry.findMany({
    where: { event: { unitId: f.unitId }, milestone: "READY" },
    orderBy: { recordedAt: "asc" },
    select: {
      kind: true,
      occurredAt: true,
      previousOccurredAt: true,
      reason: true,
      actorEmployeeId: true,
    },
  });
  assert.equal(entries.length, 2);
  assert.equal(entries[0]!.kind, "ORIGINAL");
  assert.equal(entries[0]!.occurredAt.getTime(), original.occurredAt.getTime());
  assert.equal(entries[0]!.actorEmployeeId, staff.employeeId);
  assert.equal(entries[1]!.kind, "CORRECTION");
  assert.equal(entries[1]!.occurredAt.getTime(), correctedTo.getTime());
  assert.equal(entries[1]!.previousOccurredAt?.getTime(), original.occurredAt.getTime());
  assert.equal(entries[1]!.reason, "Recorded from the wrong tablet");
  assert.equal(entries[1]!.actorEmployeeId, supervisor.employeeId);

  const event = await f.db.serveryMealServiceEvent.findFirstOrThrow({
    where: { unitId: f.unitId },
    select: { mealServiceReadyAt: true },
  });
  assert.equal(event.mealServiceReadyAt?.getTime(), correctedTo.getTime());
});

test("a correction without a reason is refused", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const supervisor = await makeActor(f, { role: "SUPERVISOR" });
  await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("needs_reason_orig"),
      actor: supervisor,
    },
    f.db,
  );

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "CORRECT",
      clientActionId: uniqueActionId("needs_reason"),
      occurredAt: new Date(Date.now() - 60_000),
      reason: "   ",
      actor: supervisor,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "CORRECTION_REASON_REQUIRED" });
});

test("correcting a milestone that was never recorded is refused", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const supervisor = await makeActor(f, { role: "SUPERVISOR" });

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "SERVICE_STARTED",
      action: "CORRECT",
      clientActionId: uniqueActionId("nothing"),
      occurredAt: new Date(Date.now() - 60_000),
      reason: "Backfilling a missed press",
      actor: supervisor,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "NOTHING_TO_CORRECT" });
});

test("a staff actor cannot correct", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const staff = await makeActor(f, { role: "STAFF" });
  await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("staff_orig"),
      actor: staff,
    },
    f.db,
  );

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "CORRECT",
      clientActionId: uniqueActionId("staff_corr"),
      occurredAt: new Date(Date.now() - 60_000),
      reason: "Wrong time",
      actor: staff,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "CORRECTION_ROLE_REQUIRED" });
});

test("an employee outside Dietary cannot record", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const outsider = await makeActor(f, { inDietary: false });

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("outsider"),
      actor: outsider,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "DEPARTMENT_RELATIONSHIP_REQUIRED" });
});

test("a terminated employee cannot record", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const inactive = await makeActor(f, { status: "TERMINATED" });

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("inactive"),
      actor: inactive,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "ACTOR_INACTIVE" });
});

test("an off-shift employee may still record", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  // `OFF` means off-shift. Locking out someone covering an unscheduled shift would be a new blocker.
  const offShift = await makeActor(f, { status: "OFF" });

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("off_shift"),
      actor: offShift,
    },
    f.db,
  );
  assert.equal(result.ok, true);
});

test("a unit in another facility resolves to not found", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const actor = await makeActor(f);

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: "clfakefakefakefakefake001",
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("cross_facility"),
      actor,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "UNIT_NOT_FOUND" });
});

test("a meal the servery does not serve is refused", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const actor = await makeActor(f);
  const served = await f.db.unitMealTime.findMany({
    where: { unitId: f.unitId, isActive: true },
    select: { mealType: true },
  });
  const unserved = (["BREAKFAST", "LUNCH", "DINNER"] as MealType[]).find(
    (meal) => !served.some((row) => row.mealType === meal),
  );
  if (!unserved) return; // This servery serves every meal; nothing to assert.

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: unserved,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("unserved"),
      actor,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "MEAL_NOT_CONFIGURED" });
});

test("a unit-locked tablet cannot record for another unit", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  if (f.otherUnitId === f.unitId) return;
  await resetEvents(f);
  const actor = await makeActor(f, { role: "GM" });

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("device"),
      actor,
      deviceBoundUnitId: f.otherUnitId,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "DEVICE_UNIT_CONFLICT" });
});

test("a future occurrence time is refused", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const supervisor = await makeActor(f, { role: "SUPERVISOR" });

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("future"),
      occurredAt: new Date(Date.now() + 60 * 60_000),
      actor: supervisor,
    },
    f.db,
  );
  assert.deepEqual(result, { ok: false, reason: "OCCURRENCE_TIME_INVALID" });
});

test("occurrence time and server acceptance time are recorded separately", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const supervisor = await makeActor(f, { role: "SUPERVISOR" });
  const occurredAt = new Date(Date.now() - 45 * 60_000);

  const result = await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("late_entry"),
      occurredAt,
      actor: supervisor,
    },
    f.db,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // A late entry must stay distinguishable from a late meal.
  assert.equal(result.occurredAt.getTime(), occurredAt.getTime());
  assert.ok(result.recordedAt.getTime() - occurredAt.getTime() > 40 * 60_000);

  const event = await f.db.serveryMealServiceEvent.findFirstOrThrow({
    where: { unitId: f.unitId },
    select: { mealServiceReadyAt: true, readyRecordedAt: true },
  });
  assert.equal(event.mealServiceReadyAt?.getTime(), occurredAt.getTime());
  assert.notEqual(event.readyRecordedAt?.getTime(), occurredAt.getTime());
});

test("an unrecorded milestone stays null rather than being invented", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  await resetEvents(f);
  const actor = await makeActor(f);

  await f.lib.recordServeryMilestone(
    {
      facilityId: f.facilityId,
      unitId: f.unitId,
      mealType: f.mealType,
      milestone: "READY",
      action: "RECORD",
      clientActionId: uniqueActionId("only_ready"),
      actor,
    },
    f.db,
  );

  const event = await f.db.serveryMealServiceEvent.findFirstOrThrow({
    where: { unitId: f.unitId },
    select: { mealServiceReadyAt: true, mealServiceStartedAt: true },
  });
  // "Not Confirmed" is the absence of a record, not a recorded absence.
  assert.notEqual(event.mealServiceReadyAt, null);
  assert.equal(event.mealServiceStartedAt, null);
});
