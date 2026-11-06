/**
 * asset.out_of_service follows the Asset status transition.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RepairPriority, RoleKey } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { acknowledgeNotification, markNotificationRead } from "@/lib/notifications/lifecycle";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
} from "@/lib/operational-time";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { createAsset, changeAssetStatus, retireAsset } from "./asset-service";
import { reportIssue } from "./issue-service";
import { completeWorkOrder } from "./work-order-service";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

function session(facilityId: string, userId: string, departmentId: string): FacilitySession {
  return {
    uid: userId,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "MANAGER",
    name: "Asset Manager",
    email: "assets@example.test",
    facilityId,
    primaryDepartmentId: departmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test("an Asset outage notifies on-call coverage and one later outage is a new incident", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const previousContracted = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  const suffix = tag();
  const userIds: string[] = [];
  const zone = "America/New_York";
  const day = "2026-10-29";
  const at = parseFacilityLocalScheduledStartOnDate("11:30", day, zone)!;
  const serviceDate = facilityLocalDateToServiceDate(day);
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Outage ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Outage Terrace ${suffix}`, timezone: zone },
    });
    const otherFacility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Outage Other ${suffix}`, timezone: zone },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
    });
    const evs = await db.department.create({
      data: { facilityId: facility.id, key: "EVS", name: "Environmental Services", isActive: true },
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
    const plantRoom = await db.unit.create({
      data: { facilityId: facility.id, name: `Boiler room ${suffix}`, unitType: "MECHANICAL" },
    });

    async function person(input: { label: string; role: RoleKey; departmentId: string; user: boolean }) {
      let userId: string | null = null;
      if (input.user) {
        const role = input.role === RoleKey.MANAGER ? managerRole : staffRole;
        const user = await db.user.create({
          data: {
            email: `outage-${input.label}-${suffix}@example.test`,
            displayName: `Outage ${input.label}`,
            facilityId: facility.id,
            roleId: role.id,
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
          data: { userFacilityAccessId: access.id, roleKey: input.role, startsAt: new Date("2026-01-01T00:00:00.000Z") },
        });
      }
      const employee = await db.employee.create({
        data: {
          facilityId: facility.id,
          userId,
          firstName: "Outage",
          lastName: input.label,
          roleType: input.role,
          primaryDepartmentId: input.departmentId,
        },
      });
      return { userId, employee };
    }

    const manager = await person({ label: "manager", role: RoleKey.MANAGER, departmentId: dietary.id, user: true });
    const primary = await person({ label: "primary", role: RoleKey.STAFF, departmentId: dietary.id, user: true });
    const second = await person({ label: "second", role: RoleKey.STAFF, departmentId: dietary.id, user: true });
    const located = await person({ label: "located", role: RoleKey.STAFF, departmentId: dietary.id, user: true });
    const unlinked = await person({ label: "unlinked", role: RoleKey.STAFF, departmentId: dietary.id, user: false });
    const absent = await person({ label: "absent", role: RoleKey.STAFF, departmentId: dietary.id, user: true });
    const plantResponder = await person({ label: "plant", role: RoleKey.STAFF, departmentId: plant.id, user: true });
    const outsider = await person({ label: "outsider", role: RoleKey.STAFF, departmentId: dietary.id, user: true });
    await db.userFacilityAccess.updateMany({
      where: { userId: outsider.userId ?? "" },
      data: { facilityId: otherFacility.id },
    });
    assert.ok(manager.userId && primary.userId && second.userId && located.userId && absent.userId && plantResponder.userId);

    const window = {
      startsAt: parseFacilityLocalScheduledStartOnDate("07:00", day, zone),
      endsAt: parseFacilityLocalScheduledStartOnDate("19:00", day, zone),
    };
    async function cover(input: {
      employeeId: string;
      departmentId: string;
      roleKey: string;
      unitId?: string | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
    }) {
      await db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: input.departmentId,
          employeeId: input.employeeId,
          serviceDate,
          roleKey: input.roleKey,
          roleLabel: "On-Call Coverage",
          unitId: input.unitId ?? null,
          status: "PLANNED",
          startsAt: input.startsAt === undefined ? window.startsAt : input.startsAt,
          endsAt: input.endsAt === undefined ? window.endsAt : input.endsAt,
        },
      });
    }
    await cover({ employeeId: primary.employee.id, departmentId: dietary.id, roleKey: "DIETARY_ON_CALL_COVERAGE" });
    await cover({ employeeId: second.employee.id, departmentId: dietary.id, roleKey: "DIETARY_ON_CALL_COVERAGE" });
    await cover({ employeeId: unlinked.employee.id, departmentId: dietary.id, roleKey: "DIETARY_ON_CALL_COVERAGE" });
    await cover({
      employeeId: located.employee.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      unitId: floor.id,
    });
    await cover({
      employeeId: absent.employee.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      startsAt: parseFacilityLocalScheduledStartOnDate("19:00", day, zone),
      endsAt: parseFacilityLocalScheduledStartOnDate("21:00", day, zone),
    });
    await cover({ employeeId: plantResponder.employee.id, departmentId: plant.id, roleKey: "ON_CALL_COVERAGE" });
    await db.scheduleEntry.create({
      data: {
        employeeId: absent.employee.id,
        departmentId: dietary.id,
        date: serviceDate,
        shift: "FULL_DAY",
        calledOffAt: at,
        callOffReason: "Called off",
        plannedStart: "19:00",
        plannedEnd: "21:00",
      },
    });

    const actor = session(facility.id, manager.userId, dietary.id);
    async function assetRow(input: {
      name: string;
      unitId: string;
      departmentId: string | null;
      criticality?: "CRITICAL" | "ROUTINE";
      status?: "OPERATIONAL" | "OUT_OF_SERVICE" | "DEGRADED";
    }) {
      return db.asset.create({
        data: {
          assetCode: `OUT-${suffix}-${input.name}`,
          name: input.name,
          equipmentType: "EQUIPMENT",
          unitId: input.unitId,
          departmentId: input.departmentId,
          criticality: input.criticality ?? "ROUTINE",
          status: input.status ?? "OPERATIONAL",
        },
      });
    }

    const registered = await createAsset(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      unitId: kitchen.id,
      name: "Warming cabinet",
      equipmentType: "EQUIPMENT",
      status: "OUT_OF_SERVICE",
      client: db,
    });
    assert.equal(registered.status, "OUT_OF_SERVICE");
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: facility.id, eventType: "asset.out_of_service" } }),
      0,
    );

    const cooler = await assetRow({ name: "Refrigerator", unitId: kitchen.id, departmentId: dietary.id, criticality: "CRITICAL" });
    const routine = await assetRow({ name: "Cart", unitId: kitchen.id, departmentId: dietary.id, criticality: "ROUTINE" });
    const machine = await assetRow({ name: "Floor machine", unitId: floor.id, departmentId: dietary.id });
    const boiler = await assetRow({ name: "Boiler", unitId: plantRoom.id, departmentId: plant.id });
    const undepartmented = await assetRow({ name: "Shared pump", unitId: kitchen.id, departmentId: null });

    await assert.rejects(
      () =>
        db.$transaction(async (tx) => {
          await changeAssetStatus(actor, {
            facilityId: facility.id,
            departmentId: dietary.id,
            assetId: cooler.id,
            toStatus: "OUT_OF_SERVICE",
            reason: "MANUAL",
            client: tx,
            now: at,
          });
          throw new Error("rollback");
        }),
      /rollback/,
    );
    assert.equal((await db.asset.findUniqueOrThrow({ where: { id: cooler.id } })).status, "OPERATIONAL");
    assert.equal(await db.assetStatusHistory.count({ where: { assetId: cooler.id } }), 0);
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: facility.id, eventType: "asset.out_of_service" } }),
      0,
    );

    const degraded = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: cooler.id,
      toStatus: "DEGRADED",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    assert.equal(degraded.attentionOutboxIds.length, 0);

    const opened = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: cooler.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    assert.equal(opened.attentionOutboxIds.length, 1);
    const again = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: cooler.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    assert.equal(again.attentionOutboxIds.length, 0);
    assert.equal(await db.assetStatusHistory.count({ where: { assetId: cooler.id, toStatus: "OUT_OF_SERVICE" } }), 1);

    const notice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceType: "asset_status", category: "asset" },
    });
    assert.equal(notice.priority, "NEEDS_ATTENTION");
    assert.equal(notice.requiresAcknowledgement, true);
    assert.equal(notice.actionPath, `/assets/${cooler.id}`);
    assert.equal(notice.title, "Asset out of service");
    assert.match(notice.body, /Refrigerator/);
    assert.equal(notice.resolvedAt, null);
    const recipients = await db.notificationRecipient.findMany({
      where: { notificationId: notice.id },
      select: { userId: true, explanation: true },
    });
    assert.deepEqual(recipients.map((row) => row.userId).sort(), [primary.userId, second.userId].sort());
    assert.match(recipients[0]?.explanation ?? "", /On-Call Coverage/);
    assert.equal(recipients.some((row) => row.userId === plantResponder.userId), false);
    assert.equal(recipients.some((row) => row.userId === outsider.userId), false);
    assert.equal(recipients.some((row) => row.userId === located.userId), false);

    const center = await loadNotificationCenter(db, {
      userId: primary.userId,
      facilityId: facility.id,
      now: at,
      timeZone: zone,
    });
    assert.equal(center.needsAttention.some((item) => item.id === notice.id), true);
    assert.equal(await getActiveAttentionCountForUser(db, { userId: primary.userId, facilityId: facility.id, now: at }), 1);
    await markNotificationRead(db, { facilityId: facility.id, notificationId: notice.id, userId: primary.userId, readAt: at });
    await acknowledgeNotification(db, { facilityId: facility.id, notificationId: notice.id, userId: primary.userId, acknowledgedAt: at });
    const afterAck = await db.notification.findUniqueOrThrow({ where: { id: notice.id } });
    assert.equal(afterAck.resolvedAt, null);
    assert.equal(await getActiveAttentionCountForUser(db, { userId: primary.userId, facilityId: facility.id, now: at }), 1);

    const routineOpened = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: routine.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    const routineNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${routine.id}` },
    });
    assert.equal(routineNotice.priority, notice.priority);
    assert.ok(routineOpened.attentionOutboxIds.length === 1);

    const locatedNotice = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: machine.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    assert.equal(locatedNotice.attentionOutboxIds.length, 1);
    const floorNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${machine.id}` },
    });
    const floorRecipients = await db.notificationRecipient.findMany({
      where: { notificationId: floorNotice.id },
      select: { userId: true },
    });
    assert.deepEqual(floorRecipients.map((row) => row.userId), [located.userId]);

    const quiet = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: undepartmented.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    assert.equal(quiet.status, "OUT_OF_SERVICE");
    assert.equal(quiet.attentionOutboxIds.length, 0);

    const plantOpened = await changeAssetStatus(session(facility.id, manager.userId, plant.id), {
      facilityId: facility.id,
      departmentId: plant.id,
      assetId: boiler.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    const boilerNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${boiler.id}` },
    });
    const boilerRecipients = await db.notificationRecipient.findMany({
      where: { notificationId: boilerNotice.id },
      select: { userId: true },
    });
    assert.deepEqual(boilerRecipients.map((row) => row.userId), [plantResponder.userId]);
    assert.equal(plantOpened.status, "OUT_OF_SERVICE");

    await assert.rejects(
      () =>
        changeAssetStatus(session(facility.id, manager.userId, evs.id), {
          facilityId: facility.id,
          departmentId: evs.id,
          assetId: machine.id,
          toStatus: "OPERATIONAL",
          reason: "MANUAL",
          client: db,
        }),
      /Department commercial access is unavailable/,
    );

    const calledOffAsset = await assetRow({ name: "Kettle", unitId: kitchen.id, departmentId: dietary.id });
    const night = parseFacilityLocalScheduledStartOnDate("20:00", day, zone)!;
    const called = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: calledOffAsset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: night,
      client: db,
    });
    const calledNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${calledOffAsset.id}` },
    });
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: calledNotice.id } }), 0);
    assert.equal(called.attentionOutboxIds.length, 1);

    const bare = await assetRow({ name: "Pan", unitId: kitchen.id, departmentId: dietary.id });
    const later = parseFacilityLocalScheduledStartOnDate("11:30", "2026-11-02", zone)!;
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: bare.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: later,
      client: db,
    });
    const bareNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${bare.id}` },
    });
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: bareNotice.id } }), 0);

    const issueAsset = await assetRow({ name: "Mixer", unitId: kitchen.id, departmentId: dietary.id });
    const outagesBeforeIssue = await db.notificationOutbox.count({
      where: { facilityId: facility.id, eventType: "asset.out_of_service" },
    });
    await reportIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      unitId: kitchen.id,
      assetId: issueAsset.id,
      summary: "Mixer is noisy",
      description: "Heard during service",
      operationalImpact: "EQUIPMENT_UNAVAILABLE",
      priority: RepairPriority.EMERGENCY,
      observedAt: at,
      client: db,
    });
    assert.equal((await db.asset.findUniqueOrThrow({ where: { id: issueAsset.id } })).status, "OPERATIONAL");
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: facility.id, eventType: "asset.out_of_service" } }),
      outagesBeforeIssue,
    );

    await db.operationalEvidenceRecord.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        assetId: issueAsset.id,
        operationalDate: serviceDate,
        occurredAt: at,
        outOfStandard: true,
        templateSnapshotJson: {},
        templateStableKey: `outage-${suffix}`,
        templateVersion: 1,
        templateName: "Equipment check",
        purposeType: "INSPECTION",
        requirementKey: `outage-${suffix}`,
        scheduleKind: "AD_HOC",
        recordedByUserId: manager.userId,
      },
    });
    assert.equal((await db.asset.findUniqueOrThrow({ where: { id: issueAsset.id } })).status, "OPERATIONAL");

    const held = await db.repair.create({
      data: {
        repairCode: `OUT-HOLD-${suffix}`,
        assetId: cooler.id,
        unitId: kitchen.id,
        title: "Cooler repair",
        description: "Warm",
        responsibleDepartmentId: dietary.id,
        status: "IN_PROGRESS",
      },
    });
    await db.repairLaborEntry.create({
      data: { repairId: held.id, employeeId: manager.employee.id, minutes: 15 },
    });
    await completeWorkOrder(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: held.id,
      workPerformed: "Checked the seal",
      assetConditionReview: "NO_CHANGE",
      client: db,
      now: at,
    });
    assert.equal((await db.asset.findUniqueOrThrow({ where: { id: cooler.id } })).status, "OUT_OF_SERVICE");
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: notice.id } })).resolvedAt, null);

    const usable = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: cooler.id,
      toStatus: "DEGRADED",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    assert.equal(usable.status, "DEGRADED");
    const resolved = await db.notification.findUniqueOrThrow({ where: { id: notice.id } });
    assert.ok(resolved.resolvedAt);
    assert.equal(resolved.expiresAt, null);
    const resolvedCenter = await loadNotificationCenter(db, {
      userId: primary.userId,
      facilityId: facility.id,
      now: at,
      timeZone: zone,
    });
    assert.equal(resolvedCenter.resolved.some((item) => item.id === notice.id), true);

    const secondAt = new Date(at.getTime() + 60_000);
    const secondOutage = await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: cooler.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: secondAt,
      client: db,
    });
    const secondNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${cooler.id}`, resolvedAt: null, expiresAt: null },
    });
    assert.notEqual(secondNotice.id, notice.id);
    assert.equal(secondOutage.attentionOutboxIds.length, 1);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: cooler.id,
      toStatus: "OPERATIONAL",
      reason: "RETURN_TO_SERVICE",
      now: new Date(secondAt.getTime() + 60_000),
      client: db,
    });
    assert.ok((await db.notification.findUniqueOrThrow({ where: { id: secondNotice.id } })).resolvedAt);
    const firstStill = await db.notification.findUniqueOrThrow({ where: { id: notice.id } });
    assert.ok(firstStill.resolvedAt);
    assert.equal(firstStill.expiresAt, null);

    const retiredAsset = await assetRow({ name: "Old cooler", unitId: kitchen.id, departmentId: dietary.id });
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: retiredAsset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    const retireNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${retiredAsset.id}` },
    });
    await retireAsset(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: retiredAsset.id,
      client: db,
      now: at,
    });
    const ended = await db.notification.findUniqueOrThrow({ where: { id: retireNotice.id } });
    assert.equal(ended.resolvedAt, null);
    assert.ok(ended.expiresAt);
    const endedCenter = await loadNotificationCenter(db, {
      userId: primary.userId,
      facilityId: facility.id,
      now: new Date(at.getTime() + 60_000),
      timeZone: zone,
    });
    assert.equal(endedCenter.ended.some((item) => item.id === retireNotice.id), true);

    const retryAsset = await assetRow({ name: "Retry cooler", unitId: kitchen.id, departmentId: dietary.id });
    let retryOutbox = "";
    await db.$transaction(async (tx) => {
      const changed = await changeAssetStatus(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        assetId: retryAsset.id,
        toStatus: "OUT_OF_SERVICE",
        reason: "MANUAL",
        now: at,
        client: tx,
      });
      retryOutbox = changed.attentionOutboxIds[0] ?? "";
    });
    assert.equal((await db.asset.findUniqueOrThrow({ where: { id: retryAsset.id } })).status, "OUT_OF_SERVICE");
    const boom = {
      $transaction: async () => {
        throw new Error("processor down");
      },
      notificationOutbox: db.notificationOutbox,
    } as unknown as PrismaClient;
    const failed = await processNotificationOutboxRow(boom, { outboxId: retryOutbox });
    assert.equal(failed.outcome, "failed");
    const retryRow = await db.notificationOutbox.findUniqueOrThrow({ where: { id: retryOutbox } });
    assert.equal(retryRow.processedAt, null);
    assert.ok(retryRow.attemptCount >= 1);
    const retried = await processNotificationOutboxRow(db, { outboxId: retryOutbox });
    assert.equal(retried.outcome, "applied");
    const duplicate = await processNotificationOutboxRow(db, { outboxId: retryOutbox });
    assert.equal(duplicate.outcome, "already_processed");
    assert.equal(
      await db.notification.count({ where: { facilityId: facility.id, actionPath: `/assets/${retryAsset.id}` } }),
      1,
    );

    const restoreByCloseout = await assetRow({ name: "Oven", unitId: kitchen.id, departmentId: dietary.id });
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: restoreByCloseout.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at,
      client: db,
    });
    const closeoutRepair = await db.repair.create({
      data: {
        repairCode: `OUT-FIX-${suffix}`,
        assetId: restoreByCloseout.id,
        unitId: kitchen.id,
        title: "Oven repair",
        description: "Cold",
        responsibleDepartmentId: dietary.id,
        status: "IN_PROGRESS",
      },
    });
    await db.repairLaborEntry.create({
      data: { repairId: closeoutRepair.id, employeeId: manager.employee.id, minutes: 20 },
    });
    await completeWorkOrder(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: closeoutRepair.id,
      workPerformed: "Returned the oven to use",
      assetConditionReview: "OPERATIONAL",
      client: db,
      now: at,
    });
    assert.equal((await db.asset.findUniqueOrThrow({ where: { id: restoreByCloseout.id } })).status, "OPERATIONAL");
    const closeoutNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${restoreByCloseout.id}` },
    });
    assert.ok(closeoutNotice.resolvedAt);
  } finally {
    process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previousContracted;
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facility: { displayName: { contains: suffix } } } } },
    });
    await db.notificationRecipient.deleteMany({
      where: { notification: { facility: { displayName: { contains: suffix } } } },
    });
    await db.notification.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.notificationOutbox.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.repairLaborEntry.deleteMany({ where: { repair: { repairCode: { contains: suffix } } } });
    await db.repairUpdate.deleteMany({ where: { repair: { repairCode: { contains: suffix } } } });
    await db.repair.deleteMany({ where: { repairCode: { contains: suffix } } });
    await db.assetIssue.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.operationalEvidenceRecord.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.scheduleEntry.deleteMany({ where: { employee: { facility: { displayName: { contains: suffix } } } } });
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
