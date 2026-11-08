/**
 * Live assignment.changed publisher.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { recordAssignmentEvent } from "@/lib/scheduling/operational-assignments/assignment-events";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { enqueueAssignmentChanged } from "./live-publishers";
import { processNotificationOutboxRow } from "./processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "./queries";
import { assignmentChangeIntakeDedupeKey } from "./thread-key";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

test("an assignment change commits with its outbox row and reaches the assignee", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const org = await db.organization.create({ data: { name: `N3A ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `N3A Terrace ${suffix}`, timezone: "America/New_York" },
    });
    const otherFacility = await db.facility.create({
      data: { organizationId: org.id, displayName: `N3A Other ${suffix}`, timezone: "America/New_York" },
    });
    const department = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition" },
    });
    const supportBefore = await db.supportStaffNotification.count();

    async function person(input: { facilityId: string; label: string; roleKey: RoleKey; linkEmployee: boolean }) {
      const user = await db.user.create({
        data: {
          email: `n3a-${input.label}-${suffix}@example.test`,
          displayName: `N3A ${input.label}`,
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
      const employee = input.linkEmployee
        ? await db.employee.create({
            data: {
              facilityId: input.facilityId,
              userId: user.id,
              firstName: "N3A",
              lastName: input.label,
              roleType: input.roleKey,
              primaryDepartmentId: input.facilityId === facility.id ? department.id : null,
            },
          })
        : null;
      return { user, employee };
    }

    const assignee = await person({
      facilityId: facility.id,
      label: "assignee",
      roleKey: RoleKey.STAFF,
      linkEmployee: true,
    });
    const outsider = await person({
      facilityId: otherFacility.id,
      label: "outsider",
      roleKey: RoleKey.STAFF,
      linkEmployee: true,
    });
    assert.ok(assignee.employee);
    const serviceDate = facilityLocalDateToServiceDate("2026-10-29");
    const usersBefore = await db.user.count();

    await assert.rejects(
      () =>
        db.$transaction(async (tx) => {
          const assignment = await tx.operationalAssignment.create({
            data: {
              facilityId: facility.id,
              departmentId: department.id,
              employeeId: assignee.employee!.id,
              serviceDate,
              roleKey: "SERVER",
              roleLabel: "Server",
              clientCommandId: `rollback-${suffix}`,
            },
          });
          const event = await recordAssignmentEvent({
            assignmentId: assignment.id,
            facilityId: facility.id,
            departmentId: department.id,
            employeeId: assignee.employee!.id,
            serviceDate,
            eventType: "CREATED",
            actorUserId: assignee.user.id,
            summary: "Assignment created: Server",
            client: tx,
          });
          await enqueueAssignmentChanged(tx, {
            facilityId: facility.id,
            departmentId: department.id,
            assignmentId: assignment.id,
            assignmentEventId: event.id,
            serviceDate: "2026-10-29",
            assigneeEmployeeId: assignee.employee!.id,
            subjectLabel: "Server",
            occurredAt: event.createdAt,
          });
          throw new Error("force rollback");
        }),
      /force rollback/,
    );
    assert.equal(
      await db.operationalAssignment.count({ where: { clientCommandId: `rollback-${suffix}` } }),
      0,
    );
    assert.equal(await db.notificationOutbox.count({ where: { facilityId: facility.id } }), 0);
    assert.equal(await db.operationalAssignmentEvent.count({ where: { facilityId: facility.id } }), 0);

    const committed = await db.$transaction(async (tx) => {
      const assignment = await tx.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: department.id,
          employeeId: assignee.employee!.id,
          serviceDate,
          roleKey: "SERVER",
          roleLabel: "Server",
          clientCommandId: `live-${suffix}`,
        },
      });
      const event = await recordAssignmentEvent({
        assignmentId: assignment.id,
        facilityId: facility.id,
        departmentId: department.id,
        employeeId: assignee.employee!.id,
        serviceDate,
        eventType: "CREATED",
        actorUserId: assignee.user.id,
        summary: "Assignment created: Server",
        client: tx,
      });
      const first = await enqueueAssignmentChanged(tx, {
        facilityId: facility.id,
        departmentId: department.id,
        assignmentId: assignment.id,
        assignmentEventId: event.id,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee!.id,
        subjectLabel: "Server",
        occurredAt: event.createdAt,
      });
      const replay = await enqueueAssignmentChanged(tx, {
        facilityId: facility.id,
        departmentId: department.id,
        assignmentId: assignment.id,
        assignmentEventId: event.id,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee!.id,
        subjectLabel: "Server",
        occurredAt: event.createdAt,
      });
      return { assignmentId: assignment.id, eventId: event.id, outboxId: first.id, replay: replay.outcome };
    });
    assert.equal(committed.replay, "duplicate");
    assert.equal(
      await db.notificationOutbox.count({
        where: { facilityId: facility.id, dedupeKey: assignmentChangeIntakeDedupeKey(committed.eventId) },
      }),
      1,
    );
    const stored = await db.notificationOutbox.findUniqueOrThrow({ where: { id: committed.outboxId } });
    assert.equal(stored.eventType, "assignment.changed");
    const payload = stored.payload as Record<string, unknown>;
    assert.equal(payload.serviceState, "inactive");
    assert.equal(payload.assigneeEmployeeId, assignee.employee.id);
    assert.equal("firstName" in payload, false);
    assert.equal("notes" in payload, false);

    const processedResult = await processNotificationOutboxRow(db, { outboxId: committed.outboxId });
    assert.equal(processedResult.outcome, "applied", processedResult.note ?? "");
    const processed = await db.notificationOutbox.findUniqueOrThrow({ where: { id: committed.outboxId } });
    assert.ok(processed.processedAt);
    const notification = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, category: "assignment", resolvedAt: null },
    });
    assert.equal(notification.priority, "UPDATE");
    assert.equal(notification.actionPath, "/staffing/assignments");
    assert.equal(notification.sourceType, "assignment_change");
    const recipient = await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: notification.id },
    });
    assert.equal(recipient.userId, assignee.user.id);
    assert.equal(recipient.reason, "CURRENT_ASSIGNEE");
    assert.equal(
      await db.notificationRecipient.count({
        where: { notificationId: notification.id, reason: "ON_DUTY_SUPERVISOR" },
      }),
      0,
    );
    const delivery = await db.notificationDelivery.findFirstOrThrow({
      where: { notificationRecipientId: recipient.id },
    });
    assert.equal(delivery.channel, "IN_APP");
    assert.equal(delivery.status, "DELIVERED");

    const now = new Date("2026-10-29T15:00:00.000Z");
    const center = await loadNotificationCenter(db, {
      userId: assignee.user.id,
      facilityId: facility.id,
      now,
      timeZone: "America/New_York",
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") {
      assert.equal(center.updates.some((item) => item.title === "Assignment changed" && item.actionPath === "/staffing/assignments"), true);
      assert.equal(center.needsAttention.length, 0);
    }
    assert.equal(
      await getActiveAttentionCountForUser(db, { userId: assignee.user.id, facilityId: facility.id }),
      0,
    );
    const otherCenter = await loadNotificationCenter(db, {
      userId: outsider.user.id,
      facilityId: otherFacility.id,
      now,
      timeZone: "America/New_York",
    });
    assert.equal(otherCenter.status, "ready");
    if (otherCenter.status === "ready") {
      assert.equal(otherCenter.updates.length, 0);
      assert.equal(otherCenter.needsAttention.length, 0);
    }
    assert.equal(
      await db.notificationRecipient.count({ where: { userId: outsider.user.id } }),
      0,
    );

    const again = await processNotificationOutboxRow(db, { outboxId: committed.outboxId });
    assert.equal(again.outcome, "already_processed");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id, category: "assignment" } }), 1);

    const laterChange = new Date(notification.occurredAt.getTime() + 1000);
    const second = await db.$transaction(async (tx) => {
      const event = await recordAssignmentEvent({
        assignmentId: committed.assignmentId,
        facilityId: facility.id,
        departmentId: department.id,
        employeeId: assignee.employee!.id,
        serviceDate,
        eventType: "UPDATED",
        actorUserId: assignee.user.id,
        summary: "Assignment updated",
        client: tx,
      });
      const intake = await enqueueAssignmentChanged(tx, {
        facilityId: facility.id,
        departmentId: department.id,
        assignmentId: committed.assignmentId,
        assignmentEventId: event.id,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee!.id,
        subjectLabel: "Server",
        occurredAt: laterChange,
      });
      return { outboxId: intake.id, occurredAt: laterChange };
    });
    const superseded = await processNotificationOutboxRow(db, { outboxId: second.outboxId });
    assert.equal(superseded.outcome, "applied", superseded.note ?? "");
    const prior = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
    assert.equal(prior.resolvedAt?.toISOString(), second.occurredAt.toISOString());
    const open = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, category: "assignment", resolvedAt: null },
    });
    assert.notEqual(open.id, notification.id);
    const afterSecond = await loadNotificationCenter(db, {
      userId: assignee.user.id,
      facilityId: facility.id,
      now: new Date("2026-10-29T17:00:00.000Z"),
      timeZone: "America/New_York",
    });
    assert.equal(afterSecond.status, "ready");
    if (afterSecond.status === "ready") {
      assert.equal(afterSecond.updates.length, 1);
      assert.equal(afterSecond.resolved.length, 1);
    }

    const unlinked = await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: null,
        firstName: "N3A",
        lastName: "unlinked",
        roleType: RoleKey.STAFF,
        primaryDepartmentId: department.id,
      },
    });
    const silent = await db.$transaction(async (tx) => {
      const assignment = await tx.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: department.id,
          employeeId: unlinked.id,
          serviceDate,
          roleKey: "SERVER",
          roleLabel: "Server",
          clientCommandId: `unlinked-${suffix}`,
        },
      });
      const event = await recordAssignmentEvent({
        assignmentId: assignment.id,
        facilityId: facility.id,
        departmentId: department.id,
        employeeId: unlinked.id,
        serviceDate,
        eventType: "CREATED",
        actorUserId: assignee.user.id,
        summary: "Assignment created: Server",
        client: tx,
      });
      const intake = await enqueueAssignmentChanged(tx, {
        facilityId: facility.id,
        departmentId: department.id,
        assignmentId: assignment.id,
        assignmentEventId: event.id,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: unlinked.id,
        subjectLabel: "Server",
        occurredAt: event.createdAt,
      });
      return { outboxId: intake.id, assignmentId: assignment.id };
    });
    const silentResult = await processNotificationOutboxRow(db, { outboxId: silent.outboxId });
    assert.equal(silentResult.outcome, "applied", silentResult.note ?? "");
    assert.equal(silentResult.recipientCount, 0);
    const silentRow = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, category: "assignment", sourceId: { contains: silent.assignmentId } },
    });
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: silentRow.id } }), 0);
    assert.equal(await db.user.count(), usersBefore);
    assert.equal(await db.supportStaffNotification.count(), supportBefore);
    const stillThere = await db.operationalAssignment.findFirstOrThrow({
      where: { clientCommandId: `live-${suffix}` },
    });
    assert.equal(stillThere.roleLabel, "Server");
  } finally {
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facility: { displayName: { contains: suffix } } } } },
    });
    await db.notificationRecipient.deleteMany({
      where: { notification: { facility: { displayName: { contains: suffix } } } },
    });
    await db.notification.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.notificationOutbox.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.operationalAssignment.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.department.updateMany({
      where: { facility: { displayName: { contains: suffix } } },
      data: { headEmployeeId: null },
    });
    await db.employee.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.facility.deleteMany({ where: { displayName: { contains: suffix } } });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});
