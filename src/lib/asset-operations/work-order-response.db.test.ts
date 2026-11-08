/**
 * Work Order response requirement is owned by the Work Order.
 * Queue priority, Issue priority, and Request urgency do not set it.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { changeAssetStatus } from "./asset-service";
import { reportIssue } from "./issue-service";
import { workOrderRequiresImmediateResponse } from "./work-order-semantics";
import { setWorkOrderResponseRequirement } from "./work-order-response";
import {
  assignResponsibleEmployee,
  completeWorkOrder,
  createWorkOrderDirect,
  createWorkOrderFromIssue,
  createWorkOrderFromOperationalRequest,
  recordWorkOrderDeadline,
  updateWorkOrderStatus,
} from "./work-order-service";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

function session(facilityId: string, userId: string, departmentId: string, role: "MANAGER" | "STAFF" = "MANAGER"): FacilitySession {
  return {
    uid: userId,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role,
    name: "Response Manager",
    email: "response@example.test",
    facilityId,
    primaryDepartmentId: departmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test("a Work Order owns immediate response separately from priority", { skip }, async () => {
  const previousContracted = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  try {
    const managerRole = await db.role.upsert({
      where: { key: RoleKey.MANAGER },
      update: {},
      create: { key: RoleKey.MANAGER, name: "Manager" },
    });
    const staffRole = await db.role.upsert({
      where: { key: RoleKey.STAFF },
      update: {},
      create: { key: RoleKey.STAFF, name: "Staff" },
    });
    const org = await db.organization.create({ data: { name: `Response Org ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Response ${suffix}`, timezone: "America/New_York" },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
    });
    const kitchen = await db.unit.create({
      data: { facilityId: facility.id, name: `Kitchen ${suffix}`, unitType: "KITCHEN" },
    });
    const managerUser = await db.user.create({
      data: {
        email: `response-manager-${suffix}@example.test`,
        displayName: "Response Manager",
        facilityId: facility.id,
        roleId: managerRole.id,
        passwordHash: "hash",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const staffUser = await db.user.create({
      data: {
        email: `response-staff-${suffix}@example.test`,
        displayName: "Response Staff",
        facilityId: facility.id,
        roleId: staffRole.id,
        passwordHash: "hash",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    userIds.push(managerUser.id, staffUser.id);
    for (const user of [managerUser, staffUser]) {
      const access = await db.userFacilityAccess.create({
        data: { userId: user.id, facilityId: facility.id, isActive: true },
      });
      await db.userFacilityRolePeriod.create({
        data: {
          userFacilityAccessId: access.id,
          roleKey: user.id === managerUser.id ? RoleKey.MANAGER : RoleKey.STAFF,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
    }
    const managerEmployee = await db.employee.create({
      data: {
        facilityId: facility.id,
        userId: managerUser.id,
        firstName: "Response",
        lastName: "Manager",
        roleType: RoleKey.MANAGER,
        primaryDepartmentId: dietary.id,
      },
    });
    const actor = session(facility.id, managerUser.id, dietary.id);
    const staff = session(facility.id, staffUser.id, dietary.id, "STAFF");
    const at = new Date("2026-10-29T15:30:00.000Z");

    const ordinary = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      unitId: kitchen.id,
      title: "Tighten a hinge",
      description: "The pantry door hinge is loose.",
      priority: "EMERGENCY",
      client: db,
      now: at,
    });
    assert.equal(ordinary.priority, "EMERGENCY");
    assert.equal(ordinary.responseRequirement, "STANDARD");
    assert.equal(workOrderRequiresImmediateResponse(ordinary), false);
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: ordinary.id } }), 0);

    const opened = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      unitId: kitchen.id,
      title: "Cooler is down",
      description: "The walk-in stopped during meal production.",
      priority: "MEDIUM",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at,
    });
    assert.equal(opened.responseRequirement, "IMMEDIATE");
    assert.equal(workOrderRequiresImmediateResponse(opened), true);
    const openedRows = await db.workOrderResponseHistory.findMany({
      where: { repairId: opened.id },
      orderBy: { changedAt: "asc" },
    });
    assert.equal(openedRows.length, 1);
    assert.equal(openedRows[0]?.transition, "OPENED");
    assert.equal(openedRows[0]?.fromRequirement, null);
    assert.equal(openedRows[0]?.toRequirement, "IMMEDIATE");

    const same = await setWorkOrderResponseRequirement(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      responseRequirement: "IMMEDIATE",
      client: db,
      now: new Date(at.getTime() + 60_000),
    });
    assert.equal(same.historyId, null);
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: opened.id } }), 1);

    await assert.rejects(
      () =>
        setWorkOrderResponseRequirement(staff, {
          facilityId: facility.id,
          departmentId: dietary.id,
          repairId: opened.id,
          responseRequirement: "STANDARD",
          client: db,
        }),
      /Work Order management denied/,
    );

    const cleared = await setWorkOrderResponseRequirement(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      responseRequirement: "STANDARD",
      client: db,
      now: new Date(at.getTime() + 120_000),
    });
    assert.ok(cleared.historyId);
    assert.equal(cleared.repair.responseRequirement, "STANDARD");
    assert.equal(workOrderRequiresImmediateResponse(cleared.repair), false);

    const again = await setWorkOrderResponseRequirement(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      responseRequirement: "IMMEDIATE",
      client: db,
      now: new Date(at.getTime() + 180_000),
    });
    assert.ok(again.historyId);
    assert.notEqual(again.historyId, openedRows[0]?.id);
    assert.notEqual(again.historyId, cleared.historyId);
    const episodes = await db.workOrderResponseHistory.findMany({
      where: { repairId: opened.id, transition: "OPENED" },
    });
    assert.equal(episodes.length, 2);

    const assigned = await assignResponsibleEmployee(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      assignedEmployeeId: managerEmployee.id,
      client: db,
    });
    assert.equal(assigned.responseRequirement, "IMMEDIATE");
    const due = new Date("2026-10-30T16:00:00.000Z");
    const deadline = await recordWorkOrderDeadline(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      dueAt: due,
      client: db,
      now: new Date(at.getTime() + 240_000),
    });
    assert.equal(deadline.responseRequirement, "IMMEDIATE");
    assert.equal(deadline.dueAt?.toISOString(), due.toISOString());

    await updateWorkOrderStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      toStatus: "ON_HOLD",
      holdReason: "WAITING_FOR_VENDOR",
      client: db,
      now: new Date(at.getTime() + 300_000),
    });
    const held = await db.repair.findUniqueOrThrow({ where: { id: opened.id } });
    assert.equal(held.status, "ON_HOLD");
    assert.equal(held.responseRequirement, "IMMEDIATE");
    assert.equal(workOrderRequiresImmediateResponse(held), true);
    assert.equal(
      await db.workOrderResponseHistory.count({ where: { repairId: opened.id, transition: "CLEARED" } }),
      1,
    );

    const asset = await db.asset.create({
      data: {
        assetCode: `RSP-${suffix}`,
        name: "Walk-in",
        equipmentType: "EQUIPMENT",
        unitId: kitchen.id,
        departmentId: dietary.id,
        status: "OPERATIONAL",
      },
    });
    const withAsset = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: asset.id,
      title: "Walk-in response",
      description: "Production cannot continue.",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at,
    });
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: asset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      client: db,
      now: at,
    });
    const afterAsset = await db.repair.findUniqueOrThrow({ where: { id: withAsset.id } });
    assert.equal(afterAsset.responseRequirement, "IMMEDIATE");
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: withAsset.id } }), 1);

    const issue = await reportIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      unitId: kitchen.id,
      summary: "Noisy mixer",
      description: "Heard during service.",
      priority: "EMERGENCY",
      operationalImpact: "EQUIPMENT_UNAVAILABLE",
      client: db,
      observedAt: at,
    });
    const fromIssue = await createWorkOrderFromIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      issueId: issue.issue.id,
      client: db,
      now: at,
    });
    assert.equal(fromIssue.priority, "EMERGENCY");
    assert.equal(fromIssue.responseRequirement, "STANDARD");
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: fromIssue.id } }), 0);

    const request = await db.operationalRequest.create({
      data: {
        requestCode: `RQ-${suffix}`,
        facilityId: facility.id,
        requestingDepartmentId: dietary.id,
        responsibleDepartmentId: dietary.id,
        unitId: kitchen.id,
        summary: "Dish machine down",
        description: "Service is at risk.",
        priority: "EMERGENCY",
        operationalImpact: "SERVICE_AT_RISK",
        observedAt: at,
      },
    });
    const fromRequest = await createWorkOrderFromOperationalRequest(actor, {
      facilityId: facility.id,
      plantDepartmentId: dietary.id,
      requestId: request.id,
      client: db,
      now: at,
    });
    assert.equal(fromRequest.priority, "EMERGENCY");
    assert.equal(fromRequest.responseRequirement, "STANDARD");
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: fromRequest.id } }), 0);

    const preventive = await db.repair.create({
      data: {
        repairCode: `PM-${suffix}`,
        unitId: kitchen.id,
        title: "Quarterly belt check",
        description: "Scheduled preventive service.",
        priority: "URGENT",
        workOrderKind: "PREVENTIVE",
        responsibleDepartmentId: dietary.id,
      },
    });
    assert.equal(preventive.responseRequirement, "STANDARD");
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: preventive.id } }), 0);

    await updateWorkOrderStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: withAsset.id,
      toStatus: "IN_PROGRESS",
      client: db,
      now: new Date(at.getTime() + 60_000),
    });
    await db.repairLaborEntry.create({
      data: { repairId: withAsset.id, employeeId: managerEmployee.id, minutes: 20 },
    });
    await completeWorkOrder(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: withAsset.id,
      workPerformed: "Restored the walk-in.",
      assetConditionReview: "NO_CHANGE",
      client: db,
      now: new Date(at.getTime() + 120_000),
    });
    const completed = await db.repair.findUniqueOrThrow({ where: { id: withAsset.id } });
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.responseRequirement, "IMMEDIATE");
    assert.equal(workOrderRequiresImmediateResponse(completed), false);
    const completedHistory = await db.workOrderResponseHistory.findFirstOrThrow({
      where: { repairId: withAsset.id, transition: "COMPLETED" },
    });
    assert.notEqual(completedHistory.id, (await db.workOrderResponseHistory.findFirstOrThrow({
      where: { repairId: withAsset.id, transition: "OPENED" },
    })).id);

    const cancelled = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      unitId: kitchen.id,
      title: "Stop this response",
      description: "The condition was withdrawn.",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at,
    });
    await updateWorkOrderStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: cancelled.id,
      toStatus: "CANCELLED",
      client: db,
      now: new Date(at.getTime() + 60_000),
    });
    const cancelledRow = await db.repair.findUniqueOrThrow({ where: { id: cancelled.id } });
    assert.equal(cancelledRow.responseRequirement, "IMMEDIATE");
    assert.equal(workOrderRequiresImmediateResponse(cancelledRow), false);
    assert.equal(
      (await db.workOrderResponseHistory.findFirstOrThrow({
        where: { repairId: cancelled.id, transition: "CANCELLED" },
      })).toRequirement,
      "IMMEDIATE",
    );
  } finally {
    process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previousContracted;
    await db.workOrderResponseHistory.deleteMany({ where: { repair: { unit: { facility: { displayName: { contains: suffix } } } } } });
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facility: { displayName: { contains: suffix } } } } },
    });
    await db.notificationRecipient.deleteMany({
      where: { notification: { facility: { displayName: { contains: suffix } } } },
    });
    await db.notification.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.notificationOutbox.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.repairLaborEntry.deleteMany({ where: { repair: { unit: { facility: { displayName: { contains: suffix } } } } } });
    await db.repairUpdate.deleteMany({ where: { repair: { unit: { facility: { displayName: { contains: suffix } } } } } });
    await db.repair.deleteMany({ where: { unit: { facility: { displayName: { contains: suffix } } } } });
    await db.operationalRequestUpdate.deleteMany({ where: { request: { facility: { displayName: { contains: suffix } } } } });
    await db.operationalRequest.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.assetIssue.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.assetStatusHistory.deleteMany({ where: { asset: { unit: { facility: { displayName: { contains: suffix } } } } } });
    await db.asset.deleteMany({ where: { unit: { facility: { displayName: { contains: suffix } } } } });
    await db.unit.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.employee.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { userId: { in: userIds } } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.facility.deleteMany({ where: { displayName: { contains: suffix } } });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});
