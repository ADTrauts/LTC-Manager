/**
 * Work Order assignment attention.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { NotificationLifecycleError } from "@/lib/notifications/lifecycle";
import { acknowledgeNotification, markNotificationRead } from "@/lib/notifications/lifecycle";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import { resolveNotificationRecipients } from "@/lib/notifications/recipient-resolver";

import {
  applyWorkOrderAssigneeChange,
  enqueueWorkOrderAssigned,
} from "./work-order-assignment-attention";
import {
  assignResponsibleEmployee,
  createWorkOrderDirect,
  updateWorkOrderStatus,
} from "./work-order-service";
import { completeWorkOrder } from "./work-order-service";

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
    email: "work-order@example.test",
    facilityId,
    primaryDepartmentId: departmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test("work order assignment publishes one Update and ends it when responsibility ends", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const previousFlag = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  const ids: { orgId?: string; facilityIds: string[]; userIds: string[] } = {
    facilityIds: [],
    userIds: [],
  };
  try {
    await db.role.upsert({
      where: { key: RoleKey.SUPERVISOR },
      create: { key: RoleKey.SUPERVISOR, name: "SUPERVISOR" },
      update: { isActive: true },
    });
    const role = await db.role.findUniqueOrThrow({ where: { key: RoleKey.SUPERVISOR } });
    const org = await db.organization.create({ data: { name: `WO Org ${suffix}` } });
    ids.orgId = org.id;
    const facility = await db.facility.create({
      data: {
        organizationId: org.id,
        displayName: `WO Facility ${suffix}`,
        timezone: "America/New_York",
      },
    });
    const otherFacility = await db.facility.create({
      data: {
        organizationId: org.id,
        displayName: `WO Other ${suffix}`,
        timezone: "America/New_York",
      },
    });
    ids.facilityIds.push(facility.id, otherFacility.id);
    const department = await db.department.create({
      data: { facilityId: facility.id, key: `MAINT_${suffix}`, name: "Maintenance", isActive: true },
    });
    const otherDepartment = await db.department.create({
      data: {
        facilityId: otherFacility.id,
        key: `MAINT_B_${suffix}`,
        name: "Other Maintenance",
        isActive: true,
      },
    });
    const unit = await db.unit.create({
      data: { facilityId: facility.id, name: `Kitchen ${suffix}`, unitType: "KITCHEN" },
    });
    const space = await db.unitSpace.create({
      data: {
        facilityId: facility.id,
        unitId: unit.id,
        name: `Dishroom ${suffix}`,
        spaceType: "SERVICE_AREA",
      },
    });

    async function person(input: {
      facilityId: string;
      label: string;
      linkUser?: boolean;
    }) {
      const user = await db.user.create({
        data: {
          email: `wo-${input.label}-${suffix}@example.test`,
          displayName: input.label,
          facilityId: input.facilityId,
          roleId: role.id,
          passwordHash: "hash",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      ids.userIds.push(user.id);
      const access = await db.userFacilityAccess.create({
        data: { userId: user.id, facilityId: input.facilityId, isActive: true },
      });
      await db.userFacilityRolePeriod.create({
        data: {
          userFacilityAccessId: access.id,
          roleKey: RoleKey.SUPERVISOR,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      const employee = await db.employee.create({
        data: {
          facilityId: input.facilityId,
          userId: input.linkUser === false ? null : user.id,
          firstName: "WO",
          lastName: input.label,
          email: user.email,
          roleType: RoleKey.STAFF,
          primaryDepartmentId: input.facilityId === facility.id ? department.id : otherDepartment.id,
        },
      });
      return { user, employee, accessId: access.id };
    }

    const actor = await person({ facilityId: facility.id, label: "actor" });
    const employeeA = await person({ facilityId: facility.id, label: "assignee-a" });
    const employeeB = await person({ facilityId: facility.id, label: "assignee-b" });
    const unlinked = await person({ facilityId: facility.id, label: "unlinked", linkUser: false });
    const outsider = await person({ facilityId: otherFacility.id, label: "outsider" });
    const session = supervisor(facility.id, actor.user.id, department.id);
    const usersBefore = await db.user.count();

    const unassigned = await createWorkOrderDirect(session, {
      facilityId: facility.id,
      departmentId: department.id,
      unitId: unit.id,
      spaceId: space.id,
      title: "Unassigned filter",
      description: "No one owns this yet",
      responsibleDepartmentId: department.id,
      priority: "EMERGENCY",
      client: db,
    });
    assert.equal(unassigned.assignedEmployeeId, null);
    assert.equal(
      await db.notificationOutbox.count({
        where: { facilityId: facility.id, eventType: "work_order.assigned" },
      }),
      0,
    );

    const created = await createWorkOrderDirect(session, {
      facilityId: facility.id,
      departmentId: department.id,
      unitId: unit.id,
      spaceId: space.id,
      title: "Boiler leak",
      description: "Water under the boiler",
      responsibleDepartmentId: department.id,
      assignedEmployeeId: employeeA.employee.id,
      priority: "EMERGENCY",
      client: db,
    });
    assert.equal(created.assignedEmployeeId, employeeA.employee.id);
    assert.equal(created.priority, "EMERGENCY");
    const createdEvents = await db.notificationOutbox.findMany({
      where: { facilityId: facility.id, aggregateId: { not: "" }, eventType: "work_order.assigned" },
    });
    const createdForRepair = createdEvents.filter((row) => {
      const payload = row.payload as { repairId?: string };
      return payload.repairId === created.id;
    });
    assert.equal(createdForRepair.length, 1);
    assert.equal(createdForRepair[0]?.processedAt == null, false);

    const same = await assignResponsibleEmployee(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: created.id,
      assignedEmployeeId: employeeA.employee.id,
      client: db,
    });
    assert.equal(same.assignedEmployeeId, employeeA.employee.id);
    const afterSame = await db.notificationOutbox.count({
      where: { facilityId: facility.id, eventType: "work_order.assigned" },
    });
    assert.equal(afterSame, createdEvents.length);

    const beforeReassign = await db.repair.findUniqueOrThrow({ where: { id: created.id } });
    const reassigned = await assignResponsibleEmployee(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: created.id,
      assignedEmployeeId: employeeB.employee.id,
      client: db,
    });
    assert.equal(reassigned.assignedEmployeeId, employeeB.employee.id);
    assert.equal(reassigned.status, beforeReassign.status);
    assert.equal(reassigned.priority, "EMERGENCY");
    const assignmentEvents = await db.repairUpdate.findMany({
      where: { repairId: created.id, updateText: "Work Order assigned" },
      orderBy: { updatedAt: "asc" },
    });
    assert.equal(assignmentEvents.length, 2);
    assert.notEqual(assignmentEvents[0]?.id, assignmentEvents[1]?.id);

    const now = new Date();
    const centerA = await loadNotificationCenter(db, {
      userId: employeeA.user.id,
      facilityId: facility.id,
      now,
      timeZone: "America/New_York",
    });
    const centerB = await loadNotificationCenter(db, {
      userId: employeeB.user.id,
      facilityId: facility.id,
      now,
      timeZone: "America/New_York",
    });
    assert.equal(centerA.status, "ready");
    assert.equal(centerB.status, "ready");
    if (centerA.status !== "ready" || centerB.status !== "ready") return;
    assert.equal(centerA.updates.length, 0);
    assert.equal(centerA.ended.length, 1);
    assert.equal(centerA.ended[0]?.resolvedAtLabel, null);
    assert.equal(centerB.updates.length, 1);
    assert.equal(centerB.needsAttention.length, 0);
    assert.equal(centerB.updates[0]?.title, "Work Order assigned");
    assert.match(centerB.updates[0]?.body ?? "", /Dishroom/);
    assert.match(centerB.updates[0]?.body ?? "", /Boiler leak/);
    assert.doesNotMatch(centerB.updates[0]?.body ?? "", /Repair/);
    assert.doesNotMatch(centerB.updates[0]?.body ?? "", /EMERGENCY/);
    assert.equal(centerB.updates[0]?.actionPath, `/repairs/${created.id}`);
    assert.equal(centerB.updates[0]?.actionLabel, "Open Work Order");
    assert.equal(centerB.updates[0]?.requiresAcknowledgement, false);
    assert.equal(centerB.updates[0]?.priority, "UPDATE");
    assert.equal(
      await getActiveAttentionCountForUser(db, {
        userId: employeeB.user.id,
        facilityId: facility.id,
        now,
      }),
      0,
    );

    const outsiderCenter = await loadNotificationCenter(db, {
      userId: outsider.user.id,
      facilityId: facility.id,
      now,
      timeZone: "America/New_York",
    });
    assert.equal(outsiderCenter.status, "no_access");
    const outsiderHome = await loadNotificationCenter(db, {
      userId: outsider.user.id,
      facilityId: otherFacility.id,
      now,
      timeZone: "America/New_York",
    });
    assert.equal(outsiderHome.status, "ready");
    if (outsiderHome.status === "ready") assert.equal(outsiderHome.updates.length, 0);
    const leaked = await resolveNotificationRecipients(db, {
      facilityId: otherFacility.id,
      departmentId: otherDepartment.id,
      audience: "floor",
      reasons: ["WORK_ORDER_ASSIGNEE"],
      repairId: created.id,
      assigneeEmployeeId: employeeB.employee.id,
    });
    assert.equal(leaked.resolved.length, 0);

    const recipients = await db.notificationRecipient.findMany({
      where: { notification: { facilityId: facility.id, category: "work_order", expiresAt: null } },
    });
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0]?.userId, employeeB.user.id);
    assert.equal(recipients[0]?.reason, "WORK_ORDER_ASSIGNEE");
    const deliveries = await db.notificationDelivery.findMany({
      where: { notificationRecipientId: recipients[0]?.id },
    });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.channel, "IN_APP");

    await markNotificationRead(db, {
      facilityId: facility.id,
      notificationId: centerB.updates[0]!.id,
      userId: employeeB.user.id,
    });
    await assert.rejects(
      acknowledgeNotification(db, {
        facilityId: facility.id,
        notificationId: centerB.updates[0]!.id,
        userId: employeeB.user.id,
      }),
      (error: unknown) => error instanceof NotificationLifecycleError && error.code === "ACKNOWLEDGEMENT_NOT_REQUIRED",
    );

    const held = await updateWorkOrderStatus(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: created.id,
      toStatus: "ON_HOLD",
      client: db,
    });
    assert.equal(held.status, "ON_HOLD");
    const stillOpen = await db.notification.findFirstOrThrow({
      where: { id: centerB.updates[0]!.id },
    });
    assert.equal(stillOpen.expiresAt, null);
    assert.equal(stillOpen.resolvedAt, null);

    const cleared = await assignResponsibleEmployee(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: created.id,
      assignedEmployeeId: null,
      client: db,
    });
    assert.equal(cleared.assignedEmployeeId, null);
    const afterClear = await db.notification.findFirstOrThrow({
      where: { id: centerB.updates[0]!.id },
    });
    assert.ok(afterClear.expiresAt);
    assert.equal(afterClear.resolvedAt, null);
    assert.equal(
      await db.notificationOutbox.count({
        where: {
          facilityId: facility.id,
          eventType: "work_order.assigned",
          payload: { path: ["repairId"], equals: created.id },
        },
      }),
      2,
    );

    const fresh = await createWorkOrderDirect(session, {
      facilityId: facility.id,
      departmentId: department.id,
      unitId: unit.id,
      spaceId: space.id,
      title: "Closer",
      description: "Finish this one",
      responsibleDepartmentId: department.id,
      client: db,
    });
    await assignResponsibleEmployee(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: fresh.id,
      assignedEmployeeId: employeeA.employee.id,
      client: db,
    });
    await db.repairLaborEntry.create({
      data: { repairId: fresh.id, employeeId: employeeA.employee.id, minutes: 15 },
    });
    const completed = await completeWorkOrder(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: fresh.id,
      workPerformed: "Replaced the gasket",
      client: db,
    });
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.assignedEmployeeId, employeeA.employee.id);
    const completedNote = await db.notification.findFirst({
      where: {
        facilityId: facility.id,
        category: "work_order",
        expiresAt: null,
        metadata: { path: ["repairId"], equals: fresh.id },
      },
    });
    assert.equal(completedNote, null);

    const cancelled = await createWorkOrderDirect(session, {
      facilityId: facility.id,
      departmentId: department.id,
      unitId: unit.id,
      title: "Cancel me",
      description: "Not needed",
      responsibleDepartmentId: department.id,
      assignedEmployeeId: employeeA.employee.id,
      client: db,
    });
    const beforeCancel = await db.repair.findUniqueOrThrow({ where: { id: cancelled.id } });
    const cancelledRow = await updateWorkOrderStatus(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: cancelled.id,
      toStatus: "CANCELLED",
      client: db,
    });
    assert.equal(cancelledRow.status, "CANCELLED");
    assert.equal(cancelledRow.assignedEmployeeId, beforeCancel.assignedEmployeeId);
    assert.equal(cancelledRow.priority, beforeCancel.priority);
    assert.equal(
      await db.notification.count({
        where: {
          facilityId: facility.id,
          category: "work_order",
          expiresAt: null,
          metadata: { path: ["repairId"], equals: cancelled.id },
        },
      }),
      0,
    );

    const quiet = await createWorkOrderDirect(session, {
      facilityId: facility.id,
      departmentId: department.id,
      unitId: unit.id,
      title: "No login",
      description: "Employee has no user",
      responsibleDepartmentId: department.id,
      client: db,
    });
    await assignResponsibleEmployee(session, {
      facilityId: facility.id,
      departmentId: department.id,
      repairId: quiet.id,
      assignedEmployeeId: unlinked.employee.id,
      client: db,
    });
    assert.equal((await db.repair.findUniqueOrThrow({ where: { id: quiet.id } })).assignedEmployeeId, unlinked.employee.id);
    assert.equal(await db.user.count(), usersBefore);
    const quietNotification = await db.notification.findFirst({
      where: {
        facilityId: facility.id,
        metadata: { path: ["repairId"], equals: quiet.id },
      },
      include: { recipients: true },
    });
    assert.ok(quietNotification);
    assert.equal(quietNotification?.recipients.length, 0);

    const snapshot = await db.repair.findUniqueOrThrow({ where: { id: quiet.id } });
    const quietOutbox = await db.notificationOutbox.findFirstOrThrow({
      where: {
        facilityId: facility.id,
        eventType: "work_order.assigned",
        payload: { path: ["repairId"], equals: quiet.id },
      },
    });
    const replay = await processNotificationOutboxRow(db, { outboxId: quietOutbox.id });
    assert.equal(replay.outcome, "already_processed");
    const afterReplay = await db.repair.findUniqueOrThrow({ where: { id: quiet.id } });
    assert.equal(afterReplay.status, snapshot.status);
    assert.equal(afterReplay.assignedEmployeeId, snapshot.assignedEmployeeId);
    assert.equal(afterReplay.priority, snapshot.priority);
    assert.equal(afterReplay.dueAt?.toISOString() ?? null, snapshot.dueAt?.toISOString() ?? null);
    assert.equal(afterReplay.targetDate?.toISOString() ?? null, snapshot.targetDate?.toISOString() ?? null);
    assert.equal(
      await db.notification.count({
        where: { facilityId: facility.id, metadata: { path: ["repairId"], equals: quiet.id } },
      }),
      1,
    );

    const history = await db.repairUpdate.findFirstOrThrow({
      where: { repairId: quiet.id, updateText: "Work Order assigned" },
    });
    await db.$transaction(async (tx) => {
      const first = await enqueueWorkOrderAssigned(tx, {
        repairId: quiet.id,
        assignmentEventId: history.id,
        assigneeEmployeeId: unlinked.employee.id,
        occurredAt: new Date(),
      });
      const second = await enqueueWorkOrderAssigned(tx, {
        repairId: quiet.id,
        assignmentEventId: history.id,
        assigneeEmployeeId: unlinked.employee.id,
        occurredAt: new Date(),
      });
      assert.equal(first, second);
    });
    assert.equal(
      await db.notificationOutbox.count({
        where: { facilityId: facility.id, dedupeKey: `work-order-assignment:${history.id}` },
      }),
      1,
    );
  } finally {
    for (const facilityId of ids.facilityIds) {
      await db.notificationDelivery.deleteMany({
        where: { notificationRecipient: { notification: { facilityId } } },
      });
      await db.notificationRecipient.deleteMany({ where: { notification: { facilityId } } });
      await db.notification.deleteMany({ where: { facilityId } });
      await db.notificationOutbox.deleteMany({ where: { facilityId } });
      await db.repairLaborEntry.deleteMany({ where: { repair: { unit: { facilityId } } } });
      await db.repair.deleteMany({ where: { unit: { facilityId } } });
      await db.unitSpace.deleteMany({ where: { facilityId } });
      await db.unit.deleteMany({ where: { facilityId } });
      await db.employee.deleteMany({ where: { facilityId } });
      await db.maintenanceCategory.deleteMany({ where: { facilityId } });
      await db.department.deleteMany({ where: { facilityId } });
    }
    if (ids.userIds.length > 0) {
      await db.userFacilityRolePeriod.deleteMany({
        where: { userFacilityAccess: { userId: { in: ids.userIds } } },
      });
      await db.userFacilityAccess.deleteMany({ where: { userId: { in: ids.userIds } } });
      await db.user.deleteMany({ where: { id: { in: ids.userIds } } });
    }
    await db.facility.deleteMany({ where: { id: { in: ids.facilityIds } } });
    if (ids.orgId) await db.organization.deleteMany({ where: { id: ids.orgId } });
    if (previousFlag === undefined) delete process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
    else process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previousFlag;
    await db.$disconnect();
  }
});

test("work order assignment rolls back the repair, history, and outbox together", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const facilityIds: string[] = [];
  const userIds: string[] = [];
  let orgId: string | null = null;
  try {
    await db.role.upsert({
      where: { key: RoleKey.STAFF },
      create: { key: RoleKey.STAFF, name: "STAFF" },
      update: { isActive: true },
    });
    const role = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `WO Roll ${suffix}` } });
    orgId = org.id;
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Roll ${suffix}`, timezone: "America/New_York" },
    });
    facilityIds.push(facility.id);
    const department = await db.department.create({
      data: { facilityId: facility.id, key: `ROLL_${suffix}`, name: "Roll", isActive: true },
    });
    const unit = await db.unit.create({
      data: { facilityId: facility.id, name: `Unit ${suffix}`, unitType: "KITCHEN" },
    });
    const user = await db.user.create({
      data: {
        email: `wo-roll-${suffix}@example.test`,
        displayName: "Roll",
        facilityId: facility.id,
        roleId: role.id,
        passwordHash: "hash",
      },
    });
    userIds.push(user.id);
    const employee = await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: user.id,
        firstName: "Roll",
        lastName: "Back",
        email: user.email,
        roleType: RoleKey.STAFF,
        primaryDepartmentId: department.id,
      },
    });
    const repair = await db.repair.create({
      data: {
        repairCode: `ROLL-${suffix}`,
        unitId: unit.id,
        title: "Rollback",
        description: "Must not stick",
        responsibleDepartmentId: department.id,
      },
    });
    await assert.rejects(
      db.$transaction(async (tx) => {
        await applyWorkOrderAssigneeChange(tx, {
          repairId: repair.id,
          nextEmployeeId: employee.id,
          actorUserId: user.id,
          occurredAt: new Date("2026-11-01T12:00:00.000Z"),
        });
        throw new Error("rollback");
      }),
      /rollback/,
    );
    const after = await db.repair.findUniqueOrThrow({ where: { id: repair.id } });
    assert.equal(after.assignedEmployeeId, null);
    assert.equal(await db.repairUpdate.count({ where: { repairId: repair.id } }), 0);
    assert.equal(await db.notificationOutbox.count({ where: { facilityId: facility.id } }), 0);
  } finally {
    for (const facilityId of facilityIds) {
      await db.notificationOutbox.deleteMany({ where: { facilityId } });
      await db.repair.deleteMany({ where: { unit: { facilityId } } });
      await db.unit.deleteMany({ where: { facilityId } });
      await db.employee.deleteMany({ where: { facilityId } });
      await db.department.deleteMany({ where: { facilityId } });
    }
    if (userIds.length > 0) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  }
});
