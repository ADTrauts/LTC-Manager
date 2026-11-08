/**
 * Responsibility reconciliation adds the current duty holder.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey, type NotificationRecipientReason } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { changeAssetStatus } from "@/lib/asset-operations/asset-service";
import { createWorkOrderDirect } from "@/lib/asset-operations/work-order-service";
import { acknowledgeNotification } from "@/lib/notifications/lifecycle";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import { evaluateKeyPointOverdue } from "@/lib/operational-cycles/key-point-time-evaluation";
import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
} from "@/lib/operational-time";
import { resolveOnDutySupervisorResponsibility } from "@/lib/scheduling/operational-assignments/resolve-on-duty-supervisor";
import { resolveOperationalResponseResponsibility } from "@/lib/scheduling/operational-assignments/resolve-operational-response";
import { loadCoverageSlotSnapshot } from "@/lib/scheduling/coverage-episodes/observe";
import { recordCoverageEpisodeTransitions } from "@/lib/scheduling/coverage-episodes/record";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { evaluateResponsibilityReconciliation } from "./responsibility-reconciliation";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";
const zone = "America/New_York";
const day = "2026-10-29";

function tag() {
  return randomBytes(4).toString("hex");
}

function at(clock: string) {
  return parseFacilityLocalScheduledStartOnDate(clock, day, zone)!;
}

function session(facilityId: string, userId: string, departmentId: string): FacilitySession {
  return {
    uid: userId,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "MANAGER",
    name: "Duty Manager",
    email: "duty@example.test",
    facilityId,
    primaryDepartmentId: departmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test("current on-call duty is added without removing the opener or escalating", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  const serviceDate = facilityLocalDateToServiceDate(day);
  const early = at("18:55");
  const later = at("19:05");
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Duty ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Duty Terrace ${suffix}`, timezone: zone },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
    });
    const plant = await db.department.create({
      data: { facilityId: facility.id, key: "PLANT", name: "Plant Operations", isActive: true },
    });
    const kitchen = await db.unit.create({
      data: { facilityId: facility.id, name: `Kitchen ${suffix}`, unitType: "KITCHEN" },
    });
    const floor = await db.unit.create({
      data: { facilityId: facility.id, name: `Floor ${suffix}`, unitType: "RESIDENT_AREA" },
    });

    async function person(label: string, departmentId: string, linked: boolean) {
      let userId: string | null = null;
      if (linked) {
        const user = await db.user.create({
          data: {
            email: `duty-${label}-${suffix}@example.test`,
            displayName: label,
            facilityId: facility.id,
            roleId: label === "manager" ? managerRole.id : staffRole.id,
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
            roleKey: label === "manager" ? RoleKey.MANAGER : RoleKey.STAFF,
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
      }
      const employee = await db.employee.create({
        data: {
          facilityId: facility.id,
          userId,
          firstName: "Duty",
          lastName: label,
          roleType: label === "manager" ? RoleKey.MANAGER : RoleKey.STAFF,
          primaryDepartmentId: departmentId,
        },
      });
      return { userId, employee };
    }

    const manager = await person("manager", dietary.id, true);
    const alpha = await person("alpha", dietary.id, true);
    const beta = await person("beta", dietary.id, true);
    const local = await person("local", dietary.id, true);
    const equal = await person("equal", dietary.id, true);
    const unlinked = await person("unlinked", dietary.id, false);
    const plantResponder = await person("plant", plant.id, true);
    assert.ok(manager.userId && alpha.userId && beta.userId && local.userId && equal.userId && plantResponder.userId);
    const actor = session(facility.id, manager.userId, dietary.id);

    async function asset(name: string, unitId: string) {
      return db.asset.create({
        data: {
          assetCode: `DUTY-${suffix}-${name}`,
          name,
          equipmentType: "EQUIPMENT",
          unitId,
          departmentId: dietary.id,
          status: "OPERATIONAL",
        },
      });
    }

    async function cover(input: {
      employeeId: string;
      departmentId: string;
      roleKey: string;
      start: string;
      end: string;
      unitId?: string | null;
    }) {
      return db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: input.departmentId,
          employeeId: input.employeeId,
          serviceDate,
          roleKey: input.roleKey,
          roleLabel: "On-Call Coverage",
          unitId: input.unitId ?? null,
          status: "PLANNED",
          startsAt: at(input.start),
          endsAt: at(input.end),
        },
      });
    }

    const quiet = await asset("Quiet cooler", kitchen.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: quiet.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const quietNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${quiet.id}` },
    });
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: quietNotice.id } }), 0);
    assert.equal(
      (quietNotice.metadata as { responsibility?: { primaryReason?: string } }).responsibility?.primaryReason,
      "ON_CALL_RESPONDER",
    );

    await cover({
      employeeId: beta.employee.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      start: "19:00",
      end: "23:00",
    });
    const beforeWindow = await evaluateResponsibilityReconciliation({ db, now: early, facilityIds: [facility.id] });
    assert.equal(beforeWindow.transitions, 0);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: quietNotice.id } }), 0);
    const atOpen = await resolveOperationalResponseResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      at: early,
      unitId: kitchen.id,
    });
    const atLater = await resolveOperationalResponseResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      at: later,
      unitId: kitchen.id,
    });
    assert.equal(atOpen.status, "uncovered");
    assert.equal(atLater.status, "resolved");
    if (atLater.status === "resolved") {
      assert.deepEqual(atLater.assignments.map((row) => row.employeeId), [beta.employee.id]);
    }
    const gained = await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    assert.equal(gained.transitions, 1);
    const quietRecipients = await db.notificationRecipient.findMany({ where: { notificationId: quietNotice.id } });
    assert.deepEqual(quietRecipients.map((row) => row.userId), [beta.userId]);
    assert.equal(quietRecipients[0]?.acknowledgedAt, null);
    assert.equal(quietRecipients[0]?.readAt, null);
    const again = await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    assert.equal(again.transitions, 0);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: quietNotice.id } }), 1);
    assert.equal(await db.notificationDelivery.count({ where: { notificationRecipientId: quietRecipients[0]!.id } }), 1);

    await cover({
      employeeId: alpha.employee.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      start: "07:00",
      end: "19:00",
    });
    const handed = await asset("Handed cooler", kitchen.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: handed.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const handedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${handed.id}` },
    });
    await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: handedNotice.id, userId: alpha.userId },
    });
    assert.equal(handedNotice.priority, "NEEDS_ATTENTION");
    await db.notificationRecipient.create({
      data: {
        notificationId: handedNotice.id,
        userId: beta.userId,
        reason: "DEPARTMENT_MANAGER",
        explanation: "A different reason does not satisfy primary duty.",
        acknowledgedAt: early,
      },
    });
    await acknowledgeNotification(db, {
      facilityId: facility.id,
      notificationId: handedNotice.id,
      userId: alpha.userId,
      acknowledgedAt: early,
    });
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    const handedRows = await db.notificationRecipient.findMany({
      where: { notificationId: handedNotice.id },
      orderBy: { userId: "asc" },
    });
    const alphaRow = handedRows.find((row) => row.userId === alpha.userId && row.reason === "ON_CALL_RESPONDER");
    const betaRow = handedRows.find((row) => row.userId === beta.userId && row.reason === "ON_CALL_RESPONDER");
    assert.ok(alphaRow && betaRow);
    assert.equal(alphaRow.acknowledgedAt?.toISOString(), early.toISOString());
    assert.equal(betaRow.acknowledgedAt, null);
    assert.equal(betaRow.readAt, null);
    assert.equal(alphaRow.reason, "ON_CALL_RESPONDER");
    assert.equal(betaRow.reason, "ON_CALL_RESPONDER");
    const priorReason = handedRows.find((row) => row.userId === beta.userId && row.reason === "DEPARTMENT_MANAGER");
    assert.equal(priorReason?.acknowledgedAt?.toISOString(), early.toISOString());
    assert.equal(handedRows.filter((row) => row.userId === beta.userId).length, 2);
    const after = await db.notification.findUniqueOrThrow({ where: { id: handedNotice.id } });
    assert.equal(after.priority, "NEEDS_ATTENTION");
    assert.equal(after.createdAt.toISOString(), handedNotice.createdAt.toISOString());
    assert.equal((after.metadata as { protected?: boolean }).protected, false);
    assert.equal(
      await db.notificationRecipient.count({
        where: { notificationId: handedNotice.id, reason: "DEPARTMENT_MANAGER" },
      }),
      1,
    );
    const bell = await getActiveAttentionCountForUser(db, {
      userId: beta.userId,
      facilityId: facility.id,
      now: later,
    });
    assert.equal(bell, 2);
    const center = await loadNotificationCenter(db, {
      userId: beta.userId,
      facilityId: facility.id,
      now: later,
      timeZone: zone,
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") {
      assert.equal(center.needsAttention.some((item) => item.id === handedNotice.id), true);
    }

    await cover({
      employeeId: local.employee.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      start: "19:00",
      end: "23:00",
      unitId: kitchen.id,
    });
    await cover({
      employeeId: equal.employee.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      start: "19:00",
      end: "23:00",
    });
    await cover({
      employeeId: unlinked.employee.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      start: "19:00",
      end: "23:00",
    });
    await cover({
      employeeId: plantResponder.employee.id,
      departmentId: plant.id,
      roleKey: "ON_CALL_COVERAGE",
      start: "07:00",
      end: "23:00",
    });
    const specific = await resolveOperationalResponseResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      at: later,
      unitId: kitchen.id,
    });
    assert.equal(specific.status, "resolved");
    if (specific.status === "resolved") {
      assert.deepEqual(specific.assignments.map((row) => row.employeeId), [local.employee.id]);
    }
    const locatedAsset = await asset("Located cooler", kitchen.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: locatedAsset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const locatedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${locatedAsset.id}` },
    });
    assert.deepEqual(
      (await db.notificationRecipient.findMany({ where: { notificationId: locatedNotice.id } })).map((row) => row.userId),
      [alpha.userId],
    );
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    const locatedIds = (
      await db.notificationRecipient.findMany({ where: { notificationId: locatedNotice.id } })
    ).map((row) => row.userId);
    assert.equal(locatedIds.includes(alpha.userId!), true);
    assert.equal(locatedIds.includes(local.userId!), true);
    assert.equal(locatedIds.includes(beta.userId!), false);
    assert.equal(locatedIds.includes(plantResponder.userId!), false);

    const floorAsset = await asset("Floor pump", floor.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: floorAsset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const floorNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${floorAsset.id}` },
    });
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    const floorIds = new Set(
      (await db.notificationRecipient.findMany({ where: { notificationId: floorNotice.id } })).map((row) => row.userId),
    );
    assert.equal(floorIds.has(alpha.userId!), true);
    assert.equal(floorIds.has(beta.userId!), true);
    assert.equal(floorIds.has(equal.userId!), true);
    assert.equal(floorIds.has(local.userId!), false);
    assert.equal(floorIds.has(plantResponder.userId!), false);
    const secondPass = await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    assert.equal(secondPass.transitions, 0);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: floorNotice.id } }), floorIds.size);

    await db.notification.update({ where: { id: quietNotice.id }, data: { resolvedAt: later } });
    const beforeResolved = await db.notificationRecipient.count({ where: { notificationId: quietNotice.id } });
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: quietNotice.id } }), beforeResolved);
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

test("intervention, coverage, key points, and excluded threads follow the same duty rule", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  const serviceDate = facilityLocalDateToServiceDate(day);
  const during = at("08:00");
  const later = at("19:05");
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Duty two ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Duty Two ${suffix}`, timezone: zone },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
    });
    const unit = await db.unit.create({
      data: { facilityId: facility.id, name: `Neighborhood ${suffix}`, unitType: "RESIDENT_AREA", hierarchyRole: "NEIGHBORHOOD" },
    });
    const space = await db.unitSpace.create({
      data: { facilityId: facility.id, unitId: unit.id, name: `Dining ${suffix}`, spaceType: "SERVICE_AREA" },
    });
    await db.unitSpaceResponsibility.create({ data: { spaceId: space.id, departmentId: dietary.id } });
    const profile = await db.departmentOperationalProfile.create({
      data: { facilityId: facility.id, departmentId: dietary.id, name: "Food", version: 1, status: "ACTIVE" },
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
        departmentId: dietary.id,
        stableKey: "breakfast",
        label: "Breakfast",
        cycleType: "SERVICE",
        nodeKind: "PERIOD",
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
        departmentId: dietary.id,
        stableKey: `duty-${suffix}`,
        name: "Breakfast coverage",
        status: "PUBLISHED",
        isActive: true,
        items: {
          create: {
            roleKey: "SERVER",
            roleLabel: "Server",
            requiredCount: 1,
            spaceId: space.id,
            applicableOperationalCycleStableKeys: ["breakfast"],
          },
        },
      },
    });
    const plan = await db.operationalAssignmentPlan.create({
      data: { facilityId: facility.id, departmentId: dietary.id, serviceDate, status: "CONFIRMED" },
    });

    async function person(label: string) {
      const user = await db.user.create({
        data: {
          email: `duty2-${label}-${suffix}@example.test`,
          displayName: label,
          facilityId: facility.id,
          roleId: label === "manager" ? managerRole.id : staffRole.id,
          passwordHash: "hash",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      userIds.push(user.id);
      const access = await db.userFacilityAccess.create({
        data: { userId: user.id, facilityId: facility.id, isActive: true },
      });
      await db.userFacilityRolePeriod.create({
        data: {
          userFacilityAccessId: access.id,
          roleKey: label === "manager" ? RoleKey.MANAGER : RoleKey.STAFF,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      const employee = await db.employee.create({
        data: {
          facilityId: facility.id,
          userId: user.id,
          firstName: "Duty",
          lastName: label,
          roleType: label === "manager" ? RoleKey.MANAGER : RoleKey.STAFF,
          primaryDepartmentId: dietary.id,
        },
      });
      return { userId: user.id, employee };
    }

    const manager = await person("manager");
    const alpha = await person("alpha");
    const beta = await person("beta");
    const server = await person("server");
    const actor = session(facility.id, manager.userId, dietary.id);

    async function duty(input: {
      employeeId: string;
      roleKey: string;
      roleLabel: string;
      start: string;
      end: string;
      located?: boolean;
    }) {
      const row = await db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          planId: plan.id,
          employeeId: input.employeeId,
          serviceDate,
          roleKey: input.roleKey,
          roleLabel: input.roleLabel,
          status: "PLANNED",
          unitId: unit.id,
          startsAt: at(input.start),
          endsAt: at(input.end),
        },
      });
      if (input.located) {
        await db.operationalAssignmentLocation.create({
          data: { assignmentId: row.id, unitSpaceId: space.id, unitId: unit.id, labelSnapshot: space.name },
        });
      }
      return row;
    }

    await duty({
      employeeId: alpha.employee.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      start: "07:00",
      end: "19:00",
    });
    await duty({
      employeeId: beta.employee.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      start: "19:00",
      end: "23:00",
    });
    await duty({
      employeeId: alpha.employee.id,
      roleKey: "DIETARY_SUPERVISOR_ROUNDING",
      roleLabel: "Supervisor rounding",
      start: "07:00",
      end: "19:00",
      located: true,
    });
    const betaSupervisor = await duty({
      employeeId: beta.employee.id,
      roleKey: "DIETARY_SUPERVISOR_ROUNDING",
      roleLabel: "Supervisor rounding",
      start: "19:00",
      end: "23:00",
      located: true,
    });
    const serverAssignment = await duty({
      employeeId: server.employee.id,
      roleKey: "SERVER",
      roleLabel: "Server",
      start: "07:00",
      end: "15:00",
      located: true,
    });

    const opened = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: unit.id,
      spaceId: space.id,
      title: "Cooler down",
      description: "Production cannot continue.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: during,
    });
    const intervention = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceType: "work_order_response" },
    });
    assert.equal(intervention.priority, "URGENT");
    assert.deepEqual(
      (await db.notificationRecipient.findMany({ where: { notificationId: intervention.id } })).map((row) => row.userId),
      [alpha.userId],
    );
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    const interventionIds = (
      await db.notificationRecipient.findMany({ where: { notificationId: intervention.id } })
    ).map((row) => row.userId);
    assert.equal(interventionIds.includes(alpha.userId), true);
    assert.equal(interventionIds.includes(beta.userId), true);
    const repair = await db.repair.findUniqueOrThrow({ where: { id: opened.id } });
    assert.equal(repair.assignedEmployeeId, null);
    assert.equal(repair.priority, "LOW");
    assert.equal(repair.responseRequirement, "IMMEDIATE");
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: intervention.id } })).priority, "URGENT");

    const scope = { facilityId: facility.id, departmentId: dietary.id, serviceDateKey: day };
    const covered = await loadCoverageSlotSnapshot(db, scope);
    await db.operationalAssignment.update({ where: { id: serverAssignment.id }, data: { status: "CANCELLED" } });
    const uncoveredIds = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: covered,
        occurredAt: during,
        sourceType: "assignment_event",
        sourceId: serverAssignment.id,
      }),
    );
    for (const outboxId of uncoveredIds) await processNotificationOutboxRow(db, { outboxId });
    const uncovered = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceType: "coverage_responsibility", resolvedAt: null },
    });
    assert.equal(uncovered.priority, "CRITICAL");
    assert.equal(
      (await db.notificationRecipient.findMany({ where: { notificationId: uncovered.id } })).some(
        (row) => row.userId === alpha.userId,
      ),
      true,
    );
    const earlyDuty = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      serviceDate: day,
      at: during,
      spaceId: space.id,
    });
    const laterDuty = await resolveOnDutySupervisorResponsibility(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      serviceDate: day,
      at: later,
      spaceId: space.id,
    });
    assert.equal(earlyDuty.status, "resolved");
    assert.equal(laterDuty.status, "resolved");
    if (earlyDuty.status === "resolved" && laterDuty.status === "resolved") {
      assert.deepEqual(earlyDuty.assignments.map((row) => row.employeeId), [alpha.employee.id]);
      assert.deepEqual(laterDuty.assignments.map((row) => row.employeeId), [beta.employee.id]);
    }
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    const uncoveredRows = await db.notificationRecipient.findMany({ where: { notificationId: uncovered.id } });
    assert.equal(uncoveredRows.some((row) => row.userId === alpha.userId), true);
    assert.equal(uncoveredRows.some((row) => row.userId === beta.userId), true);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: uncovered.id } })).priority, "CRITICAL");
    assert.equal(await db.coverageEpisode.count({ where: { facilityId: facility.id, closedAt: null } }), 1);

    const whileUncovered = await loadCoverageSlotSnapshot(db, scope);
    await db.operationalAssignment.update({ where: { id: serverAssignment.id }, data: { status: "PLANNED" } });
    const restoredIds = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: whileUncovered,
        occurredAt: during,
        sourceType: "assignment_event",
        sourceId: `${serverAssignment.id}-back`,
      }),
    );
    for (const outboxId of restoredIds) await processNotificationOutboxRow(db, { outboxId });
    const whileCovered = await loadCoverageSlotSnapshot(db, scope);
    const item = await db.operationalAssignmentTemplateItem.findFirstOrThrow({ where: { templateId: template.id } });
    await db.operationalAssignmentTemplateItem.update({ where: { id: item.id }, data: { requiredCount: 2 } });
    const riskIds = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: whileCovered,
        occurredAt: during,
        sourceType: "assignment_event",
        sourceId: `${serverAssignment.id}-risk`,
      }),
    );
    for (const outboxId of riskIds) await processNotificationOutboxRow(db, { outboxId });
    const atRisk = await db.notification.findFirstOrThrow({
      where: {
        facilityId: facility.id,
        sourceType: "coverage_responsibility",
        resolvedAt: null,
        requiresAcknowledgement: false,
      },
    });
    assert.equal(atRisk.priority, "NEEDS_ATTENTION");
    assert.equal(atRisk.requiresAcknowledgement, false);
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    const riskRows = await db.notificationRecipient.findMany({ where: { notificationId: atRisk.id } });
    assert.equal(riskRows.some((row) => row.userId === beta.userId && row.reason === "ON_DUTY_SUPERVISOR"), true);
    assert.equal(riskRows.some((row) => row.reason === "DEPARTMENT_MANAGER"), false);

    const keyCycle = await db.departmentOperationalCycle.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        stableKey: "servery_ready",
        label: "Servery Ready",
        nodeKind: "KEY_TIME",
        occurrenceTracking: "REQUIRED",
        keyPointGrain: "LOCATION",
        version: 1,
        cycleType: "SERVICE",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: facilityLocalDateToServiceDate("2026-01-01"),
        status: "PUBLISHED",
      },
    });
    const group = await db.departmentOperationalCycleKeyTimeGroup.create({
      data: { cycleId: keyCycle.id, dueLocal: "12:00" },
    });
    await db.operationalCycleKeyTimeDayExpectation.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        serviceDate,
        cycleId: keyCycle.id,
        cycleStableKey: keyCycle.stableKey,
        cycleVersion: 1,
        cycleLabel: keyCycle.label,
        displayPath: "Breakfast → Servery Ready",
        keyTimeGroupId: group.id,
        spaceId: space.id,
        configuredDueLocal: "12:00",
      },
    });
    const keyRun = await evaluateKeyPointOverdue({ db, now: at("12:30"), facilityIds: [facility.id] });
    for (const outboxId of keyRun.outboxIds) await processNotificationOutboxRow(db, { outboxId });
    const keyNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceType: "key_point_occurrence" },
    });
    assert.equal(keyNotice.priority, "URGENT");
    assert.equal((keyNotice.metadata as { protected?: boolean }).protected, true);
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    const keyRows = await db.notificationRecipient.findMany({ where: { notificationId: keyNotice.id } });
    assert.equal(keyRows.some((row) => row.userId === alpha.userId), true);
    assert.equal(keyRows.some((row) => row.userId === beta.userId), true);
    const keyAfter = await db.notification.findUniqueOrThrow({ where: { id: keyNotice.id } });
    assert.equal(keyAfter.priority, "URGENT");
    assert.equal((keyAfter.metadata as { protected?: boolean }).protected, true);

    const overdue = await db.notification.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        kind: "OPERATIONAL",
        category: "work_order",
        priority: "NEEDS_ATTENTION",
        sourceType: "work_order_overdue",
        sourceId: `overdue-${suffix}`,
        title: "Work Order overdue",
        body: "The deadline passed.",
        dedupeKey: `overdue-${suffix}`,
        requiresAcknowledgement: true,
        occurredAt: during,
        policyVersion: "notifications-n1b-v1",
        metadata: { protected: false, responsibility: { primaryReason: "WORK_ORDER_ASSIGNEE" } },
        recipients: {
          create: {
            userId: server.userId,
            reason: "WORK_ORDER_ASSIGNEE" satisfies NotificationRecipientReason,
            explanation: "Assignee",
          },
        },
      },
    });
    for (const sourceType of ["assignment_change", "work_order_assignment", "issue"] as const) {
      await db.notification.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          kind: "OPERATIONAL",
          category: "update",
          priority: "UPDATE",
          sourceType,
          sourceId: `${sourceType}-${suffix}`,
          title: sourceType,
          body: "Historical update.",
          dedupeKey: `${sourceType}-${suffix}`,
          requiresAcknowledgement: false,
          occurredAt: during,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" } },
          recipients: {
            create: { userId: alpha.userId, reason: "ON_DUTY_SUPERVISOR", explanation: "Historical" },
          },
        },
      });
    }
    const update = await db.notification.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        kind: "OPERATIONAL",
        category: "record",
        priority: "UPDATE",
        sourceType: "evidence_record",
        sourceId: `evidence-${suffix}`,
        title: "Record out of standard",
        body: "Historical.",
        dedupeKey: `evidence-${suffix}`,
        requiresAcknowledgement: false,
        occurredAt: during,
        policyVersion: "notifications-n1b-v1",
        metadata: { protected: false, responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" } },
        recipients: {
          create: {
            userId: alpha.userId,
            reason: "ON_DUTY_SUPERVISOR",
            explanation: "Supervisor",
          },
        },
      },
    });
    const gamma = await person("gamma");
    await duty({
      employeeId: gamma.employee.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      start: "19:00",
      end: "23:00",
    });
    await db.notification.update({ where: { id: intervention.id }, data: { expiresAt: later } });
    const endedBefore = await db.notificationRecipient.count({ where: { notificationId: intervention.id } });
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: intervention.id } }), endedBefore);
    assert.equal(
      (await db.notificationRecipient.findMany({ where: { notificationId: intervention.id } })).some(
        (row) => row.userId === gamma.userId,
      ),
      false,
    );
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: overdue.id } }), 1);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: update.id } }), 1);
    for (const sourceType of ["assignment_change", "work_order_assignment", "issue"]) {
      assert.equal(
        await db.notificationRecipient.count({
          where: { notification: { facilityId: facility.id, sourceType, dedupeKey: `${sourceType}-${suffix}` } },
        }),
        1,
      );
    }
    assert.equal(
      (await db.notificationRecipient.findMany({ where: { notificationId: intervention.id } })).some(
        (row) => row.userId === beta.userId,
      ),
      true,
    );
    const endedCount = await db.notificationRecipient.count({ where: { notificationId: intervention.id } });
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: intervention.id } }), endedCount);
    assert.ok(betaSupervisor.id);
  } finally {
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facility: { displayName: { contains: suffix } } } } },
    });
    await db.notificationRecipient.deleteMany({
      where: { notification: { facility: { displayName: { contains: suffix } } } },
    });
    await db.notification.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.notificationOutbox.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    const facilities = await db.facility.findMany({
      where: { displayName: { contains: suffix } },
      select: { id: true },
    });
    const facilityIds = facilities.map((row) => row.id);
    await db.coverageEpisodeTransition.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.coverageEpisode.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.workOrderResponseHistory.deleteMany({ where: { repair: { unit: { facility: { displayName: { contains: suffix } } } } } });
    await db.repairUpdate.deleteMany({ where: { repair: { unit: { facility: { displayName: { contains: suffix } } } } } });
    await db.repair.deleteMany({ where: { unit: { facility: { displayName: { contains: suffix } } } } });
    await db.operationalCycleKeyTimeDayExpectation.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.departmentOperationalCycleKeyTimeGroup.deleteMany({ where: { cycle: { facility: { displayName: { contains: suffix } } } } });
    await db.operationalAssignmentLocation.deleteMany({ where: { assignment: { facility: { displayName: { contains: suffix } } } } });
    await db.operationalAssignment.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.operationalAssignmentPlan.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.operationalAssignmentTemplate.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.departmentOperationalCycle.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.departmentOperationalProfile.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.unitSpace.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
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
