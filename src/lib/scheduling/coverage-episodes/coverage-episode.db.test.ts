/**
 * Coverage episode lifecycle.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
} from "@/lib/operational-time";
import { acknowledgeNotification, markNotificationRead } from "@/lib/notifications/lifecycle";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { loadCoverageSlotSnapshot } from "./observe";
import { recordCoverageEpisodeTransitions } from "./record";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

test("assignment changes open, restore, and repeat a coverage episode", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const zone = "America/New_York";
  const serviceDate = facilityLocalDateToServiceDate("2026-10-29");
  const duringService = parseFacilityLocalScheduledStartOnDate("08:00", "2026-10-29", zone)!;
  const afterService = parseFacilityLocalScheduledStartOnDate("11:00", "2026-10-29", zone)!;
  const userIds: string[] = [];
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Coverage ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Coverage Terrace ${suffix}`, timezone: zone },
    });
    const otherFacility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Coverage Other ${suffix}`, timezone: zone },
    });
    const department = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition" },
    });
    const otherDepartment = await db.department.create({
      data: { facilityId: otherFacility.id, key: "DIETARY", name: "Food and Nutrition" },
    });
    const unit = await db.unit.create({
      data: { facilityId: facility.id, name: `Neighborhood ${suffix}`, unitType: "RESIDENT_AREA", hierarchyRole: "NEIGHBORHOOD" },
    });
    const space = await db.unitSpace.create({
      data: { facilityId: facility.id, unitId: unit.id, name: `Dining ${suffix}`, spaceType: "SERVICE_AREA" },
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
        stableKey: `coverage-${suffix}`,
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
      data: {
        facilityId: facility.id,
        departmentId: department.id,
        serviceDate,
        status: "CONFIRMED",
      },
    });

    async function person(label: string, linked: boolean) {
      let userId: string | null = null;
      if (linked) {
        const user = await db.user.create({
          data: {
            email: `coverage-${label}-${suffix}@example.test`,
            displayName: label,
            facilityId: facility.id,
            roleId: staffRole.id,
            passwordHash: "hash",
            emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
        userIds.push(user.id);
        userId = user.id;
        const access = await db.userFacilityAccess.create({
          data: { userId: user.id, facilityId: facility.id, isActive: true },
        });
        await db.userFacilityRolePeriod.create({
          data: {
            userFacilityAccessId: access.id,
            roleKey: RoleKey.STAFF,
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
      }
      return db.employee.create({
        data: {
          facilityId: facility.id,
          userId,
          firstName: "Coverage",
          lastName: label,
          roleType: RoleKey.STAFF,
          primaryDepartmentId: department.id,
        },
      });
    }

    const server = await person("server", true);
    const supervisor = await person("supervisor", true);
    const unlinked = await person("unlinked", false);
    const usersBefore = await db.user.count();

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
    await assign(unlinked.id, "DIETARY_SUPERVISOR_ROUNDING", "Supervisor rounding");

    const scope = {
      facilityId: facility.id,
      departmentId: department.id,
      serviceDateKey: "2026-10-29",
    };

    async function observe() {
      return loadCoverageSlotSnapshot(db, scope);
    }

    const covered = await observe();
    const slot = [...covered.values()].find((row) => row.responsibility === "SERVER");
    assert.ok(slot);
    assert.equal(slot.state, "COVERED");

    const quiet = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: covered,
        occurredAt: duringService,
        sourceType: "assignment_event",
        sourceId: `quiet-${suffix}`,
      }),
    );
    assert.deepEqual(quiet, []);
    assert.equal(await db.coverageEpisode.count({ where: { facilityId: facility.id } }), 0);

    const beforeCancel = covered;
    const openedIds = await db.$transaction(async (tx) => {
      await tx.operationalAssignment.update({
        where: { id: serverAssignment.id },
        data: { status: "CANCELLED" },
      });
      const first = await recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: beforeCancel,
        occurredAt: duringService,
        sourceType: "assignment_event",
        sourceId: `cancel-${suffix}`,
      });
      const second = await recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: beforeCancel,
        occurredAt: duringService,
        sourceType: "assignment_event",
        sourceId: `cancel-${suffix}`,
      });
      assert.deepEqual(second, []);
      return first;
    });
    assert.equal(openedIds.length, 1);
    const episodeA = await db.coverageEpisode.findFirstOrThrow({
      where: { facilityId: facility.id, closedAt: null },
    });
    assert.equal(episodeA.openingState, "UNCOVERED");
    assert.equal(await db.coverageEpisodeTransition.count({ where: { episodeId: episodeA.id } }), 1);
    const outbox = await db.notificationOutbox.findUniqueOrThrow({ where: { id: openedIds[0] } });
    assert.equal(outbox.eventType, "coverage.became_uncovered");
    assert.equal(await db.operationalAssignmentEvent.count({ where: { facilityId: facility.id } }), 0);

    const processed = await processNotificationOutboxRow(db, { outboxId: openedIds[0]! });
    assert.equal(processed.outcome, "applied");
    assert.equal(processed.recipientCount, 1);
    const secondProcess = await processNotificationOutboxRow(db, { outboxId: openedIds[0]! });
    assert.equal(secondProcess.outcome, "already_processed");
    const notification = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, category: "coverage" },
      include: { recipients: true },
    });
    assert.equal(notification.recipients.length, 1);
    assert.equal(notification.recipients[0]?.userId, supervisor.userId);
    assert.equal(notification.priority, "CRITICAL");
    assert.match(notification.dedupeKey, new RegExp(episodeA.id));
    assert.equal(notification.actionPath, "/staffing?date=2026-10-29");
    assert.equal(await db.user.count(), usersBefore);

    const read = await markNotificationRead(db, {
      facilityId: facility.id,
      notificationId: notification.id,
      userId: supervisor.userId!,
    });
    assert.equal(read.resolvedAt, null);
    const ack = await acknowledgeNotification(db, {
      facilityId: facility.id,
      notificationId: notification.id,
      userId: supervisor.userId!,
    });
    assert.equal(ack.resolvedAt, null);
    const center = await loadNotificationCenter(db, {
      userId: supervisor.userId!,
      facilityId: facility.id,
      now: duringService,
      timeZone: zone,
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") {
      assert.equal(center.needsAttention.length, 1);
      assert.equal(center.needsAttention[0]?.title, "Coverage needs attention");
      assert.equal(center.needsAttention[0]?.actionLabel, "Review Coverage");
      assert.equal(center.needsAttention[0]?.actionPath, "/staffing?date=2026-10-29");
      assert.ok(center.needsAttention[0]?.explanations[0]?.includes("on-duty supervisor"));
    }
    assert.equal(
      await getActiveAttentionCountForUser(db, { userId: supervisor.userId!, facilityId: facility.id }),
      1,
    );
    const otherCenter = await loadNotificationCenter(db, {
      userId: supervisor.userId!,
      facilityId: otherFacility.id,
      now: duringService,
      timeZone: zone,
    });
    assert.equal(otherCenter.status, "no_access");
    assert.equal(await db.coverageEpisode.count({ where: { facilityId: otherFacility.id } }), 0);
    assert.equal(await db.coverageEpisode.count({ where: { departmentId: otherDepartment.id } }), 0);

    const restoredIds = await db.$transaction(async (tx) => {
      const beforeRestore = await loadCoverageSlotSnapshot(tx, scope);
      const row = await tx.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: department.id,
          planId: plan.id,
          employeeId: server.id,
          serviceDate,
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "PLANNED",
          unitId: unit.id,
        },
      });
      await tx.operationalAssignmentLocation.create({
        data: { assignmentId: row.id, unitSpaceId: space.id, unitId: unit.id, labelSnapshot: space.name },
      });
      return recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: beforeRestore,
        occurredAt: duringService,
        sourceType: "assignment_event",
        sourceId: `restore-${suffix}`,
      });
    });
    assert.equal(restoredIds.length, 1);
    const restoredEvent = await db.notificationOutbox.findUniqueOrThrow({ where: { id: restoredIds[0] } });
    assert.equal(restoredEvent.eventType, "coverage.restored");
    const closedA = await db.coverageEpisode.findUniqueOrThrow({ where: { id: episodeA.id } });
    assert.equal(closedA.closeReason, "RESTORED");
    assert.ok(closedA.closedAt);
    const resolved = await processNotificationOutboxRow(db, { outboxId: restoredIds[0]! });
    assert.equal(resolved.outcome, "resolved");
    assert.ok((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).resolvedAt);
    assert.equal(
      await getActiveAttentionCountForUser(db, { userId: supervisor.userId!, facilityId: facility.id }),
      0,
    );
    const repeatIds = await db.$transaction(async (tx) => {
      const beforeRepeat = await loadCoverageSlotSnapshot(tx, scope);
      const openServer = await tx.operationalAssignment.findFirstOrThrow({
        where: { facilityId: facility.id, roleKey: "SERVER", status: "PLANNED" },
        select: { id: true },
      });
      await tx.operationalAssignment.update({
        where: { id: openServer.id },
        data: { status: "CANCELLED" },
      });
      return recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: beforeRepeat,
        occurredAt: duringService,
        sourceType: "assignment_event",
        sourceId: `repeat-${suffix}`,
      });
    });
    assert.equal(repeatIds.length, 1);
    const episodeB = await db.coverageEpisode.findFirstOrThrow({
      where: { facilityId: facility.id, closedAt: null },
    });
    assert.notEqual(episodeB.id, episodeA.id);
    const repeatProcessed = await processNotificationOutboxRow(db, { outboxId: repeatIds[0]! });
    assert.equal(repeatProcessed.outcome, "applied");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id, category: "coverage" } }), 2);

    const unchanged = await observe();
    const sameState = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: unchanged,
        occurredAt: duringService,
        sourceType: "assignment_event",
        sourceId: `same-${suffix}`,
      }),
    );
    assert.deepEqual(sameState, []);
    assert.equal(await db.coverageEpisodeTransition.count({ where: { episodeId: episodeB.id } }), 1);

    const windowIds = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: unchanged,
        occurredAt: afterService,
        sourceType: "assignment_event",
        sourceId: `window-${suffix}`,
      }),
    );
    assert.equal(windowIds.length, 1);
    const expiredEvent = await db.notificationOutbox.findUniqueOrThrow({ where: { id: windowIds[0] } });
    assert.equal(expiredEvent.eventType, "attention.expired");
    const expired = await processNotificationOutboxRow(db, { outboxId: windowIds[0]! });
    assert.equal(expired.outcome, "expired");
    const windowClosed = await db.coverageEpisode.findUniqueOrThrow({ where: { id: episodeB.id } });
    assert.equal(windowClosed.closeReason, "SERVICE_WINDOW_ENDED");
    const endedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, dedupeKey: { contains: episodeB.id } },
    });
    assert.equal(endedNotice.resolvedAt, null);
    assert.ok(endedNotice.expiresAt);
    assert.equal(
      await getActiveAttentionCountForUser(db, { userId: supervisor.userId!, facilityId: facility.id }),
      0,
    );

    await db.scheduleEntry.create({
      data: {
        employeeId: server.id,
        departmentId: department.id,
        date: serviceDate,
        shift: "BREAKFAST",
        calledOffAt: duringService,
        callOffReason: "Sick",
      },
    });
    const callOffBefore = await db.coverageEpisode.count({ where: { facilityId: facility.id } });
    const callOffIds = await db.$transaction(async (tx) => {
      const before = await loadCoverageSlotSnapshot(tx, scope);
      return recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before,
        occurredAt: duringService,
        sourceType: "schedule_call_off",
        sourceId: `call-off-${suffix}`,
      });
    });
    assert.deepEqual(callOffIds, []);
    assert.equal(await db.coverageEpisode.count({ where: { facilityId: facility.id } }), callOffBefore);

    const racedBefore = await observe();
    const racedSlot = racedBefore.get(slot.key);
    assert.ok(racedSlot);
    const staleCovered = new Map(racedBefore);
    staleCovered.set(slot.key, { ...racedSlot, state: "COVERED" });
    const [firstRace, secondRace] = await Promise.all([
      db.$transaction((tx) =>
        recordCoverageEpisodeTransitions(tx, {
          ...scope,
          before: staleCovered,
          occurredAt: duringService,
          sourceType: "assignment_event",
          sourceId: `race-a-${suffix}`,
        }),
      ),
      db.$transaction((tx) =>
        recordCoverageEpisodeTransitions(tx, {
          ...scope,
          before: staleCovered,
          occurredAt: duringService,
          sourceType: "assignment_event",
          sourceId: `race-b-${suffix}`,
        }),
      ),
    ]);
    const raceEpisodes = await db.coverageEpisode.findMany({
      where: { facilityId: facility.id, closedAt: null },
    });
    assert.equal(raceEpisodes.length, 1);
    assert.equal(firstRace.length + secondRace.length >= 1, true);
    assert.ok(template.id);
  } finally {
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
    await db.scheduleEntry.deleteMany({ where: { department: { facilityId: { in: facilityIds } } } });
    await db.operationalAssignment.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.operationalAssignmentPlan.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.operationalAssignmentTemplate.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.departmentOperationalCycle.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.departmentOperationalProfile.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.unitSpace.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.unit.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.employee.deleteMany({ where: { facilityId: { in: facilityIds } } });
    if (userIds.length > 0) {
      await db.userFacilityRolePeriod.deleteMany({
        where: { userFacilityAccess: { userId: { in: userIds } } },
      });
      await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await db.department.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
    await db.organization.deleteMany({ where: { name: `Coverage ${suffix}` } });
    await db.$disconnect();
  }
});
