/**
 * Coverage time evaluation.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey, type Prisma } from "@prisma/client";

import { acknowledgeNotification, markNotificationRead } from "@/lib/notifications/lifecycle";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
} from "@/lib/operational-time";
import { processScheduledEvaluationOutbox, runScheduledEvaluations } from "@/lib/scheduled-evaluation/run";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { loadCoverageSlotSnapshot } from "./observe";
import { recordCoverageEpisodeTransitions } from "./record";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

type Db = PrismaClient;

async function buildFacility(
  db: Db,
  input: { suffix: string; zone: string; label: string; staffRoleId: string },
) {
  const serviceDate = facilityLocalDateToServiceDate("2026-10-29");
  const org = await db.organization.create({ data: { name: `Time ${input.suffix} ${input.label}` } });
  const facility = await db.facility.create({
    data: { organizationId: org.id, displayName: `Time ${input.label} ${input.suffix}`, timezone: input.zone },
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
    data: { facilityId: facility.id, unitId: unit.id, name: `Dining ${input.suffix}`, spaceType: "SERVICE_AREA" },
  });
  await db.unitSpaceResponsibility.create({ data: { spaceId: space.id, departmentId: department.id } });
  const profile = await db.departmentOperationalProfile.create({
    data: { facilityId: facility.id, departmentId: department.id, name: "Food", version: 1, status: "ACTIVE" },
  });
  const archetype = await db.departmentRoomArchetype.create({
    data: { profileId: profile.id, key: "SERVERY", name: "Servery" },
  });
  await db.departmentRoomArchetypeBinding.create({
    data: { profileId: profile.id, archetypeId: archetype.id, unitSpaceId: space.id },
  });
  await db.departmentOperationalCycle.create({
    data: {
      facilityId: facility.id,
      departmentId: department.id,
      stableKey: "breakfast",
      label: "Breakfast",
      cycleType: "SERVICE",
      startLocal: "07:00",
      endLocal: "10:00",
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: facilityLocalDateToServiceDate("2026-01-01"),
      status: "PUBLISHED",
    },
  });
  const template = await db.operationalAssignmentTemplate.create({
    data: {
      facilityId: facility.id,
      departmentId: department.id,
      stableKey: `time-${input.suffix}`,
      name: "Breakfast coverage",
      status: "PUBLISHED",
      isActive: true,
      items: {
        create: {
          roleKey: "SERVER",
          roleLabel: "Server",
          requiredCount: 1,
          applicableOperationalTypeKeys: ["SERVERY"],
          applicableOperationalCycleStableKeys: ["breakfast"],
        },
      },
    },
  });
  const plan = await db.operationalAssignmentPlan.create({
    data: { facilityId: facility.id, departmentId: department.id, serviceDate, status: "CONFIRMED" },
  });
  const user = await db.user.create({
    data: {
      email: `time-${input.label}-${input.suffix}@example.test`,
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
  async function employee(name: string, userId: string | null) {
    return db.employee.create({
      data: {
        facilityId: facility.id,
        userId,
        firstName: "Time",
        lastName: name,
        roleType: RoleKey.STAFF,
        primaryDepartmentId: department.id,
      },
    });
  }
  const supervisor = await employee("supervisor", user.id);
  const server = await employee("server", null);
  async function assign(employeeId: string, roleKey: string, roleLabel: string) {
    const row = await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: department.id,
        planId: plan.id,
        employeeId,
        serviceDate,
        roleKey,
        roleLabel,
        status: "PLANNED",
        unitId: unit.id,
      },
    });
    await db.operationalAssignmentLocation.create({
      data: { assignmentId: row.id, unitSpaceId: space.id, unitId: unit.id, labelSnapshot: space.name },
    });
    return row;
  }
  const serverAssignment = await assign(server.id, "SERVER", "Server");
  await assign(supervisor.id, "DIETARY_SUPERVISOR_ROUNDING", "Supervisor rounding");
  return { org, facility, department, template, user, serverAssignment, serviceDate };
}

async function uncover(db: Db, built: Awaited<ReturnType<typeof buildFacility>>, at: Date, sourceId: string) {
  const scope = {
    facilityId: built.facility.id,
    departmentId: built.department.id,
    serviceDateKey: "2026-10-29",
  };
  const ids = await db.$transaction(async (tx) => {
    const before = await loadCoverageSlotSnapshot(tx, scope);
    await tx.operationalAssignment.update({
      where: { id: built.serverAssignment.id },
      data: { status: "CANCELLED" },
    });
    return recordCoverageEpisodeTransitions(tx, {
      ...scope,
      before,
      occurredAt: at,
      sourceType: "assignment_event",
      sourceId,
    });
  });
  assert.equal(ids.length, 1);
  for (const id of ids) {
    const processed = await db.notificationOutbox.findUniqueOrThrow({ where: { id: id! } });
    assert.equal(processed.eventType, "coverage.became_uncovered");
    const result = await processNotificationOutboxRow(db, { outboxId: id! });
    assert.equal(result.outcome, "applied");
  }
  const notification = await db.notification.findFirstOrThrow({
    where: { facilityId: built.facility.id, category: "coverage", resolvedAt: null },
  });
  return notification;
}

async function tick(db: Db, facilityId: string, now: Date) {
  await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "coverage.time-boundaries" } });
  const summary = await runScheduledEvaluations(db, { now, facilityIds: [facilityId] });
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
  await db.notificationDelivery.deleteMany({
    where: { notificationRecipient: { notification: { facilityId: { in: facilityIds } } } },
  });
  await db.notificationRecipient.deleteMany({ where: { notification: { facilityId: { in: facilityIds } } } });
  await db.notification.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.notificationOutbox.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.coverageEpisodeTransition.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.coverageEpisode.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.operationalAssignment.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.operationalAssignmentPlan.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.operationalAssignmentTemplate.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.departmentOperationalCycle.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.departmentOperationalProfile.deleteMany({ where: { facilityId: { in: facilityIds } } });
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

test("time raises one coverage thread, then the service window ends it", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const userIds: string[] = [];
  const at = (clock: string) => parseFacilityLocalScheduledStartOnDate(clock, "2026-10-29", zone)!;
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const built = await buildFacility(db, { suffix, zone, label: "ny", staffRoleId: staffRole.id });
    userIds.push(built.user.id);
    const opened = await uncover(db, built, at("05:30"), `open-${suffix}`);
    assert.equal(opened.priority, "NEEDS_ATTENTION");
    await markNotificationRead(db, { facilityId: built.facility.id, notificationId: opened.id, userId: built.user.id });
    await acknowledgeNotification(db, {
      facilityId: built.facility.id,
      notificationId: opened.id,
      userId: built.user.id,
    });

    const quiet = await tick(db, built.facility.id, at("05:40"));
    assert.equal(quiet.reevaluations, 0);
    assert.equal(quiet.transitions, 0);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: opened.id } })).priority, "NEEDS_ATTENTION");

    const urgent = await tick(db, built.facility.id, at("06:40"));
    assert.equal(urgent.reevaluations, 1);
    const risen = await db.notification.findUniqueOrThrow({ where: { id: opened.id } });
    assert.equal(risen.priority, "URGENT");
    assert.equal(risen.resolvedAt, null);
    assert.equal(await db.notification.count({ where: { facilityId: built.facility.id, category: "coverage" } }), 1);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: opened.id } }), 1);
    const afterUrgent = await db.notificationRecipient.findFirstOrThrow({ where: { notificationId: opened.id } });
    assert.ok(afterUrgent.readAt);
    assert.ok(afterUrgent.acknowledgedAt);

    const repeat = await tick(db, built.facility.id, at("06:45"));
    assert.equal(repeat.reevaluations, 0);
    assert.equal(repeat.transitions, 0);

    const critical = await tick(db, built.facility.id, at("08:00"));
    assert.equal(critical.reevaluations, 1);
    const during = await db.notification.findUniqueOrThrow({ where: { id: opened.id } });
    assert.equal(during.priority, "CRITICAL");
    const afterCritical = await db.notificationRecipient.findFirstOrThrow({ where: { notificationId: opened.id } });
    assert.ok(afterCritical.readAt);
    assert.ok(afterCritical.acknowledgedAt);

    const ended = await tick(db, built.facility.id, at("11:00"));
    assert.equal(ended.transitions, 1);
    const episode = await db.coverageEpisode.findFirstOrThrow({ where: { facilityId: built.facility.id } });
    assert.equal(episode.closeReason, "SERVICE_WINDOW_ENDED");
    const notice = await db.notification.findUniqueOrThrow({ where: { id: opened.id } });
    assert.equal(notice.resolvedAt, null);
    assert.ok(notice.expiresAt);
    const metadata = notice.metadata as Prisma.JsonObject;
    assert.equal(metadata.endedReason, "service_window_ended");
    assert.equal(
      await getActiveAttentionCountForUser(db, { userId: built.user.id, facilityId: built.facility.id, now: at("11:00") }),
      0,
    );
    const center = await loadNotificationCenter(db, {
      userId: built.user.id,
      facilityId: built.facility.id,
      now: at("11:00"),
      timeZone: zone,
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") {
      assert.equal(center.needsAttention.length, 0);
      assert.equal(center.resolved.length, 0);
      assert.equal(center.ended.length, 1);
      assert.equal(center.ended[0]?.read, true);
      assert.equal(center.ended[0]?.acknowledged, true);
      assert.equal(center.ended[0]?.section, "ended");
    }
    const again = await tick(db, built.facility.id, at("11:05"));
    assert.equal(again.transitions, 0);
    assert.equal(again.reevaluations, 0);
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: built.facility.id, eventType: "attention.expired" } }),
      1,
    );
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: built.facility.id, eventType: "attention.reevaluate" } }),
      2,
    );
  } finally {
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});

test("a removed coverage requirement expires attention without restoring it", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const userIds: string[] = [];
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const built = await buildFacility(db, { suffix, zone, label: "removed", staffRoleId: staffRole.id });
    userIds.push(built.user.id);
    const at = parseFacilityLocalScheduledStartOnDate("08:00", "2026-10-29", zone)!;
    const opened = await uncover(db, built, at, `removed-${suffix}`);
    await db.operationalAssignmentTemplate.update({ where: { id: built.template.id }, data: { isActive: false } });
    const summary = await tick(db, built.facility.id, at);
    assert.equal(summary.transitions, 1);
    const episode = await db.coverageEpisode.findFirstOrThrow({ where: { facilityId: built.facility.id } });
    assert.equal(episode.closeReason, "REQUIREMENT_REMOVED");
    const notice = await db.notification.findUniqueOrThrow({ where: { id: opened.id } });
    assert.equal(notice.resolvedAt, null);
    assert.ok(notice.expiresAt);
    const metadata = notice.metadata as Prisma.JsonObject;
    assert.equal(metadata.endedReason, "requirement_removed");
    assert.equal(
      await getActiveAttentionCountForUser(db, { userId: built.user.id, facilityId: built.facility.id, now: at }),
      0,
    );
  } finally {
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});

test("two facilities use their own local service clocks", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  const now = new Date("2026-10-29T11:30:00.000Z");
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const ny = await buildFacility(db, { suffix, zone: "America/New_York", label: "east", staffRoleId: staffRole.id });
    const chicago = await buildFacility(db, {
      suffix,
      zone: "America/Chicago",
      label: "central",
      staffRoleId: staffRole.id,
    });
    userIds.push(ny.user.id, chicago.user.id);
    const openedNy = await uncover(db, ny, new Date("2026-10-29T10:00:00.000Z"), `ny-${suffix}`);
    const openedChicago = await uncover(db, chicago, new Date("2026-10-29T10:00:00.000Z"), `chi-${suffix}`);
    await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "coverage.time-boundaries" } });
    const summary = await runScheduledEvaluations(db, {
      now,
      facilityIds: [ny.facility.id, chicago.facility.id],
    });
    assert.equal(await processScheduledEvaluationOutbox(db, summary.outboxIds), 0);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: openedNy.id } })).priority, "CRITICAL");
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: openedChicago.id } })).priority, "URGENT");
    assert.notEqual(openedNy.id, openedChicago.id);
  } finally {
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});

test("a held lease skips coverage evaluation and an overlap does not double-close", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const userIds: string[] = [];
  try {
    await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "coverage.time-boundaries" } });
    await db.scheduledEvaluationLease.create({
      data: {
        evaluatorKey: "coverage.time-boundaries",
        lockedUntil: new Date(Date.now() + 60_000),
        lockedBy: "held",
      },
    });
    const skipped = await runScheduledEvaluations(db, { now: new Date("2026-10-29T15:00:00.000Z") });
    assert.equal(skipped.skipped, 1);
    assert.equal(skipped.transitions, 0);
    await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "coverage.time-boundaries" } });

    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const built = await buildFacility(db, { suffix, zone, label: "overlap", staffRoleId: staffRole.id });
    userIds.push(built.user.id);
    await uncover(db, built, parseFacilityLocalScheduledStartOnDate("08:00", "2026-10-29", zone)!, `overlap-${suffix}`);
    const after = parseFacilityLocalScheduledStartOnDate("11:00", "2026-10-29", zone)!;
    const [first, second] = await Promise.all([
      runScheduledEvaluations(db, { now: after, facilityIds: [built.facility.id] }),
      runScheduledEvaluations(db, { now: after, facilityIds: [built.facility.id] }),
    ]);
    await processScheduledEvaluationOutbox(db, [...first.outboxIds, ...second.outboxIds]);
    assert.equal(first.transitions + second.transitions, 1);
    assert.equal(
      await db.coverageEpisode.count({
        where: { facilityId: built.facility.id, closeReason: "SERVICE_WINDOW_ENDED" },
      }),
      1,
    );
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: built.facility.id, eventType: "attention.expired" } }),
      1,
    );
  } finally {
    await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "coverage.time-boundaries" } });
    await cleanup(db, suffix, userIds);
    await db.$disconnect();
  }
});
