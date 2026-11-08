/**
 * Work Order overdue attention.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { acknowledgeNotification, markNotificationRead } from "@/lib/notifications/lifecycle";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import { processScheduledEvaluationOutbox } from "@/lib/scheduled-evaluation/run";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { workOrderDeadlineFromCivilDate } from "./work-order-due-state";
import { evaluateWorkOrderOverdue } from "./work-order-time-evaluation";
import {
  assignResponsibleEmployee,
  createWorkOrderDirect,
  recordWorkOrderDeadline,
  updateWorkOrderStatus,
} from "./work-order-service";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

function supervisor(facilityId: string, userId: string, departmentId: string): FacilitySession {
  return {
    uid: userId,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "SUPERVISOR",
    name: "Work Order Supervisor",
    email: "work-order-due@example.test",
    facilityId,
    primaryDepartmentId: departmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test("work order overdue follows the deadline and stays separate from assignment", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const previousFlag = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  const ids: { orgId?: string; facilityIds: string[]; userIds: string[] } = { facilityIds: [], userIds: [] };
  const future = new Date("2026-07-20T16:00:00.000Z");
  const before = new Date("2026-07-20T15:00:00.000Z");
  const crossed = new Date("2026-07-20T16:00:00.000Z");
  const later = new Date("2026-07-21T16:00:00.000Z");
  const stillPast = new Date("2026-07-20T15:30:00.000Z");
  const again = new Date("2026-07-22T12:00:00.000Z");
  try {
    await db.role.upsert({
      where: { key: RoleKey.SUPERVISOR },
      create: { key: RoleKey.SUPERVISOR, name: "SUPERVISOR" },
      update: { isActive: true },
    });
    const role = await db.role.findUniqueOrThrow({ where: { key: RoleKey.SUPERVISOR } });
    const org = await db.organization.create({ data: { name: `WO Due ${suffix}` } });
    ids.orgId = org.id;
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Due Facility ${suffix}`, timezone: "America/New_York" },
    });
    ids.facilityIds.push(facility.id);
    const department = await db.department.create({
      data: { facilityId: facility.id, key: `MAINT_${suffix}`, name: "Maintenance", isActive: true },
    });
    const unit = await db.unit.create({
      data: { facilityId: facility.id, name: `Kitchen ${suffix}`, unitType: "KITCHEN" },
    });
    const space = await db.unitSpace.create({
      data: { facilityId: facility.id, unitId: unit.id, name: `Dishroom ${suffix}`, spaceType: "SERVICE_AREA" },
    });

    async function person(label: string, linkUser = true) {
      const user = await db.user.create({
        data: {
          email: `due-${label}-${suffix}@example.test`,
          displayName: label,
          facilityId: facility.id,
          roleId: role.id,
          passwordHash: "hash",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      ids.userIds.push(user.id);
      const access = await db.userFacilityAccess.create({
        data: { userId: user.id, facilityId: facility.id, isActive: true },
      });
      await db.userFacilityRolePeriod.create({
        data: { userFacilityAccessId: access.id, roleKey: RoleKey.SUPERVISOR, startsAt: new Date("2026-01-01T00:00:00.000Z") },
      });
      const employee = await db.employee.create({
        data: {
          facilityId: facility.id,
          userId: linkUser ? user.id : null,
          firstName: "Due",
          lastName: label,
          email: user.email,
          roleType: RoleKey.STAFF,
          primaryDepartmentId: department.id,
        },
      });
      return { user, employee };
    }

    const actor = await person("actor");
    const employeeA = await person("a");
    const employeeB = await person("b");
    const session = supervisor(facility.id, actor.user.id, department.id);

    async function overdueRows(repairId: string) {
      return db.notification.findMany({
        where: { facilityId: facility.id, sourceType: "work_order_overdue", metadata: { path: ["repairId"], equals: repairId } },
        include: { recipients: true },
      });
    }

    const waiting = await createWorkOrderDirect(session, {
      facilityId: facility.id,
      departmentId: department.id,
      unitId: unit.id,
      spaceId: space.id,
      title: "Filter change",
      description: "Not due yet",
      responsibleDepartmentId: department.id,
      assignedEmployeeId: employeeA.employee.id,
      priority: "EMERGENCY",
      dueAt: future,
      targetDate: new Date("2026-07-01T00:00:00.000Z"),
      client: db,
      now: before,
    });
    assert.equal(await overdueRows(waiting.id).then((rows) => rows.length), 0);
    const quietClock = await evaluateWorkOrderOverdue({ db, now: before, facilityIds: [facility.id] });
    assert.equal(quietClock.transitions, 0);

    const [firstRun, secondRun] = await Promise.all([
      evaluateWorkOrderOverdue({ db, now: crossed, facilityIds: [facility.id] }),
      evaluateWorkOrderOverdue({ db, now: crossed, facilityIds: [facility.id] }),
    ]);
    const opened = [...new Set([...firstRun.outboxIds, ...secondRun.outboxIds])];
    assert.equal(opened.length, 1);
    await processScheduledEvaluationOutbox(db, opened);
    const repeat = await evaluateWorkOrderOverdue({ db, now: crossed, facilityIds: [facility.id] });
    assert.equal(repeat.transitions, 0);
    const openedRows = await overdueRows(waiting.id);
    assert.equal(openedRows.length, 1);
    assert.equal(openedRows[0]?.priority, "NEEDS_ATTENTION");
    assert.equal(openedRows[0]?.requiresAcknowledgement, true);
    assert.equal(openedRows[0]?.recipients.length, 1);
    assert.equal(openedRows[0]?.recipients[0]?.userId, employeeA.user.id);
    assert.equal(openedRows[0]?.actionPath, `/repairs/${waiting.id}`);
    const assignment = await db.notification.findFirst({
      where: { facilityId: facility.id, sourceType: "work_order_assignment", metadata: { path: ["repairId"], equals: waiting.id } },
    });
    assert.ok(assignment);
    assert.notEqual(assignment?.id, openedRows[0]?.id);

    const center = await loadNotificationCenter(db, {
      userId: employeeA.user.id,
      facilityId: facility.id,
      now: crossed,
      timeZone: "America/New_York",
    });
    assert.equal(center.status, "ready");
    if (center.status !== "ready") return;
    assert.equal(center.needsAttention.length, 1);
    assert.equal(center.needsAttention[0]?.title, "Work Order is overdue");
    assert.equal(center.needsAttention[0]?.priorityLabel, "Needs Attention");
    assert.match(center.needsAttention[0]?.body ?? "", /Dishroom/);
    assert.equal(center.needsAttention[0]?.actionLabel, "Open Work Order");
    assert.match(center.needsAttention[0]?.explanations.join(" ") ?? "", /Work Order is assigned to you/);
    assert.equal(center.updates.length, 1);
    assert.equal(center.updates[0]?.title, "Work Order assigned");
    assert.equal(
      await getActiveAttentionCountForUser(db, { userId: employeeA.user.id, facilityId: facility.id, now: crossed }),
      1,
    );
    const read = await markNotificationRead(db, {
      notificationId: openedRows[0]!.id,
      userId: employeeA.user.id,
      facilityId: facility.id,
      readAt: crossed,
    });
    assert.equal(read.resolvedAt, null);
    await acknowledgeNotification(db, {
      notificationId: openedRows[0]!.id,
      userId: employeeA.user.id,
      facilityId: facility.id,
      acknowledgedAt: crossed,
    });
    const afterAck = await db.notification.findUniqueOrThrow({ where: { id: openedRows[0]!.id } });
    assert.equal(afterAck.resolvedAt, null);

    const still = await recordWorkOrderDeadline(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: waiting.id,
      dueAt: stillPast,
      client: db,
      now: crossed,
    });
    assert.equal(still.status, "ASSIGNED");
    const stillRows = await overdueRows(waiting.id);
    assert.equal(stillRows.length, 1);
    assert.equal(stillRows[0]?.id, openedRows[0]?.id);
    assert.equal(stillRows[0]?.expiresAt, null);
    assert.equal(stillRows[0]?.resolvedAt, null);

    const extended = await recordWorkOrderDeadline(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: waiting.id,
      dueAt: later,
      client: db,
      now: crossed,
    });
    assert.equal(extended.status, "ASSIGNED");
    const ended = await db.notification.findUniqueOrThrow({ where: { id: openedRows[0]!.id } });
    assert.ok(ended.expiresAt);
    assert.equal(ended.resolvedAt, null);
    const endedMeta = ended.metadata as { endedReason?: string };
    assert.equal(endedMeta.endedReason, "deadline_moved");

    const missedAgain = await recordWorkOrderDeadline(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: waiting.id,
      dueAt: stillPast,
      client: db,
      now: again,
    });
    assert.equal(missedAgain.id, waiting.id);
    const reopened = await overdueRows(waiting.id);
    assert.equal(reopened.length, 1);
    assert.equal(reopened[0]?.id, openedRows[0]?.id);
    assert.equal(reopened[0]?.expiresAt, null);
    assert.equal(reopened[0]?.resolvedAt, null);

    await updateWorkOrderStatus(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: waiting.id,
      toStatus: "ON_HOLD",
      client: db,
      now: again,
    });
    const held = await db.notification.findUniqueOrThrow({ where: { id: openedRows[0]!.id } });
    assert.equal(held.expiresAt, null);
    assert.equal(held.resolvedAt, null);

    const moved = await assignResponsibleEmployee(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: waiting.id,
      assignedEmployeeId: employeeB.employee.id,
      client: db,
    });
    assert.equal(moved.assignedEmployeeId, employeeB.employee.id);
    const afterMove = await overdueRows(waiting.id);
    assert.equal(afterMove.length, 1);
    assert.equal(afterMove[0]?.id, openedRows[0]?.id);
    assert.deepEqual(afterMove[0]?.recipients.map((row) => row.userId), [employeeB.user.id]);
    const assignmentCount = await db.notification.count({
      where: { facilityId: facility.id, sourceType: "work_order_assignment", metadata: { path: ["repairId"], equals: waiting.id } },
    });
    assert.equal(assignmentCount, 2);

    await updateWorkOrderStatus(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: waiting.id,
      toStatus: "IN_PROGRESS",
      client: db,
      now: again,
    });
    const completed = await updateWorkOrderStatus(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: waiting.id,
      toStatus: "COMPLETED",
      client: db,
      now: again,
    });
    assert.equal(completed.status, "COMPLETED");
    const resolved = await db.notification.findUniqueOrThrow({ where: { id: openedRows[0]!.id } });
    assert.ok(resolved.resolvedAt);
    assert.equal(resolved.expiresAt, null);

    const clearable = await createWorkOrderDirect(session, {
      facilityId: facility.id,
      departmentId: department.id,
      unitId: unit.id,
      title: "Clear the deadline",
      description: "Deadline goes away",
      responsibleDepartmentId: department.id,
      dueAt: stillPast,
      client: db,
      now: crossed,
    });
    const clearedRows = await overdueRows(clearable.id);
    assert.equal(clearedRows.length, 1);
    assert.equal(clearedRows[0]?.recipients.length, 0);
    const cleared = await recordWorkOrderDeadline(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: clearable.id,
      dueAt: null,
      client: db,
      now: crossed,
    });
    assert.equal(cleared.status, "OPEN");
    const clearedNote = await db.notification.findUniqueOrThrow({ where: { id: clearedRows[0]!.id } });
    assert.ok(clearedNote.expiresAt);
    assert.equal(clearedNote.resolvedAt, null);
    assert.equal((clearedNote.metadata as { endedReason?: string }).endedReason, "deadline_removed");

    const cancelled = await createWorkOrderDirect(session, {
      facilityId: facility.id,
      departmentId: department.id,
      unitId: unit.id,
      title: "Cancel me",
      description: "Stop the work",
      responsibleDepartmentId: department.id,
      assignedEmployeeId: employeeA.employee.id,
      dueAt: stillPast,
      client: db,
      now: crossed,
    });
    await updateWorkOrderStatus(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: cancelled.id,
      toStatus: "CANCELLED",
      client: db,
      now: crossed,
    });
    const cancelledNote = await overdueRows(cancelled.id);
    assert.equal(cancelledNote.length, 1);
    assert.ok(cancelledNote[0]?.expiresAt);
    assert.equal(cancelledNote[0]?.resolvedAt, null);
    assert.equal((cancelledNote[0]?.metadata as { endedReason?: string }).endedReason, "work_order_cancelled");

    const replay = await processNotificationOutboxRow(db, { outboxId: opened[0]! });
    assert.equal(replay.outcome, "already_processed");
  } finally {
    process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previousFlag;
    for (const facilityId of ids.facilityIds) {
      await db.notificationDelivery.deleteMany({ where: { notificationRecipient: { notification: { facilityId } } } });
      await db.notificationRecipient.deleteMany({ where: { notification: { facilityId } } });
      await db.notification.deleteMany({ where: { facilityId } });
      await db.notificationOutbox.deleteMany({ where: { facilityId } });
      await db.repairLaborEntry.deleteMany({ where: { repair: { unit: { facilityId } } } });
      await db.repair.deleteMany({ where: { unit: { facilityId } } });
      await db.unitSpace.deleteMany({ where: { facilityId } });
      await db.unit.deleteMany({ where: { facilityId } });
      await db.employee.deleteMany({ where: { facilityId } });
      await db.department.deleteMany({ where: { facilityId } });
      await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { facilityId } } });
      await db.userFacilityAccess.deleteMany({ where: { facilityId } });
    }
    if (ids.userIds.length) await db.user.deleteMany({ where: { id: { in: ids.userIds } } });
    if (ids.facilityIds.length) await db.facility.deleteMany({ where: { id: { in: ids.facilityIds } } });
    if (ids.orgId) await db.organization.deleteMany({ where: { id: ids.orgId } });
    await db.$disconnect();
  }
});

test("the same instant is overdue in New York and not in Chicago", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const previousFlag = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  const ids: { orgId?: string; facilityIds: string[]; userIds: string[] } = { facilityIds: [], userIds: [] };
  const now = new Date("2026-07-16T04:30:00.000Z");
  try {
    await db.role.upsert({
      where: { key: RoleKey.SUPERVISOR },
      create: { key: RoleKey.SUPERVISOR, name: "SUPERVISOR" },
      update: { isActive: true },
    });
    const role = await db.role.findUniqueOrThrow({ where: { key: RoleKey.SUPERVISOR } });
    const org = await db.organization.create({ data: { name: `WO Zone ${suffix}` } });
    ids.orgId = org.id;
    const actorUser = await db.user.create({
      data: {
        email: `zone-${suffix}@example.test`,
        displayName: "Zone",
        roleId: role.id,
        passwordHash: "hash",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    ids.userIds.push(actorUser.id);

    async function place(timeZone: string, label: string) {
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `${label} ${suffix}`, timezone: timeZone },
      });
      ids.facilityIds.push(facility.id);
      const department = await db.department.create({
        data: { facilityId: facility.id, key: `${label}_${suffix}`, name: label, isActive: true },
      });
      const unit = await db.unit.create({
        data: { facilityId: facility.id, name: label, unitType: "KITCHEN" },
      });
      await db.user.update({ where: { id: actorUser.id }, data: { facilityId: facility.id } });
      const access = await db.userFacilityAccess.create({
        data: { userId: actorUser.id, facilityId: facility.id, isActive: true },
      });
      await db.userFacilityRolePeriod.create({
        data: { userFacilityAccessId: access.id, roleKey: RoleKey.SUPERVISOR, startsAt: new Date("2026-01-01T00:00:00.000Z") },
      });
      const session = supervisor(facility.id, actorUser.id, department.id);
      const repair = await createWorkOrderDirect(session, {
        facilityId: facility.id,
        departmentId: department.id,
        unitId: unit.id,
        title: "Zone deadline",
        description: "Civil day",
        responsibleDepartmentId: department.id,
        dueAt: workOrderDeadlineFromCivilDate("2026-07-15", timeZone),
        targetDate: new Date("2026-07-15T00:00:00.000Z"),
        client: db,
        now,
      });
      return { facility, repair };
    }

    const east = await place("America/New_York", "NY");
    const central = await place("America/Chicago", "CHI");
    const eastNotes = await db.notification.count({
      where: { facilityId: east.facility.id, sourceType: "work_order_overdue" },
    });
    const centralNotes = await db.notification.count({
      where: { facilityId: central.facility.id, sourceType: "work_order_overdue" },
    });
    assert.equal(eastNotes, 1);
    assert.equal(centralNotes, 0);
    const clock = await evaluateWorkOrderOverdue({
      db,
      now,
      facilityIds: [east.facility.id, central.facility.id],
    });
    assert.equal(clock.transitions, 0);
  } finally {
    process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previousFlag;
    for (const facilityId of ids.facilityIds) {
      await db.notificationDelivery.deleteMany({ where: { notificationRecipient: { notification: { facilityId } } } });
      await db.notificationRecipient.deleteMany({ where: { notification: { facilityId } } });
      await db.notification.deleteMany({ where: { facilityId } });
      await db.notificationOutbox.deleteMany({ where: { facilityId } });
      await db.repair.deleteMany({ where: { unit: { facilityId } } });
      await db.unit.deleteMany({ where: { facilityId } });
      await db.department.deleteMany({ where: { facilityId } });
      await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { facilityId } } });
      await db.userFacilityAccess.deleteMany({ where: { facilityId } });
    }
    if (ids.userIds.length) await db.user.deleteMany({ where: { id: { in: ids.userIds } } });
    if (ids.facilityIds.length) await db.facility.deleteMany({ where: { id: { in: ids.facilityIds } } });
    if (ids.orgId) await db.organization.deleteMany({ where: { id: ids.orgId } });
    await db.$disconnect();
  }
});
