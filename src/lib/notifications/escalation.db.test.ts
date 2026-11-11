/**
 * Acknowledgement escalation adds the Department head once.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { changeAssetStatus } from "@/lib/asset-operations/asset-service";
import { assignResponsibleEmployee, completeWorkOrder, createWorkOrderDirect } from "@/lib/asset-operations/work-order-service";
import { setWorkOrderResponseRequirement } from "@/lib/asset-operations/work-order-response";
import { evaluateWorkOrderOverdue } from "@/lib/asset-operations/work-order-time-evaluation";
import { acknowledgeNotification } from "@/lib/notifications/lifecycle";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "@/lib/notifications/queries";
import { evaluateKeyPointOverdue } from "@/lib/operational-cycles/key-point-time-evaluation";
import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
} from "@/lib/operational-time";
import { loadCoverageSlotSnapshot } from "@/lib/scheduling/coverage-episodes/observe";
import { recordCoverageEpisodeTransitions } from "@/lib/scheduling/coverage-episodes/record";
import { evaluateCoverageTimeBoundaries } from "@/lib/scheduling/coverage-episodes/time-evaluation";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import {
  ATTENTION_ESCALATION_DELAY_MS,
  ESCALATION_EXPLANATION,
  ESCALATION_POLICY_VERSION,
  applyEscalationDecision,
  evaluateAcknowledgementEscalation,
  primaryAcknowledgementExists,
} from "./escalation";
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

test("an unacknowledged operational thread adds the Department head once", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  const early = at("18:55");
  const later = at("19:05");
  const serviceDate = facilityLocalDateToServiceDate(day);
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Esc ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Esc Terrace ${suffix}`, timezone: zone },
    });
    const other = await db.facility.create({
      data: { organizationId: org.id, displayName: `Esc Other ${suffix}`, timezone: zone },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
    });
    const kitchen = await db.unit.create({
      data: { facilityId: facility.id, name: `Kitchen ${suffix}`, unitType: "KITCHEN" },
    });

    async function person(label: string, departmentId: string, role: "MANAGER" | "STAFF", linked: boolean) {
      let userId: string | null = null;
      if (linked) {
        const user = await db.user.create({
          data: {
            email: `esc-${label}-${suffix}@example.test`,
            displayName: label,
            facilityId: facility.id,
            roleId: role === "MANAGER" ? managerRole.id : staffRole.id,
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
            roleKey: role === "MANAGER" ? RoleKey.MANAGER : RoleKey.STAFF,
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
      }
      const employee = await db.employee.create({
        data: {
          facilityId: facility.id,
          userId,
          firstName: "Esc",
          lastName: label,
          roleType: role === "MANAGER" ? RoleKey.MANAGER : RoleKey.STAFF,
          primaryDepartmentId: departmentId,
        },
      });
      return { userId, employee };
    }

    const actorPerson = await person("actor", dietary.id, "MANAGER", true);
    const head = await person("head", dietary.id, "MANAGER", true);
    const alpha = await person("alpha", dietary.id, "STAFF", true);
    const beta = await person("beta", dietary.id, "STAFF", true);
    const unlinked = await person("unlinked", dietary.id, "STAFF", false);
    assert.ok(actorPerson.userId && head.userId && alpha.userId && beta.userId);
    const actor = session(facility.id, actorPerson.userId, dietary.id);

    async function asset(name: string, departmentId: string) {
      return db.asset.create({
        data: {
          assetCode: `ESC-${suffix}-${name}`,
          name,
          equipmentType: "EQUIPMENT",
          unitId: kitchen.id,
          departmentId,
          status: "OPERATIONAL",
        },
      });
    }

    async function cover(employeeId: string, departmentId: string, roleKey: string, start: string, end: string) {
      return db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId,
          employeeId,
          serviceDate,
          roleKey,
          roleLabel: "On-Call Coverage",
          status: "PLANNED",
          startsAt: at(start),
          endsAt: at(end),
        },
      });
    }

    const quiet = await asset("Quiet", dietary.id);
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
    assert.equal(quietNotice.escalationDueAt?.getTime(), quietNotice.createdAt.getTime() + ATTENTION_ESCALATION_DELAY_MS);
    assert.equal(quietNotice.escalationPolicyVersion, ESCALATION_POLICY_VERSION);
    assert.equal(quietNotice.escalatedAt, null);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: quietNotice.id } }), 0);
    const before = await evaluateAcknowledgementEscalation({
      db,
      now: new Date(quietNotice.escalationDueAt!.getTime() - 1),
      facilityIds: [facility.id],
    });
    assert.equal(before.transitions, 0);
    const missing = await evaluateAcknowledgementEscalation({
      db,
      now: quietNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal(missing.transitions, 0);
    assert.equal(missing.failures > 0, true);
    const stillQuiet = await db.notification.findUniqueOrThrow({ where: { id: quietNotice.id } });
    assert.equal(stillQuiet.escalatedAt, null);
    assert.equal(stillQuiet.escalationDueAt?.toISOString(), quietNotice.escalationDueAt?.toISOString());
    assert.equal(stillQuiet.priority, "NEEDS_ATTENTION");
    assert.equal((await db.asset.findUniqueOrThrow({ where: { id: quiet.id } })).status, "OUT_OF_SERVICE");

    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: unlinked.employee.id } });
    const unlinkedPass = await evaluateAcknowledgementEscalation({
      db,
      now: quietNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal(unlinkedPass.transitions, 0);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: quietNotice.id } })).escalatedAt, null);

    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: head.employee.id } });
    const gained = await evaluateAcknowledgementEscalation({
      db,
      now: quietNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal(gained.transitions, 1);
    const quietRows = await db.notificationRecipient.findMany({ where: { notificationId: quietNotice.id } });
    assert.equal(quietRows.length, 1);
    assert.equal(quietRows[0]?.userId, head.userId);
    assert.equal(quietRows[0]?.reason, "DEPARTMENT_MANAGER");
    assert.equal(quietRows[0]?.explanation, ESCALATION_EXPLANATION);
    assert.equal(quietRows[0]?.acknowledgedAt, null);
    assert.equal(quietRows[0]?.readAt, null);
    const escalated = await db.notification.findUniqueOrThrow({ where: { id: quietNotice.id } });
    assert.equal(escalated.escalatedAt?.toISOString(), quietNotice.escalationDueAt?.toISOString());
    assert.equal(escalated.priority, "NEEDS_ATTENTION");
    assert.equal(escalated.title, quietNotice.title);
    const again = await evaluateAcknowledgementEscalation({
      db,
      now: quietNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal(again.transitions, 0);
    assert.equal(await db.notificationDelivery.count({ where: { notificationRecipientId: quietRows[0]!.id } }), 1);
    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: beta.employee.id } });
    await evaluateAcknowledgementEscalation({ db, now: quietNotice.escalationDueAt!, facilityIds: [facility.id] });
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: quietNotice.id, userId: beta.userId } }),
      0,
    );
    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: head.employee.id } });
    const bell = await getActiveAttentionCountForUser(db, {
      userId: head.userId,
      facilityId: facility.id,
      now: quietNotice.escalationDueAt!,
    });
    assert.equal(bell, 1);
    const center = await loadNotificationCenter(db, {
      userId: head.userId,
      facilityId: facility.id,
      now: quietNotice.escalationDueAt!,
      timeZone: zone,
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") {
      assert.equal(center.needsAttention.some((item) => item.id === quietNotice.id), true);
    }

    await cover(alpha.employee.id, dietary.id, "DIETARY_ON_CALL_COVERAGE", "07:00", "19:00");
    await cover(beta.employee.id, dietary.id, "DIETARY_ON_CALL_COVERAGE", "19:00", "23:00");
    const acked = await asset("Acked", dietary.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: acked.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const ackedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${acked.id}` },
    });
    await acknowledgeNotification(db, {
      facilityId: facility.id,
      notificationId: ackedNotice.id,
      userId: alpha.userId,
      acknowledgedAt: early,
    });
    await evaluateAcknowledgementEscalation({
      db,
      now: ackedNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: ackedNotice.id, reason: "DEPARTMENT_MANAGER" } }),
      0,
    );
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: ackedNotice.id } })).escalatedAt, null);

    const turnover = await asset("Turnover", dietary.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: turnover.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const turnoverNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${turnover.id}` },
    });
    const dueBefore = turnoverNotice.escalationDueAt;
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    const dueAfter = (await db.notification.findUniqueOrThrow({ where: { id: turnoverNotice.id } })).escalationDueAt;
    assert.equal(dueAfter?.toISOString(), dueBefore?.toISOString());
    await db.notificationRecipient.updateMany({
      where: { notificationId: turnoverNotice.id, userId: alpha.userId },
      data: { readAt: early, snoozedUntil: new Date(early.getTime() + 60 * 60 * 1000) },
    });
    await db.notificationRecipient.create({
      data: {
        notificationId: turnoverNotice.id,
        userId: head.userId,
        reason: "DEPARTMENT_MANAGER",
        explanation: "Already present",
        acknowledgedAt: early,
      },
    });
    await evaluateAcknowledgementEscalation({
      db,
      now: turnoverNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    const turnoverRows = await db.notificationRecipient.findMany({ where: { notificationId: turnoverNotice.id } });
    assert.equal(primaryAcknowledgementExists(turnoverRows, "ON_CALL_RESPONDER"), false);
    assert.equal(turnoverRows.filter((row) => row.reason === "DEPARTMENT_MANAGER").length, 1);
    assert.equal(
      turnoverRows.find((row) => row.reason === "DEPARTMENT_MANAGER")?.explanation,
      "Already present",
    );
    assert.ok(turnoverRows.some((row) => row.userId === alpha.userId && row.reason === "ON_CALL_RESPONDER"));
    assert.ok(turnoverRows.some((row) => row.userId === beta.userId && row.reason === "ON_CALL_RESPONDER"));
    assert.equal(
      (await db.notification.findUniqueOrThrow({ where: { id: turnoverNotice.id } })).escalatedAt?.toISOString(),
      turnoverNotice.escalationDueAt?.toISOString(),
    );

    const remembered = await asset("Remembered", dietary.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: remembered.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const rememberedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${remembered.id}` },
    });
    await acknowledgeNotification(db, {
      facilityId: facility.id,
      notificationId: rememberedNotice.id,
      userId: alpha.userId,
      acknowledgedAt: early,
    });
    await evaluateResponsibilityReconciliation({ db, now: later, facilityIds: [facility.id] });
    await evaluateAcknowledgementEscalation({
      db,
      now: rememberedNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    const rememberedRows = await db.notificationRecipient.findMany({ where: { notificationId: rememberedNotice.id } });
    assert.equal(primaryAcknowledgementExists(rememberedRows, "ON_CALL_RESPONDER"), true);
    assert.equal(rememberedRows.some((row) => row.userId === beta.userId && row.acknowledgedAt == null), true);
    assert.equal(rememberedRows.some((row) => row.reason === "DEPARTMENT_MANAGER"), false);

    const restored = await asset("Restored", dietary.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: restored.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const restoredNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${restored.id}` },
    });
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: restored.id,
      toStatus: "OPERATIONAL",
      reason: "RETURN_TO_SERVICE",
      now: early,
      client: db,
    });
    const closed = await db.notification.findUniqueOrThrow({ where: { id: restoredNotice.id } });
    assert.ok(closed.resolvedAt);
    assert.equal(closed.escalationDueAt?.toISOString(), restoredNotice.escalationDueAt?.toISOString());
    await evaluateAcknowledgementEscalation({
      db,
      now: restoredNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: restoredNotice.id, reason: "DEPARTMENT_MANAGER" } }),
      0,
    );

    const raced = await asset("Raced", dietary.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: raced.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const racedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${raced.id}` },
    });
    await db.notification.update({ where: { id: racedNotice.id }, data: { resolvedAt: early } });
    assert.equal(
      await applyEscalationDecision(db, racedNotice, racedNotice.escalationDueAt!),
      "closed",
    );
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: racedNotice.id } })).escalatedAt, null);

    const ackRace = await asset("Ack race", dietary.id);
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: ackRace.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: early,
      client: db,
    });
    const ackRaceNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${ackRace.id}` },
    });
    await acknowledgeNotification(db, {
      facilityId: facility.id,
      notificationId: ackRaceNotice.id,
      userId: alpha.userId,
      acknowledgedAt: early,
    });
    assert.equal(
      await applyEscalationDecision(db, ackRaceNotice, ackRaceNotice.escalationDueAt!),
      "acknowledged",
    );

    await cover(head.employee.id, dietary.id, "DIETARY_ON_CALL_COVERAGE", "23:00", "23:30");
    const sameAsset = await asset("Same person", dietary.id);
    const sameAt = at("23:05");
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: sameAsset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: sameAt,
      client: db,
    });
    const sameNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${sameAsset.id}` },
    });
    await evaluateAcknowledgementEscalation({
      db,
      now: sameNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    const sameRows = await db.notificationRecipient.findMany({ where: { notificationId: sameNotice.id } });
    assert.deepEqual(
      sameRows.map((row) => row.reason).sort(),
      ["DEPARTMENT_MANAGER", "ON_CALL_RESPONDER"],
    );
    assert.equal(sameRows.every((row) => row.userId === head.userId), true);
    assert.equal(await db.notification.count({ where: { actionPath: `/assets/${sameAsset.id}` } }), 1);

    const otherDietary = await db.department.create({
      data: { facilityId: other.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
    });
    const otherHead = await db.user.create({
      data: {
        email: `esc-other-${suffix}@example.test`,
        displayName: "Other head",
        facilityId: other.id,
        roleId: managerRole.id,
        passwordHash: "hash",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    userIds.push(otherHead.id);
    const foreign = await db.notification.create({
      data: {
        facilityId: other.id,
        departmentId: otherDietary.id,
        kind: "OPERATIONAL",
        category: "asset",
        priority: "NEEDS_ATTENTION",
        sourceType: "asset_status",
        sourceId: `foreign-${suffix}`,
        title: "Foreign outage",
        body: "Another facility.",
        dedupeKey: `foreign-${suffix}`,
        requiresAcknowledgement: true,
        occurredAt: early,
        escalationDueAt: early,
        escalationPolicyVersion: ESCALATION_POLICY_VERSION,
        policyVersion: "notifications-n1b-v1",
        metadata: { protected: false, responsibility: { primaryReason: "ON_CALL_RESPONDER" } },
      },
    });
    await evaluateAcknowledgementEscalation({
      db,
      now: quietNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: foreign.id } })).escalatedAt, null);

    const legacy = await db.notification.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        kind: "OPERATIONAL",
        category: "asset",
        priority: "NEEDS_ATTENTION",
        sourceType: "asset_status",
        sourceId: `legacy-${suffix}`,
        title: "Legacy outage",
        body: "No responsibility snapshot.",
        dedupeKey: `legacy-${suffix}`,
        requiresAcknowledgement: true,
        occurredAt: early,
        escalationDueAt: early,
        policyVersion: "notifications-n1b-v1",
        metadata: { protected: false },
      },
    });
    const legacyPass = await evaluateAcknowledgementEscalation({
      db,
      now: quietNotice.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal(legacyPass.failures > 0, true);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: legacy.id } }), 0);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: legacy.id } })).escalatedAt, null);
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
    await db.operationalAssignment.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.assetStatusHistory.deleteMany({ where: { asset: { unit: { facilityId: { in: facilityIds } } } } });
    await db.asset.deleteMany({ where: { unit: { facilityId: { in: facilityIds } } } });
    await db.unit.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.employee.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { userId: { in: userIds } } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});

test("coverage, key points, and work orders escalate without changing severity", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  const serviceDate = facilityLocalDateToServiceDate(day);
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Esc two ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Esc Two ${suffix}`, timezone: zone },
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
        stableKey: `esc-${suffix}`,
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

    async function person(label: string, role: "MANAGER" | "STAFF") {
      const user = await db.user.create({
        data: {
          email: `esc2-${label}-${suffix}@example.test`,
          displayName: label,
          facilityId: facility.id,
          roleId: role === "MANAGER" ? managerRole.id : staffRole.id,
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
          roleKey: role === "MANAGER" ? RoleKey.MANAGER : RoleKey.STAFF,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      const employee = await db.employee.create({
        data: {
          facilityId: facility.id,
          userId: user.id,
          firstName: "Esc",
          lastName: label,
          roleType: role === "MANAGER" ? RoleKey.MANAGER : RoleKey.STAFF,
          primaryDepartmentId: dietary.id,
        },
      });
      return { userId: user.id, employee };
    }

    const actorPerson = await person("actor", "MANAGER");
    const head = await person("head", "MANAGER");
    const supervisor = await person("supervisor", "STAFF");
    const server = await person("server", "STAFF");
    const assignee = await person("assignee", "STAFF");
    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: head.employee.id } });
    const actor = session(facility.id, actorPerson.userId, dietary.id);
    const scope = { facilityId: facility.id, departmentId: dietary.id, serviceDateKey: day };

    async function duty(employeeId: string, roleKey: string, roleLabel: string) {
      const row = await db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          planId: plan.id,
          employeeId,
          serviceDate,
          roleKey,
          roleLabel,
          status: "PLANNED",
          unitId: unit.id,
          startsAt: at("00:00"),
          endsAt: at("23:00"),
        },
      });
      await db.operationalAssignmentLocation.create({
        data: { assignmentId: row.id, unitSpaceId: space.id, unitId: unit.id, labelSnapshot: space.name },
      });
      return row;
    }

    await duty(supervisor.employee.id, "DIETARY_SUPERVISOR_ROUNDING", "Supervisor rounding");
    const serverAssignment = await duty(server.employee.id, "SERVER", "Server");
    const item = await db.operationalAssignmentTemplateItem.findFirstOrThrow({ where: { templateId: template.id } });
    const covered = await loadCoverageSlotSnapshot(db, scope);
    await db.operationalAssignmentTemplateItem.update({ where: { id: item.id }, data: { requiredCount: 2 } });
    const riskIds = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: covered,
        occurredAt: at("08:00"),
        sourceType: "assignment_event",
        sourceId: `${suffix}-risk`,
      }),
    );
    for (const outboxId of riskIds) await processNotificationOutboxRow(db, { outboxId });
    const atRisk = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceType: "coverage_responsibility", resolvedAt: null },
    });
    assert.equal(atRisk.priority, "NEEDS_ATTENTION");
    assert.equal(atRisk.requiresAcknowledgement, false);
    assert.equal(atRisk.escalationDueAt, null);
    await evaluateAcknowledgementEscalation({
      db,
      now: new Date(atRisk.createdAt.getTime() + 24 * 60 * 60 * 1000),
      facilityIds: [facility.id],
    });
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: atRisk.id, reason: "DEPARTMENT_MANAGER" } }),
      0,
    );

    const openedAt = new Date(atRisk.createdAt.getTime() - 2 * 60 * 60 * 1000);
    await db.notification.update({ where: { id: atRisk.id }, data: { createdAt: openedAt } });
    const whileAtRisk = await loadCoverageSlotSnapshot(db, scope);
    await db.operationalAssignment.update({ where: { id: serverAssignment.id }, data: { status: "CANCELLED" } });
    const uncoveredIds = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: whileAtRisk,
        occurredAt: at("08:00"),
        sourceType: "assignment_event",
        sourceId: `${suffix}-uncovered`,
      }),
    );
    for (const outboxId of uncoveredIds) await processNotificationOutboxRow(db, { outboxId });
    const critical = await db.notification.findUniqueOrThrow({ where: { id: atRisk.id } });
    assert.equal(critical.priority, "CRITICAL");
    assert.equal(critical.requiresAcknowledgement, true);
    assert.equal(critical.escalationDueAt?.getTime(), openedAt.getTime() + ATTENTION_ESCALATION_DELAY_MS);
    assert.equal(critical.escalationPolicyVersion, ESCALATION_POLICY_VERSION);
    await evaluateAcknowledgementEscalation({
      db,
      now: critical.escalationDueAt!,
      facilityIds: [facility.id],
    });
    const criticalAfter = await db.notification.findUniqueOrThrow({ where: { id: critical.id } });
    assert.equal(criticalAfter.priority, "CRITICAL");
    assert.equal((criticalAfter.metadata as { protected?: boolean }).protected, true);
    assert.ok(criticalAfter.escalatedAt);
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: critical.id, userId: head.userId, reason: "DEPARTMENT_MANAGER" } }),
      1,
    );

    await db.operationalAssignmentTemplateItem.update({ where: { id: item.id }, data: { requiredCount: 1 } });
    const whileUncovered = await loadCoverageSlotSnapshot(db, scope);
    await db.operationalAssignment.update({ where: { id: serverAssignment.id }, data: { status: "PLANNED" } });
    const restoredIds = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: whileUncovered,
        occurredAt: at("08:00"),
        sourceType: "assignment_event",
        sourceId: `${suffix}-restored`,
      }),
    );
    for (const outboxId of restoredIds) await processNotificationOutboxRow(db, { outboxId });

    async function dropAt(clock: string, source: string) {
      const beforeDrop = await loadCoverageSlotSnapshot(db, scope);
      await db.operationalAssignment.update({ where: { id: serverAssignment.id }, data: { status: "CANCELLED" } });
      const ids = await db.$transaction((tx) =>
        recordCoverageEpisodeTransitions(tx, {
          ...scope,
          before: beforeDrop,
          occurredAt: at(clock),
          sourceType: "assignment_event",
          sourceId: source,
        }),
      );
      for (const outboxId of ids) await processNotificationOutboxRow(db, { outboxId });
      return db.notification.findFirstOrThrow({
        where: { facilityId: facility.id, sourceType: "coverage_responsibility", resolvedAt: null, escalatedAt: null },
      });
    }

    async function restore(source: string) {
      const beforeRestore = await loadCoverageSlotSnapshot(db, scope);
      await db.operationalAssignment.update({ where: { id: serverAssignment.id }, data: { status: "PLANNED" } });
      const ids = await db.$transaction((tx) =>
        recordCoverageEpisodeTransitions(tx, {
          ...scope,
          before: beforeRestore,
          occurredAt: at("08:00"),
          sourceType: "assignment_event",
          sourceId: source,
        }),
      );
      for (const outboxId of ids) await processNotificationOutboxRow(db, { outboxId });
    }

    const early = await dropAt("05:30", `${suffix}-early`);
    assert.equal(early.priority, "NEEDS_ATTENTION");
    assert.equal((early.metadata as { protected?: boolean }).protected, false);
    const earlyDue = early.escalationDueAt;
    const earlyVersion = early.escalationPolicyVersion;
    const raised = await evaluateCoverageTimeBoundaries({ db, now: at("06:40"), facilityIds: [facility.id] });
    for (const outboxId of raised.outboxIds) await processNotificationOutboxRow(db, { outboxId });
    const risen = await db.notification.findUniqueOrThrow({ where: { id: early.id } });
    assert.equal(risen.priority, "URGENT");
    assert.equal(risen.escalationDueAt?.toISOString(), earlyDue?.toISOString());
    assert.equal(risen.escalationPolicyVersion, earlyVersion);
    await evaluateAcknowledgementEscalation({ db, now: earlyDue!, facilityIds: [facility.id] });
    const risenAfter = await db.notification.findUniqueOrThrow({ where: { id: early.id } });
    assert.equal(risenAfter.priority, "URGENT");
    assert.equal((risenAfter.metadata as { protected?: boolean }).protected, true);
    await restore(`${suffix}-early-back`);

    const imminent = await dropAt("06:40", `${suffix}-imminent`);
    assert.equal(imminent.priority, "URGENT");
    assert.equal((imminent.metadata as { protected?: boolean }).protected, true);
    await evaluateAcknowledgementEscalation({ db, now: imminent.escalationDueAt!, facilityIds: [facility.id] });
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: imminent.id } })).priority, "URGENT");
    await restore(`${suffix}-imminent-back`);

    const during = await dropAt("08:00", `${suffix}-during`);
    assert.equal(during.priority, "CRITICAL");
    await evaluateAcknowledgementEscalation({ db, now: during.escalationDueAt!, facilityIds: [facility.id] });
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: during.id } })).priority, "CRITICAL");

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
    await evaluateAcknowledgementEscalation({ db, now: keyNotice.escalationDueAt!, facilityIds: [facility.id] });
    const keyAfter = await db.notification.findUniqueOrThrow({ where: { id: keyNotice.id } });
    assert.equal(keyAfter.priority, "URGENT");
    assert.equal((keyAfter.metadata as { protected?: boolean }).protected, true);
    assert.ok(keyAfter.escalatedAt);
    assert.equal(await db.operationalCycleKeyPointActual.count({ where: { facilityId: facility.id } }), 0);

    const cleared = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: unit.id,
      spaceId: space.id,
      title: "Clear me",
      description: "Return to standard.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at("08:00"),
    });
    const clearedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${cleared.id}`, sourceType: "work_order_response" },
    });
    await setWorkOrderResponseRequirement(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: cleared.id,
      responseRequirement: "STANDARD",
      client: db,
      now: at("08:05"),
    });
    assert.ok((await db.notification.findUniqueOrThrow({ where: { id: clearedNotice.id } })).expiresAt);
    await evaluateAcknowledgementEscalation({ db, now: clearedNotice.escalationDueAt!, facilityIds: [facility.id] });
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: clearedNotice.id, reason: "DEPARTMENT_MANAGER" } }),
      0,
    );

    const finished = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: unit.id,
      title: "Finish me",
      description: "Complete before the deadline.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at("08:00"),
    });
    const finishedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${finished.id}`, sourceType: "work_order_response" },
    });
    await db.repairLaborEntry.create({
      data: { repairId: finished.id, employeeId: head.employee.id, minutes: 15 },
    });
    await completeWorkOrder(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: finished.id,
      workPerformed: "Restored service",
      client: db,
      now: at("08:05"),
    });
    assert.ok((await db.notification.findUniqueOrThrow({ where: { id: finishedNotice.id } })).resolvedAt);
    await evaluateAcknowledgementEscalation({ db, now: finishedNotice.escalationDueAt!, facilityIds: [facility.id] });
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: finishedNotice.id, reason: "DEPARTMENT_MANAGER" } }),
      0,
    );

    const immediate = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: unit.id,
      title: "Stay immediate",
      description: "Still waiting.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at("08:00"),
    });
    const immediateNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${immediate.id}`, sourceType: "work_order_response" },
    });
    await evaluateAcknowledgementEscalation({ db, now: immediateNotice.escalationDueAt!, facilityIds: [facility.id] });
    const immediateAfter = await db.notification.findUniqueOrThrow({ where: { id: immediateNotice.id } });
    assert.equal(immediateAfter.priority, "URGENT");
    assert.ok(immediateAfter.escalatedAt);
    const immediateRepair = await db.repair.findUniqueOrThrow({ where: { id: immediate.id } });
    assert.equal(immediateRepair.priority, "LOW");
    assert.equal(immediateRepair.responseRequirement, "IMMEDIATE");
    assert.equal(immediateRepair.assignedEmployeeId, null);

    const waiting = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: unit.id,
      title: "Past due",
      description: "The deadline passed.",
      priority: "LOW",
      assignedEmployeeId: assignee.employee.id,
      dueAt: at("08:00"),
      client: db,
      now: at("07:00"),
    });
    const overdueRun = await evaluateWorkOrderOverdue({ db, now: at("09:00"), facilityIds: [facility.id] });
    for (const outboxId of overdueRun.outboxIds) await processNotificationOutboxRow(db, { outboxId });
    const overdue = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceType: "work_order_overdue", resolvedAt: null },
    });
    await evaluateAcknowledgementEscalation({ db, now: overdue.escalationDueAt!, facilityIds: [facility.id] });
    assert.equal((await db.repair.findUniqueOrThrow({ where: { id: waiting.id } })).assignedEmployeeId, assignee.employee.id);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: overdue.id } })).priority, "NEEDS_ATTENTION");
    await assignResponsibleEmployee(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: waiting.id,
      assignedEmployeeId: server.employee.id,
      client: db,
    });
    const overdueAfter = await db.notificationRecipient.findMany({ where: { notificationId: overdue.id } });
    assert.equal(overdueAfter.some((row) => row.userId === head.userId && row.reason === "DEPARTMENT_MANAGER"), true);
    assert.equal(overdueAfter.some((row) => row.userId === server.userId && row.reason === "WORK_ORDER_ASSIGNEE"), true);
    assert.equal(overdueAfter.some((row) => row.userId === assignee.userId && row.reason === "WORK_ORDER_ASSIGNEE"), false);

    for (const sourceType of ["evidence_record", "issue", "assignment_change", "work_order_assignment"] as const) {
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
          body: "Update.",
          dedupeKey: `${sourceType}-${suffix}`,
          requiresAcknowledgement: false,
          occurredAt: at("08:00"),
          escalationDueAt: at("08:00"),
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" } },
          recipients: {
            create: { userId: supervisor.userId, reason: "ON_DUTY_SUPERVISOR", explanation: "Historical" },
          },
        },
      });
    }
    await evaluateAcknowledgementEscalation({
      db,
      now: new Date(at("08:00").getTime() + ATTENTION_ESCALATION_DELAY_MS),
      facilityIds: [facility.id],
    });
    for (const sourceType of ["evidence_record", "issue", "assignment_change", "work_order_assignment"]) {
      assert.equal(
        await db.notificationRecipient.count({
          where: { notification: { facilityId: facility.id, dedupeKey: `${sourceType}-${suffix}` } },
        }),
        1,
      );
    }
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
    await db.workOrderResponseHistory.deleteMany({ where: { repair: { unit: { facilityId: { in: facilityIds } } } } });
    await db.repairLaborEntry.deleteMany({ where: { repair: { unit: { facilityId: { in: facilityIds } } } } });
    await db.repairUpdate.deleteMany({ where: { repair: { unit: { facilityId: { in: facilityIds } } } } });
    await db.repair.deleteMany({ where: { unit: { facilityId: { in: facilityIds } } } });
    await db.operationalCycleKeyPointActual.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.operationalCycleKeyTimeDayExpectation.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.departmentOperationalCycleKeyTimeGroup.deleteMany({ where: { cycle: { facilityId: { in: facilityIds } } } });
    await db.operationalAssignmentLocation.deleteMany({ where: { assignment: { facilityId: { in: facilityIds } } } });
    await db.operationalAssignment.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.operationalAssignmentPlan.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.operationalAssignmentTemplate.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.departmentOperationalCycle.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.unitSpace.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.unit.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.employee.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { userId: { in: userIds } } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});
