/**
 * Key Point overdue evaluation.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey, type Prisma } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { acknowledgeNotification, markNotificationRead } from "@/lib/notifications/lifecycle";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import { facilityLocalDateToServiceDate, parseFacilityLocalScheduledStartOnDate } from "@/lib/operational-time";
import { processScheduledEvaluationOutbox, runScheduledEvaluations } from "@/lib/scheduled-evaluation/run";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { completeKeyTimeDayExpectation } from "./key-time-day-actions";
import { recordOperationalTimingAdjustment } from "./record-timing-adjustment";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

type Db = PrismaClient;
const DATE = "2026-10-29";

function at(clock: string, zone: string): Date {
  return parseFacilityLocalScheduledStartOnDate(clock, DATE, zone)!;
}

function session(userId: string, facilityId: string, role: "STAFF" | "SUPERVISOR"): FacilitySession {
  return {
    scopeKind: "facility",
    role,
    facilityId,
    uid: userId,
    authKind: "user",
    authMethod: "PASSWORD",
    name: "Tester",
    email: `${userId}@example.test`,
  };
}

async function buildPoint(
  db: Db,
  input: {
    suffix: string;
    zone: string;
    label: string;
    staffRoleId: string;
    withSupervisor: boolean;
    tracking?: "NONE" | "OPTIONAL" | "REQUIRED";
    grain?: "DEPARTMENT" | "LOCATION";
    dueLocal?: string;
    stableKey?: string;
  },
) {
  const serviceDate = facilityLocalDateToServiceDate(DATE);
  const org = await db.organization.create({ data: { name: `Key ${input.suffix} ${input.label}` } });
  const facility = await db.facility.create({
    data: { organizationId: org.id, displayName: `Key ${input.label} ${input.suffix}`, timezone: input.zone },
  });
  const department = await db.department.create({
    data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition" },
  });
  const unit = await db.unit.create({
    data: {
      facilityId: facility.id,
      name: `Neighborhood ${input.suffix}`,
      unitType: "RESIDENT_AREA",
      hierarchyRole: "NEIGHBORHOOD",
    },
  });
  const space = await db.unitSpace.create({
    data: { facilityId: facility.id, unitId: unit.id, name: `Servery ${input.suffix}`, spaceType: "SERVICE_AREA" },
  });
  const cycle = await db.departmentOperationalCycle.create({
    data: {
      facilityId: facility.id,
      departmentId: department.id,
      stableKey: input.stableKey ?? "servery_ready",
      label: "Servery Ready",
      nodeKind: "KEY_TIME",
      occurrenceTracking: input.tracking ?? "REQUIRED",
      keyPointGrain: input.grain ?? "LOCATION",
      version: 1,
      cycleType: "SERVICE",
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: facilityLocalDateToServiceDate("2026-01-01"),
      status: "PUBLISHED",
    },
  });
  const group = await db.departmentOperationalCycleKeyTimeGroup.create({
    data: { cycleId: cycle.id, dueLocal: input.dueLocal ?? "12:00" },
  });
  const expectation = await db.operationalCycleKeyTimeDayExpectation.create({
    data: {
      facilityId: facility.id,
      departmentId: department.id,
      serviceDate,
      cycleId: cycle.id,
      cycleStableKey: cycle.stableKey,
      cycleVersion: 1,
      cycleLabel: cycle.label,
      displayPath: "Breakfast → Servery Ready",
      keyTimeGroupId: group.id,
      spaceId: space.id,
      configuredDueLocal: input.dueLocal ?? "12:00",
    },
  });
  const user = await db.user.create({
    data: {
      email: `key-${input.label}-${input.suffix}@example.test`,
      displayName: input.label,
      facilityId: facility.id,
      roleId: input.staffRoleId,
      passwordHash: "hash",
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const access = await db.userFacilityAccess.create({
    data: { userId: user.id, facilityId: facility.id, isActive: true },
  });
  await db.userFacilityRolePeriod.create({
    data: { userFacilityAccessId: access.id, roleKey: RoleKey.STAFF, startsAt: new Date("2026-01-01T00:00:00.000Z") },
  });
  const employee = await db.employee.create({
    data: {
      facilityId: facility.id,
      userId: user.id,
      firstName: "Key",
      lastName: input.label,
      roleType: RoleKey.STAFF,
      primaryDepartmentId: department.id,
    },
  });
  if (input.withSupervisor) {
    const plan = await db.operationalAssignmentPlan.create({
      data: { facilityId: facility.id, departmentId: department.id, serviceDate, status: "CONFIRMED" },
    });
    const assignment = await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: department.id,
        planId: plan.id,
        employeeId: employee.id,
        serviceDate,
        roleKey: "DIETARY_SUPERVISOR_ROUNDING",
        roleLabel: "Supervisor rounding",
        status: "PLANNED",
        unitId: unit.id,
      },
    });
    await db.operationalAssignmentLocation.create({
      data: { assignmentId: assignment.id, unitSpaceId: space.id, unitId: unit.id, labelSnapshot: space.name },
    });
  }
  return { org, facility, department, cycle, expectation, user, space, serviceDate };
}

async function tick(db: Db, facilityIds: string[], now: Date) {
  await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "key-points.overdue" } });
  const summary = await runScheduledEvaluations(db, {
    now,
    facilityIds,
    keys: ["key-points.overdue"],
  });
  const processingFailures = await processScheduledEvaluationOutbox(db, summary.outboxIds);
  assert.equal(processingFailures, 0);
  return summary;
}

async function cleanup(db: Db, suffix: string, userIds: string[]) {
  const facilities = await db.facility.findMany({
    where: { displayName: { contains: suffix } },
    select: { id: true },
  });
  const facilityIds = facilities.map((row) => row.id);
  await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "key-points.overdue" } });
  await db.notificationDelivery.deleteMany({
    where: { notificationRecipient: { notification: { facilityId: { in: facilityIds } } } },
  });
  await db.notificationRecipient.deleteMany({ where: { notification: { facilityId: { in: facilityIds } } } });
  await db.notification.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.notificationOutbox.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.operationalCycleKeyPointActual.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.operationalCycleTimingAdjustment.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.operationalCycleKeyTimeDayExpectation.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.operationalAssignment.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.operationalAssignmentPlan.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.departmentOperationalCycle.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.unitSpace.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.unit.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.employee.deleteMany({ where: { facilityId: { in: facilityIds } } });
  if (userIds.length > 0) {
    await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { userId: { in: userIds } } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await db.department.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
  await db.organization.deleteMany({ where: { name: { contains: suffix } } });
}

test("a required Key Point opens one urgent thread and the actual resolves it", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const userIds: string[] = [];
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    await db.role.upsert({ where: { key: RoleKey.STAFF }, create: { key: RoleKey.STAFF, name: "STAFF" }, update: { isActive: true } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const built = await buildPoint(db, {
      suffix,
      zone,
      label: "ready",
      staffRoleId: staffRole.id,
      withSupervisor: true,
    });
    userIds.push(built.user.id);
    const quiet = await tick(db, [built.facility.id], at("11:50", zone));
    assert.equal(quiet.transitions, 0);
    const exact = await tick(db, [built.facility.id], at("12:00", zone));
    assert.equal(exact.transitions, 0);
    const opened = await tick(db, [built.facility.id], at("12:05", zone));
    assert.equal(opened.transitions, 1);
    const again = await tick(db, [built.facility.id], at("12:10", zone));
    assert.equal(again.transitions, 0);
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: built.facility.id, eventType: "milestone.overdue" } }),
      1,
    );
    const notice = await db.notification.findFirstOrThrow({ where: { facilityId: built.facility.id } });
    assert.equal(notice.priority, "URGENT");
    assert.equal(notice.kind, "OPERATIONAL");
    assert.equal(notice.requiresAcknowledgement, true);
    assert.equal(notice.actionPath, "/staffing/cycles");
    assert.equal(notice.resolvedAt, null);
    const recipients = await db.notificationRecipient.findMany({ where: { notificationId: notice.id } });
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0]?.reason, "ON_DUTY_SUPERVISOR");
    assert.match(recipients[0]?.explanation ?? "", /on-duty supervisor/i);
    assert.equal(
      await db.notificationDelivery.count({ where: { notificationRecipientId: recipients[0]!.id, channel: "IN_APP" } }),
      1,
    );
    assert.equal(await getActiveAttentionCountForUser(db, { userId: built.user.id, facilityId: built.facility.id }), 1);
    const center = await loadNotificationCenter(db, {
      userId: built.user.id,
      facilityId: built.facility.id,
      timeZone: zone,
      now: at("12:10", zone),
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") {
      assert.equal(center.needsAttention.length, 1);
      assert.equal(center.needsAttention[0]?.actionLabel, "Review Key Point");
      assert.equal(center.needsAttention[0]?.priority, "URGENT");
    }
    await markNotificationRead(db, { notificationId: notice.id, userId: built.user.id, facilityId: built.facility.id });
    await acknowledgeNotification(db, { notificationId: notice.id, userId: built.user.id, facilityId: built.facility.id });
    assert.equal(await getActiveAttentionCountForUser(db, { userId: built.user.id, facilityId: built.facility.id }), 1);
    const recorded = await completeKeyTimeDayExpectation(
      { session: session(built.user.id, built.facility.id, "STAFF"), expectationId: built.expectation.id, now: at("12:08", zone) },
      db,
    );
    assert.equal(recorded.ok, true);
    const resolved = await db.notification.findUniqueOrThrow({ where: { id: notice.id } });
    assert.ok(resolved.resolvedAt);
    assert.equal(resolved.expiresAt, null);
    assert.equal(await getActiveAttentionCountForUser(db, { userId: built.user.id, facilityId: built.facility.id }), 0);
    const after = await loadNotificationCenter(db, {
      userId: built.user.id,
      facilityId: built.facility.id,
      timeZone: zone,
      now: at("12:10", zone),
    });
    assert.equal(after.status, "ready");
    if (after.status === "ready") {
      assert.equal(after.needsAttention.length, 0);
      assert.equal(after.resolved.length, 1);
    }
  } finally {
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});

test("the same UTC instant is overdue in New York and not yet due in Chicago", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  try {
    await db.role.upsert({ where: { key: RoleKey.STAFF }, create: { key: RoleKey.STAFF, name: "STAFF" }, update: { isActive: true } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const ny = await buildPoint(db, { suffix: `${suffix}-ny`, zone: "America/New_York", label: "ny", staffRoleId: staffRole.id, withSupervisor: true });
    const chicago = await buildPoint(db, { suffix: `${suffix}-chi`, zone: "America/Chicago", label: "chi", staffRoleId: staffRole.id, withSupervisor: true });
    userIds.push(ny.user.id, chicago.user.id);
    const summary = await tick(db, [ny.facility.id, chicago.facility.id], new Date("2026-10-29T16:05:00.000Z"));
    assert.equal(summary.transitions, 1);
    assert.equal(await db.notification.count({ where: { facilityId: ny.facility.id } }), 1);
    assert.equal(await db.notification.count({ where: { facilityId: chicago.facility.id } }), 0);
  } finally {
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});

test("NONE, OPTIONAL, department grain, and an existing actual do not open overdue attention", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const userIds: string[] = [];
  try {
    await db.role.upsert({ where: { key: RoleKey.STAFF }, create: { key: RoleKey.STAFF, name: "STAFF" }, update: { isActive: true } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const none = await buildPoint(db, { suffix: `${suffix}-none`, zone, label: "none", staffRoleId: staffRole.id, withSupervisor: true, tracking: "NONE", stableKey: "meal_due" });
    const optional = await buildPoint(db, { suffix: `${suffix}-opt`, zone, label: "opt", staffRoleId: staffRole.id, withSupervisor: true, tracking: "OPTIONAL", stableKey: "optional_point" });
    const department = await buildPoint(db, { suffix: `${suffix}-dept`, zone, label: "dept", staffRoleId: staffRole.id, withSupervisor: true, grain: "DEPARTMENT", stableKey: "department_point" });
    const early = await buildPoint(db, { suffix: `${suffix}-early`, zone, label: "early", staffRoleId: staffRole.id, withSupervisor: true, stableKey: "already_done" });
    userIds.push(none.user.id, optional.user.id, department.user.id, early.user.id);
    await db.operationalCycleKeyPointActual.create({
      data: {
        facilityId: early.facility.id,
        departmentId: early.department.id,
        serviceDate: early.serviceDate,
        cycleId: early.cycle.id,
        cycleStableKey: early.cycle.stableKey,
        cycleVersion: 1,
        spaceId: early.space.id,
        actualLocal: "11:40",
        recordedAt: at("11:40", zone),
      },
    });
    const summary = await tick(
      db,
      [none.facility.id, optional.facility.id, department.facility.id, early.facility.id],
      at("12:05", zone),
    );
    assert.equal(summary.transitions, 0);
    assert.equal(
      await db.notificationOutbox.count({
        where: { facilityId: { in: [none.facility.id, optional.facility.id, department.facility.id, early.facility.id] } },
      }),
      0,
    );
  } finally {
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});

test("moving the due time forward ends attention without calling the Key Point complete", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const userIds: string[] = [];
  try {
    await db.role.upsert({ where: { key: RoleKey.STAFF }, create: { key: RoleKey.STAFF, name: "STAFF" }, update: { isActive: true } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const built = await buildPoint(db, { suffix, zone, label: "moved", staffRoleId: staffRole.id, withSupervisor: true });
    userIds.push(built.user.id);
    await tick(db, [built.facility.id], at("12:05", zone));
    const moved = await recordOperationalTimingAdjustment(
      {
        session: session(built.user.id, built.facility.id, "SUPERVISOR"),
        cycleId: built.cycle.id,
        serviceDate: built.serviceDate,
        adjustedDueLocal: "12:30",
        reason: "Service is running later",
        now: at("12:06", zone),
      },
      db,
    );
    assert.equal(moved.ok, true);
    const notice = await db.notification.findFirstOrThrow({ where: { facilityId: built.facility.id } });
    assert.equal(notice.resolvedAt, null);
    assert.ok(notice.expiresAt);
    const metadata = notice.metadata as Prisma.JsonObject;
    assert.equal(metadata.endedReason, "deadline_moved");
    const center = await loadNotificationCenter(db, {
      userId: built.user.id,
      facilityId: built.facility.id,
      timeZone: zone,
      now: at("12:06", zone),
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") {
      assert.equal(center.ended.length, 1);
      assert.equal(center.resolved.length, 0);
      assert.equal(center.needsAttention.length, 0);
    }
    assert.equal(await db.operationalCycleKeyPointActual.count({ where: { facilityId: built.facility.id } }), 0);
  } finally {
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});

test("an overdue Key Point with no on-duty supervisor still keeps the source condition", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const userIds: string[] = [];
  try {
    await db.role.upsert({ where: { key: RoleKey.STAFF }, create: { key: RoleKey.STAFF, name: "STAFF" }, update: { isActive: true } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const built = await buildPoint(db, { suffix, zone, label: "alone", staffRoleId: staffRole.id, withSupervisor: false });
    userIds.push(built.user.id);
    const summary = await tick(db, [built.facility.id], at("12:05", zone));
    assert.equal(summary.transitions, 1);
    const notice = await db.notification.findFirstOrThrow({ where: { facilityId: built.facility.id } });
    assert.equal(notice.priority, "URGENT");
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: notice.id } }), 0);
  } finally {
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});
