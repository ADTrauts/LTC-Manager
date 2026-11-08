/**
 * SQL-backed Notification Center reads.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { NotificationRecipientReason, PrismaClient, RoleKey } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { enqueueNotificationEvent } from "./outbox";
import { acknowledgeNotification, markNotificationRead, NotificationLifecycleError } from "./lifecycle";
import { loadNotificationCenter, getActiveAttentionCountForUser } from "./queries";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

test("notification center shows one user's facility attention and refuses everyone else", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  const now = new Date("2026-10-29T15:00:00.000Z");
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const org = await db.organization.create({ data: { name: `N2 ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `N2 Facility ${suffix}`, timezone: "America/New_York" },
    });
    const otherFacility = await db.facility.create({
      data: { organizationId: org.id, displayName: `N2 Other ${suffix}`, timezone: "America/New_York" },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: `N2D_${suffix}`, name: "Food and Nutrition" },
    });
    const plant = await db.department.create({
      data: { facilityId: facility.id, key: `N2P_${suffix}`, name: "Plant" },
    });

    async function person(input: { facilityId: string; label: string; roleKey: RoleKey; departmentId?: string }) {
      const user = await db.user.create({
        data: {
          email: `n2-${input.label}-${suffix}@example.test`,
          displayName: `N2 ${input.label}`,
          facilityId: input.facilityId,
          roleId: managerRole.id,
          passwordHash: "hash",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      userIds.push(user.id);
      const access = await db.userFacilityAccess.create({
        data: { userId: user.id, facilityId: input.facilityId, isActive: true },
      });
      await db.userFacilityRolePeriod.create({
        data: {
          userFacilityAccessId: access.id,
          roleKey: input.roleKey,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      const employee = await db.employee.create({
        data: {
          facilityId: input.facilityId,
          userId: user.id,
          firstName: "N2",
          lastName: input.label,
          roleType: input.roleKey,
          primaryDepartmentId: input.departmentId ?? null,
        },
      });
      return { user, employee, access };
    }

    const assignee = await person({
      facilityId: facility.id,
      label: "assignee",
      roleKey: RoleKey.STAFF,
      departmentId: dietary.id,
    });
    const stranger = await person({
      facilityId: facility.id,
      label: "stranger",
      roleKey: RoleKey.STAFF,
      departmentId: dietary.id,
    });
    const outsider = await person({
      facilityId: otherFacility.id,
      label: "outsider",
      roleKey: RoleKey.STAFF,
    });
    const supportBefore = await db.supportStaffNotification.count();

    async function intake(event: {
      departmentId: string;
      eventType: "coverage.became_at_risk" | "assignment.changed";
      aggregateId: string;
      dedupeKey: string;
      occurredAt: Date;
      payload: Record<string, string>;
    }) {
      return db.$transaction((tx) =>
        enqueueNotificationEvent(tx, {
          facilityId: facility.id,
          occurredAt: event.occurredAt,
          departmentId: event.departmentId,
          eventType: event.eventType,
          aggregateType: event.eventType.startsWith("coverage") ? "coverage_responsibility" : "assignment_change",
          aggregateId: event.aggregateId,
          payload: event.payload,
          dedupeKey: event.dedupeKey,
        }),
      );
    }

    const { processNotificationOutboxRow } = await import("./processing");
    const coverage = await intake({
      departmentId: dietary.id,
      eventType: "coverage.became_at_risk",
      aggregateId: `coverage-${suffix}`,
      dedupeKey: `coverage-${suffix}`,
      occurredAt: new Date("2026-10-29T12:00:00.000Z"),
      payload: {
        serviceDate: "2026-10-29",
        departmentId: dietary.id,
        spaceId: `space-${suffix}`,
        responsibility: "SERVER",
        cycleStableKey: "breakfast",
        coverageEpisodeId: `episode-${suffix}`,
        coverageState: "AT_RISK",
        locationLabel: "North dining room",
        cycleLabel: "Breakfast",
      },
    });
    assert.equal((await processNotificationOutboxRow(db, { outboxId: coverage.id })).recipientCount, 0);

    const older = await intake({
      departmentId: dietary.id,
      eventType: "assignment.changed",
      aggregateId: `older-${suffix}`,
      dedupeKey: `older-${suffix}`,
      occurredAt: new Date("2026-10-29T11:00:00.000Z"),
      payload: {
        serviceState: "active",
        assignmentId: `older-${suffix}`,
        assignmentEventId: `event-older-${suffix}`,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee.id,
        subjectLabel: "Breakfast server",
      },
    });
    const newer = await intake({
      departmentId: plant.id,
      eventType: "assignment.changed",
      aggregateId: `newer-${suffix}`,
      dedupeKey: `newer-${suffix}`,
      occurredAt: new Date("2026-10-29T13:00:00.000Z"),
      payload: {
        serviceState: "active",
        assignmentId: `newer-${suffix}`,
        assignmentEventId: `event-newer-${suffix}`,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee.id,
        subjectLabel: "Plant round",
      },
    });
    const update = await intake({
      departmentId: dietary.id,
      eventType: "assignment.changed",
      aggregateId: `update-${suffix}`,
      dedupeKey: `update-${suffix}`,
      occurredAt: new Date("2026-10-29T10:00:00.000Z"),
      payload: {
        serviceState: "inactive",
        assignmentId: `update-${suffix}`,
        assignmentEventId: `event-update-${suffix}`,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee.id,
        subjectLabel: "An assignment changed",
      },
    });
    assert.equal((await processNotificationOutboxRow(db, { outboxId: older.id })).outcome, "applied");
    assert.equal((await processNotificationOutboxRow(db, { outboxId: newer.id })).outcome, "applied");
    assert.equal((await processNotificationOutboxRow(db, { outboxId: update.id })).outcome, "applied");

    const olderRow = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceId: { contains: `older-${suffix}` } },
    });
    await db.notification.update({ where: { id: olderRow.id }, data: { priority: "CRITICAL" } });

    const message = await db.notification.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        kind: "COMMUNICATION",
        category: "message",
        priority: "UPDATE",
        sourceType: "fixture",
        sourceId: `message-${suffix}`,
        title: "A message",
        body: "Fixture only",
        dedupeKey: `message-${suffix}`,
        occurredAt: new Date("2026-10-29T14:00:00.000Z"),
        policyVersion: "fixture",
        recipients: {
          create: {
            userId: assignee.user.id,
            reason: NotificationRecipientReason.CURRENT_ASSIGNEE,
            explanation: "Fixture message",
          },
        },
      },
    });

    const scope = { userId: assignee.user.id, facilityId: facility.id, now, timeZone: "America/New_York" };
    const center = await loadNotificationCenter(db, scope);
    assert.equal(center.status, "ready");
    if (center.status !== "ready") return;
    assert.deepEqual(center.needsAttention.map((item) => item.priority), ["CRITICAL", "NEEDS_ATTENTION"]);
    assert.deepEqual(
      center.needsAttention.map((item) => item.departmentName),
      ["Food and Nutrition", "Plant"],
    );
    assert.equal(center.updates.length, 1);
    assert.equal(center.updates[0]?.priority, "UPDATE");
    assert.equal(center.messages.length, 1);
    assert.equal(center.resolved.length, 0);
    assert.equal(center.activeCount, 2);
    assert.equal(await getActiveAttentionCountForUser(db, scope), 2);
    assert.equal(center.needsAttention.some((item) => item.title === "Coverage needs attention"), false);
    assert.equal(
      (await db.notification.count({ where: { facilityId: facility.id, category: "coverage" } })),
      1,
    );

    const raised = center.needsAttention[1]!;
    const read = await markNotificationRead(db, {
      facilityId: facility.id,
      userId: assignee.user.id,
      notificationId: raised.id,
    });
    assert.ok(read.readAt);
    assert.equal(read.acknowledgedAt, null);
    assert.equal(read.resolvedAt, null);
    const afterRead = await loadNotificationCenter(db, scope);
    assert.equal(afterRead.status, "ready");
    if (afterRead.status !== "ready") return;
    assert.equal(afterRead.activeCount, 2);
    assert.equal(afterRead.needsAttention.find((item) => item.id === raised.id)?.read, true);

    await assert.rejects(
      () => acknowledgeNotification(db, { facilityId: facility.id, userId: assignee.user.id, notificationId: raised.id }),
      (error: unknown) => error instanceof NotificationLifecycleError && error.code === "ACKNOWLEDGEMENT_NOT_REQUIRED",
    );
    await assert.rejects(
      () => markNotificationRead(db, { facilityId: facility.id, userId: stranger.user.id, notificationId: raised.id }),
      (error: unknown) => error instanceof NotificationLifecycleError && error.code === "NOT_RECIPIENT",
    );
    await assert.rejects(
      () =>
        markNotificationRead(db, { facilityId: otherFacility.id, userId: outsider.user.id, notificationId: raised.id }),
      (error: unknown) => error instanceof NotificationLifecycleError && error.code === "NOT_FOUND",
    );

    const strangerCenter = await loadNotificationCenter(db, {
      userId: stranger.user.id,
      facilityId: facility.id,
      now,
      timeZone: "America/New_York",
    });
    assert.equal(strangerCenter.status, "ready");
    if (strangerCenter.status === "ready") {
      assert.equal(strangerCenter.needsAttention.length, 0);
      assert.equal(strangerCenter.activeCount, 0);
    }
    assert.equal(
      (await loadNotificationCenter(db, { userId: outsider.user.id, facilityId: facility.id, now, timeZone: "UTC" })).status,
      "no_access",
    );

    await db.notification.update({
      where: { id: raised.id },
      data: { resolvedAt: new Date("2026-10-29T14:30:00.000Z") },
    });
    const afterResolve = await loadNotificationCenter(db, scope);
    assert.equal(afterResolve.status, "ready");
    if (afterResolve.status !== "ready") return;
    assert.equal(afterResolve.needsAttention.some((item) => item.id === raised.id), false);
    assert.equal(afterResolve.resolved.some((item) => item.id === raised.id), true);
    assert.equal(afterResolve.activeCount, 1);

    await db.userFacilityAccess.update({ where: { id: assignee.access.id }, data: { isActive: false } });
    assert.equal((await loadNotificationCenter(db, scope)).status, "no_access");
    assert.equal(await getActiveAttentionCountForUser(db, scope), null);
    await assert.rejects(
      () => markNotificationRead(db, { facilityId: facility.id, userId: assignee.user.id, notificationId: olderRow.id }),
      (error: unknown) => error instanceof NotificationLifecycleError && error.code === "FACILITY_ACCESS_DENIED",
    );
    assert.equal(await db.supportStaffNotification.count(), supportBefore);
    assert.equal(message.kind, "COMMUNICATION");
  } finally {
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facility: { displayName: { contains: suffix } } } } },
    });
    await db.notificationRecipient.deleteMany({
      where: { notification: { facility: { displayName: { contains: suffix } } } },
    });
    await db.notification.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.notificationOutbox.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.employee.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.facility.deleteMany({ where: { displayName: { contains: suffix } } });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});
