/**
 * Snooze, quiet, and digest change interruption only.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { changeAssetStatus } from "@/lib/asset-operations/asset-service";
import { createWorkOrderDirect } from "@/lib/asset-operations/work-order-service";
import { evaluateWorkOrderOverdue } from "@/lib/asset-operations/work-order-time-evaluation";
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

import { evaluateDeliveryEligibility } from "./delivery-eligibility";
import { evaluateAcknowledgementEscalation } from "./escalation";
import { loadNotificationPreference, saveNotificationPreference } from "./notification-preference";
import { processNotificationOutboxRow } from "./processing";
import { evaluateResponsibilityReconciliation } from "./responsibility-reconciliation";
import { ATTENTION_SNOOZE_MAX_MS, clearNotificationSnooze, NotificationSnoozeError, setNotificationSnooze } from "./snooze";

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

test("snooze quiet and digest do not change attention", { skip }, async () => {
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
    const org = await db.organization.create({ data: { name: `Pref ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Pref Terrace ${suffix}`, timezone: zone },
    });
    const other = await db.facility.create({
      data: { organizationId: org.id, displayName: `Pref Chicago ${suffix}`, timezone: "America/Chicago" },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
    });
    const kitchen = await db.unit.create({
      data: { facilityId: facility.id, name: `Kitchen ${suffix}`, unitType: "KITCHEN" },
    });
    const space = await db.unitSpace.create({
      data: { facilityId: facility.id, unitId: kitchen.id, name: `Dining ${suffix}`, spaceType: "SERVICE_AREA" },
    });
    await db.unitSpaceResponsibility.create({ data: { spaceId: space.id, departmentId: dietary.id } });

    async function person(label: string, role: "MANAGER" | "STAFF", home = facility.id) {
      const user = await db.user.create({
        data: {
          email: `pref-${label}-${suffix}@example.test`,
          displayName: label,
          facilityId: home,
          roleId: role === "MANAGER" ? managerRole.id : staffRole.id,
          passwordHash: "hash",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      userIds.push(user.id);
      for (const facilityId of [facility.id, other.id]) {
        const access = await db.userFacilityAccess.create({
          data: { userId: user.id, facilityId, isActive: true },
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
          userId: user.id,
          firstName: "Pref",
          lastName: label,
          roleType: role === "MANAGER" ? RoleKey.MANAGER : RoleKey.STAFF,
          primaryDepartmentId: dietary.id,
        },
      });
      return { userId: user.id, employee };
    }

    const actorPerson = await person("actor", "MANAGER");
    const head = await person("head", "MANAGER");
    const alpha = await person("alpha", "STAFF");
    const beta = await person("beta", "STAFF");
    const assignee = await person("assignee", "STAFF");
    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: head.employee.id } });
    const actor = session(facility.id, actorPerson.userId, dietary.id);

    async function duty(employeeId: string, roleKey: string, roleLabel: string, start: string, end: string, located: boolean) {
      const row = await db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          employeeId,
          serviceDate,
          roleKey,
          roleLabel,
          status: "PLANNED",
          unitId: kitchen.id,
          startsAt: at(start),
          endsAt: at(end),
        },
      });
      if (located) {
        await db.operationalAssignmentLocation.create({
          data: { assignmentId: row.id, unitSpaceId: space.id, unitId: kitchen.id, labelSnapshot: space.name },
        });
      }
      return row;
    }

    await duty(alpha.employee.id, "DIETARY_ON_CALL_COVERAGE", "On-Call Coverage", "07:00", "19:00", false);
    const asset = await db.asset.create({
      data: {
        assetCode: `PREF-${suffix}`,
        name: "Kettle",
        equipmentType: "EQUIPMENT",
        unitId: kitchen.id,
        departmentId: dietary.id,
        status: "OPERATIONAL",
      },
    });
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: asset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      now: at("18:55"),
      client: db,
    });
    const outage = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/assets/${asset.id}` },
    });
    const until = new Date(at("18:55").getTime() + 60 * 60 * 1000);
    const snoozed = await setNotificationSnooze(db, {
      facilityId: facility.id,
      notificationId: outage.id,
      userId: alpha.userId,
      snoozedUntil: until,
      now: at("18:55"),
    });
    assert.equal(snoozed.ok, true);
    const alphaRow = await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: outage.id, userId: alpha.userId, reason: "ON_CALL_RESPONDER" },
    });
    assert.equal(alphaRow.snoozedUntil?.toISOString(), until.toISOString());
    assert.equal(alphaRow.readAt, null);
    assert.equal(alphaRow.acknowledgedAt, null);
    assert.equal(alphaRow.dismissedAt, null);
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: outage.id } })).escalationDueAt?.toISOString(), outage.escalationDueAt?.toISOString());
    await assert.rejects(
      () => setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: outage.id,
        userId: beta.userId,
        snoozedUntil: until,
        now: at("18:55"),
      }),
      (error: unknown) => error instanceof NotificationSnoozeError && error.code === "NOT_RECIPIENT",
    );
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: outage.id,
        userId: alpha.userId,
        snoozedUntil: new Date(at("18:55").getTime() + ATTENTION_SNOOZE_MAX_MS + 60_000),
        now: at("18:55"),
      })).ok,
      false,
    );
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: outage.id,
        userId: alpha.userId,
        snoozedUntil: at("18:55"),
        now: at("18:55"),
      })).ok,
      false,
    );
    await clearNotificationSnooze(db, { facilityId: facility.id, notificationId: outage.id, userId: alpha.userId });
    assert.equal(
      (await db.notificationRecipient.findFirstOrThrow({ where: { id: alphaRow.id } })).snoozedUntil,
      null,
    );
    await setNotificationSnooze(db, {
      facilityId: facility.id,
      notificationId: outage.id,
      userId: alpha.userId,
      snoozedUntil: until,
      now: at("18:55"),
    });
    assert.equal(await getActiveAttentionCountForUser(db, { userId: alpha.userId, facilityId: facility.id, now: at("18:55") }), 1);
    const center = await loadNotificationCenter(db, {
      userId: alpha.userId,
      facilityId: facility.id,
      now: at("18:55"),
      timeZone: zone,
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") assert.equal(center.needsAttention.some((item) => item.id === outage.id), true);
    const escalated = await evaluateAcknowledgementEscalation({
      db,
      now: outage.escalationDueAt!,
      facilityIds: [facility.id],
    });
    assert.equal(escalated.transitions, 1);
    const headRow = await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: outage.id, userId: head.userId, reason: "DEPARTMENT_MANAGER" },
    });
    assert.equal(headRow.snoozedUntil, null);
    assert.equal(
      (await db.notificationRecipient.findFirstOrThrow({ where: { id: alphaRow.id } })).snoozedUntil?.toISOString(),
      until.toISOString(),
    );
    const managerSnooze = await setNotificationSnooze(db, {
      facilityId: facility.id,
      notificationId: outage.id,
      userId: head.userId,
      snoozedUntil: new Date(outage.escalationDueAt!.getTime() + 60 * 60 * 1000),
      now: outage.escalationDueAt!,
    });
    assert.equal(managerSnooze.ok, true);
    assert.equal(
      (await db.notificationRecipient.findFirstOrThrow({ where: { id: alphaRow.id } })).snoozedUntil?.toISOString(),
      until.toISOString(),
    );

    await duty(beta.employee.id, "DIETARY_ON_CALL_COVERAGE", "On-Call Coverage", "19:00", "23:00", false);
    const immediate = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
      title: "Immediate",
      description: "Still waiting.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at("18:55"),
    });
    const intervention = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${immediate.id}`, sourceType: "work_order_response" },
    });
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: intervention.id,
        userId: alpha.userId,
        snoozedUntil: until,
        now: at("18:55"),
      })).ok,
      false,
    );
    const former = await setNotificationSnooze(db, {
      facilityId: facility.id,
      notificationId: intervention.id,
      userId: alpha.userId,
      snoozedUntil: new Date(at("19:05").getTime() + 60 * 60 * 1000),
      now: at("19:05"),
    });
    assert.equal(former.ok, true);
    await evaluateResponsibilityReconciliation({ db, now: at("19:05"), facilityIds: [facility.id] });
    const betaRow = await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: intervention.id, userId: beta.userId, reason: "ON_CALL_RESPONDER" },
    });
    assert.equal(betaRow.snoozedUntil, null);
    assert.ok((await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: intervention.id, userId: alpha.userId, reason: "ON_CALL_RESPONDER" },
    })).snoozedUntil);
    await evaluateAcknowledgementEscalation({ db, now: intervention.escalationDueAt!, facilityIds: [facility.id] });
    const interventionHead = await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: intervention.id, userId: head.userId, reason: "DEPARTMENT_MANAGER" },
    });
    assert.equal(interventionHead.snoozedUntil, null);
    const stamped = (await db.notification.findUniqueOrThrow({ where: { id: intervention.id } })).escalatedAt;
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: intervention.id,
        userId: head.userId,
        snoozedUntil: new Date(intervention.escalationDueAt!.getTime() + 30 * 60 * 1000),
        now: intervention.escalationDueAt!,
      })).ok,
      true,
    );
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: intervention.id } })).escalatedAt?.toISOString(), stamped?.toISOString());
    assert.equal((await db.repair.findUniqueOrThrow({ where: { id: immediate.id } })).responseRequirement, "IMMEDIATE");

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
        stableKey: `pref-${suffix}`,
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
      data: { facilityId: facility.id, departmentId: dietary.id, serviceDate, status: "CONFIRMED" },
    });
    const server = await duty(assignee.employee.id, "SERVER", "Server", "00:00", "23:00", true);
    await db.operationalAssignment.update({ where: { id: server.id }, data: { planId: plan.id } });
    const supervisor = await duty(alpha.employee.id, "DIETARY_SUPERVISOR_ROUNDING", "Supervisor rounding", "00:00", "23:00", true);
    await db.operationalAssignment.update({ where: { id: supervisor.id }, data: { planId: plan.id } });
    const scope = { facilityId: facility.id, departmentId: dietary.id, serviceDateKey: day };
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
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: atRisk.id,
        userId: alpha.userId,
        snoozedUntil: new Date(at("08:00").getTime() + 60 * 60 * 1000),
        now: at("08:00"),
      })).ok,
      true,
    );
    await evaluateAcknowledgementEscalation({
      db,
      now: new Date(atRisk.createdAt.getTime() + 24 * 60 * 60 * 1000),
      facilityIds: [facility.id],
    });
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: atRisk.id, reason: "DEPARTMENT_MANAGER" } }),
      0,
    );
    const whileAtRisk = await loadCoverageSlotSnapshot(db, scope);
    await db.operationalAssignment.update({ where: { id: server.id }, data: { status: "CANCELLED" } });
    const earlyIds = await db.$transaction((tx) =>
      recordCoverageEpisodeTransitions(tx, {
        ...scope,
        before: whileAtRisk,
        occurredAt: at("05:30"),
        sourceType: "assignment_event",
        sourceId: `${suffix}-early`,
      }),
    );
    for (const outboxId of earlyIds) await processNotificationOutboxRow(db, { outboxId });
    const early = await db.notification.findUniqueOrThrow({ where: { id: atRisk.id } });
    assert.equal(early.priority, "NEEDS_ATTENTION");
    const earlySnooze = (await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: early.id, userId: alpha.userId, reason: "ON_DUTY_SUPERVISOR" },
    })).snoozedUntil;
    assert.ok(earlySnooze);
    const held = await evaluateCoverageTimeBoundaries({ db, now: at("05:45"), facilityIds: [facility.id] });
    for (const outboxId of held.outboxIds) await processNotificationOutboxRow(db, { outboxId });
    assert.equal(
      (await db.notificationRecipient.findFirstOrThrow({
        where: { notificationId: early.id, userId: alpha.userId, reason: "ON_DUTY_SUPERVISOR" },
      })).snoozedUntil?.toISOString(),
      earlySnooze?.toISOString(),
    );
    const risen = await evaluateCoverageTimeBoundaries({ db, now: at("06:40"), facilityIds: [facility.id] });
    for (const outboxId of risen.outboxIds) await processNotificationOutboxRow(db, { outboxId });
    const urgent = await db.notification.findUniqueOrThrow({ where: { id: early.id } });
    assert.equal(urgent.priority, "URGENT");
    assert.equal(
      (await db.notificationRecipient.findFirstOrThrow({
        where: { notificationId: early.id, userId: alpha.userId, reason: "ON_DUTY_SUPERVISOR" },
      })).snoozedUntil,
      null,
    );
    const urgentSnooze = await setNotificationSnooze(db, {
      facilityId: facility.id,
      notificationId: early.id,
      userId: alpha.userId,
      snoozedUntil: new Date(at("06:40").getTime() + 30 * 60 * 1000),
      now: at("06:40"),
    });
    assert.equal(urgentSnooze.ok, false);
    if (!urgentSnooze.ok) assert.equal(urgentSnooze.decision, "protected_not_snoozable");
    await db.notificationRecipient.updateMany({
      where: { notificationId: early.id },
      data: { snoozedUntil: new Date(at("06:40").getTime() + 30 * 60 * 1000) },
    });
    const criticalRun = await evaluateCoverageTimeBoundaries({ db, now: at("08:00"), facilityIds: [facility.id] });
    for (const outboxId of criticalRun.outboxIds) await processNotificationOutboxRow(db, { outboxId });
    const critical = await db.notification.findUniqueOrThrow({ where: { id: early.id } });
    assert.equal(critical.priority, "CRITICAL");
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: critical.id, snoozedUntil: { not: null } } }), 0);
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: critical.id,
        userId: alpha.userId,
        snoozedUntil: new Date(at("08:00").getTime() + 30 * 60 * 1000),
        now: at("08:00"),
      })).ok,
      false,
    );

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
    const keySnooze = await setNotificationSnooze(db, {
      facilityId: facility.id,
      notificationId: keyNotice.id,
      userId: alpha.userId,
      snoozedUntil: new Date(at("12:30").getTime() + 30 * 60 * 1000),
      now: at("12:30"),
    });
    assert.equal(keySnooze.ok, false);
    if (!keySnooze.ok) assert.equal(keySnooze.decision, "protected_not_snoozable");

    const waiting = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
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
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: overdue.id,
        userId: assignee.userId,
        snoozedUntil: new Date(at("09:00").getTime() + 60 * 60 * 1000),
        now: at("09:00"),
      })).ok,
      true,
    );
    assert.equal((await db.repair.findUniqueOrThrow({ where: { id: waiting.id } })).dueAt?.toISOString(), at("08:00").toISOString());
    await evaluateAcknowledgementEscalation({ db, now: overdue.escalationDueAt!, facilityIds: [facility.id] });
    assert.equal(
      await db.notificationRecipient.count({ where: { notificationId: overdue.id, userId: head.userId, reason: "DEPARTMENT_MANAGER" } }),
      1,
    );

    const update = await db.notification.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        kind: "OPERATIONAL",
        category: "update",
        priority: "UPDATE",
        sourceType: "evidence_record",
        sourceId: `evidence-${suffix}`,
        title: "Record out of standard",
        body: "Update.",
        dedupeKey: `evidence-${suffix}`,
        requiresAcknowledgement: false,
        occurredAt: at("08:00"),
        policyVersion: "notifications-n1b-v1",
        metadata: { protected: false, responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" } },
        recipients: { create: { userId: alpha.userId, reason: "ON_DUTY_SUPERVISOR", explanation: "Update" } },
      },
    });
    const issue = await db.notification.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        kind: "OPERATIONAL",
        category: "update",
        priority: "UPDATE",
        sourceType: "issue",
        sourceId: `issue-${suffix}`,
        title: "Issue opened",
        body: "Update.",
        dedupeKey: `issue-${suffix}`,
        requiresAcknowledgement: false,
        occurredAt: at("08:00"),
        policyVersion: "notifications-n1b-v1",
        metadata: { protected: false, responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" } },
        recipients: { create: { userId: alpha.userId, reason: "ON_DUTY_SUPERVISOR", explanation: "Update" } },
      },
    });
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: issue.id,
        userId: alpha.userId,
        snoozedUntil: until,
        now: at("08:00"),
      })).ok,
      false,
    );
    assert.equal(
      (await setNotificationSnooze(db, {
        facilityId: facility.id,
        notificationId: update.id,
        userId: alpha.userId,
        snoozedUntil: until,
        now: at("08:00"),
      })).ok,
      false,
    );
    await saveNotificationPreference(db, {
      userId: alpha.userId,
      facilityId: facility.id,
      quietEnabled: true,
      quietStartMinute: 22 * 60,
      quietEndMinute: 7 * 60,
      updateDigestEnabled: true,
    });
    const stored = await loadNotificationPreference(db, { userId: alpha.userId, facilityId: facility.id });
    const elsewhere = await loadNotificationPreference(db, { userId: alpha.userId, facilityId: other.id });
    assert.equal(stored.source, "stored");
    assert.equal(elsewhere.source, "default");
    assert.equal(elsewhere.updateDigestEnabled, false);
    const updateAttention = {
      kind: "OPERATIONAL" as const,
      priority: "UPDATE" as const,
      requiresAcknowledgement: false,
      protected: false,
      recipientReasons: ["ON_DUTY_SUPERVISOR" as const],
      resolvedAt: null,
      expiresAt: null,
    };
    assert.equal(
      evaluateDeliveryEligibility({
        notification: updateAttention,
        recipient: { reason: "ON_DUTY_SUPERVISOR", snoozedUntil: null },
        preference: stored,
        now: new Date("2026-10-29T02:30:00.000Z"),
        timeZone: zone,
        mode: "INTERRUPTIVE",
        currentlyHoldsOperationalResponsibility: false,
      }),
      "quiet",
    );
    assert.equal(
      evaluateDeliveryEligibility({
        notification: updateAttention,
        recipient: { reason: "ON_DUTY_SUPERVISOR", snoozedUntil: null },
        preference: stored,
        now: new Date("2026-10-29T02:30:00.000Z"),
        timeZone: zone,
        mode: "DIGEST",
      }),
      "eligible",
    );
    const updateCenter = await loadNotificationCenter(db, {
      userId: alpha.userId,
      facilityId: facility.id,
      now: at("15:00"),
      timeZone: zone,
    });
    assert.equal(updateCenter.status, "ready");
    if (updateCenter.status === "ready") assert.equal(updateCenter.updates.some((item) => item.id === update.id), true);
  } finally {
    const facilities = await db.facility.findMany({
      where: { displayName: { contains: suffix } },
      select: { id: true },
    });
    const facilityIds = facilities.map((row) => row.id);
    await db.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facilityId: { in: facilityIds } } } },
    });
    await db.notificationRecipient.deleteMany({ where: { notification: { facilityId: { in: facilityIds } } } });
    await db.notification.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.notificationOutbox.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.coverageEpisodeTransition.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.coverageEpisode.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.workOrderResponseHistory.deleteMany({ where: { repair: { unit: { facilityId: { in: facilityIds } } } } });
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
    await db.departmentOperationalProfile.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.assetStatusHistory.deleteMany({ where: { asset: { unit: { facilityId: { in: facilityIds } } } } });
    await db.asset.deleteMany({ where: { unit: { facilityId: { in: facilityIds } } } });
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
