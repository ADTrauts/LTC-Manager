/**
 * work_order.intervention_required follows the Immediate response opening.
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
import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
} from "@/lib/operational-time";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { changeAssetStatus } from "./asset-service";
import { reportIssue } from "./issue-service";
import { recordWorkOrderResponseTerminal, setWorkOrderResponseRequirement } from "./work-order-response";
import {
  assignResponsibleEmployee,
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

function session(facilityId: string, userId: string, departmentId: string): FacilitySession {
  return {
    uid: userId,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "MANAGER",
    name: "Intervention Manager",
    email: "intervention@example.test",
    facilityId,
    primaryDepartmentId: departmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

test("immediate Work Order response notifies on-call coverage once per opening", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const previousContracted = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  const suffix = tag();
  const userIds: string[] = [];
  const zone = "America/New_York";
  const day = "2026-10-29";
  const at = parseFacilityLocalScheduledStartOnDate("11:30", day, zone)!;
  const later = (seconds: number) => new Date(at.getTime() + seconds * 1000);
  const serviceDate = facilityLocalDateToServiceDate(day);
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
    const org = await db.organization.create({ data: { name: `Intervention ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Intervention ${suffix}`, timezone: zone },
    });
    const otherFacility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Intervention Other ${suffix}`, timezone: zone },
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
    const plantRoom = await db.unit.create({
      data: { facilityId: facility.id, name: `Boiler room ${suffix}`, unitType: "MECHANICAL" },
    });

    async function person(input: {
      label: string;
      role: RoleKey;
      departmentId: string;
      user: boolean;
      facilityId?: string;
    }) {
      let userId: string | null = null;
      const homeId = input.facilityId ?? facility.id;
      if (input.user) {
        const role = input.role === RoleKey.MANAGER ? managerRole : staffRole;
        const user = await db.user.create({
          data: {
            email: `intervention-${input.label}-${suffix}@example.test`,
            displayName: `Intervention ${input.label}`,
            facilityId: homeId,
            roleId: role.id,
            passwordHash: "hash",
            emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
        userIds.push(user.id);
        userId = user.id;
        const access = await db.userFacilityAccess.create({
          data: { userId: user.id, facilityId: homeId, isActive: true },
        });
        await db.userFacilityRolePeriod.create({
          data: { userFacilityAccessId: access.id, roleKey: input.role, startsAt: new Date("2026-01-01T00:00:00.000Z") },
        });
      }
      const employee = await db.employee.create({
        data: {
          facilityId: facility.id,
          userId,
          firstName: "Intervention",
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
    const called = await person({ label: "called", role: RoleKey.STAFF, departmentId: dietary.id, user: true });
    const plantResponder = await person({ label: "plant", role: RoleKey.STAFF, departmentId: plant.id, user: true });
    const outsider = await person({
      label: "outsider",
      role: RoleKey.STAFF,
      departmentId: dietary.id,
      user: true,
      facilityId: otherFacility.id,
    });
    assert.ok(manager.userId && primary.userId && second.userId && located.userId && called.userId && plantResponder.userId && outsider.userId);
    const actor = session(facility.id, manager.userId, dietary.id);

    const window = {
      startsAt: parseFacilityLocalScheduledStartOnDate("07:00", day, zone),
      endsAt: parseFacilityLocalScheduledStartOnDate("19:00", day, zone),
    };
    async function cover(input: { employeeId: string; departmentId: string; roleKey: string; unitId?: string | null }) {
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
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        },
      });
    }
    await cover({ employeeId: primary.employee.id, departmentId: dietary.id, roleKey: "DIETARY_ON_CALL_COVERAGE" });
    await cover({ employeeId: second.employee.id, departmentId: dietary.id, roleKey: "DIETARY_ON_CALL_COVERAGE" });
    await cover({ employeeId: unlinked.employee.id, departmentId: dietary.id, roleKey: "DIETARY_ON_CALL_COVERAGE" });
    await cover({ employeeId: called.employee.id, departmentId: dietary.id, roleKey: "DIETARY_ON_CALL_COVERAGE" });
    await cover({ employeeId: outsider.employee.id, departmentId: dietary.id, roleKey: "DIETARY_ON_CALL_COVERAGE" });
    await cover({
      employeeId: located.employee.id,
      departmentId: dietary.id,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      unitId: floor.id,
    });
    await db.scheduleEntry.create({
      data: {
        employeeId: called.employee.id,
        departmentId: dietary.id,
        date: serviceDate,
        shift: "FULL_DAY",
        calledOffAt: at,
        callOffReason: "Called off",
        plannedStart: "07:00",
        plannedEnd: "19:00",
      },
    });

    async function rowsFor(repairId: string) {
      const rows = await db.notificationOutbox.findMany({
        where: { facilityId: facility.id, eventType: { startsWith: "work_order.intervention" } },
      });
      return rows.filter((row) => (row.payload as { repairId?: string }).repairId === repairId);
    }

    await assert.rejects(
      () =>
        db.$transaction(async (tx) => {
          await createWorkOrderDirect(actor, {
            facilityId: facility.id,
            departmentId: dietary.id,
            responsibleDepartmentId: dietary.id,
            unitId: kitchen.id,
            title: "Rollback response",
            description: "This must not remain.",
            priority: "LOW",
            responseRequirement: "IMMEDIATE",
            client: tx,
            now: at,
          });
          throw new Error("rollback");
        }),
      /rollback/,
    );
    assert.equal(await db.repair.count({ where: { unitId: kitchen.id, title: "Rollback response" } }), 0);
    assert.equal(await db.workOrderResponseHistory.count({ where: { repair: { unitId: kitchen.id } } }), 0);
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: facility.id, eventType: "work_order.intervention_required" } }),
      0,
    );

    const ordinary = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
      title: "Queue emergency",
      description: "Sort this first.",
      priority: "EMERGENCY",
      client: db,
      now: at,
    });
    assert.equal(ordinary.priority, "EMERGENCY");
    assert.equal(ordinary.responseRequirement, "STANDARD");
    assert.equal((await rowsFor(ordinary.id)).length, 0);

    const opened = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
      title: "Cooler down",
      description: "Production cannot continue.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at,
    });
    assert.equal(opened.priority, "LOW");
    assert.equal(opened.responseRequirement, "IMMEDIATE");
    const opening = await db.workOrderResponseHistory.findFirstOrThrow({
      where: { repairId: opened.id, transition: "OPENED" },
    });
    const notice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${opened.id}`, sourceType: "work_order_response" },
    });
    assert.equal(notice.kind, "OPERATIONAL");
    assert.equal(notice.priority, "URGENT");
    assert.equal(notice.priority === "CRITICAL", false);
    assert.equal(notice.requiresAcknowledgement, true);
    assert.equal((notice.metadata as { protected?: boolean }).protected, false);
    assert.equal(notice.title, "Immediate Work Order response required");
    assert.match(notice.body, /Cooler down at Kitchen/);
    assert.match(notice.body, /requires immediate operational response/);
    assert.equal(notice.resolvedAt, null);
    assert.equal(notice.expiresAt, null);
    assert.equal((notice.metadata as { openingHistoryId?: string }).openingHistoryId, opening.id);
    const recipients = await db.notificationRecipient.findMany({
      where: { notificationId: notice.id },
      select: { userId: true, explanation: true },
    });
    assert.deepEqual(recipients.map((row) => row.userId).sort(), [primary.userId, second.userId].sort());
    assert.match(recipients[0]?.explanation ?? "", /On-Call Coverage/);
    assert.equal(/assignee|Work Order assigned|supervisor/i.test(recipients[0]?.explanation ?? ""), false);
    assert.equal(recipients.some((row) => row.userId === called.userId), false);
    assert.equal(recipients.some((row) => row.userId === outsider.userId), false);
    assert.equal(recipients.some((row) => row.userId === located.userId), false);
    assert.equal(recipients.some((row) => row.userId === plantResponder.userId), false);
    const deliveries = await db.notificationDelivery.count({
      where: { notificationRecipient: { notificationId: notice.id }, channel: "IN_APP" },
    });
    assert.equal(deliveries, 2);
    const intake = await db.notificationOutbox.findFirstOrThrow({
      where: { facilityId: facility.id, eventType: "work_order.intervention_required", aggregateId: opening.id },
    });
    const replay = await processNotificationOutboxRow(db, { outboxId: intake.id });
    assert.equal(replay.outcome, "already_processed");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id, dedupeKey: notice.dedupeKey } }), 1);

    const center = await loadNotificationCenter(db, {
      userId: primary.userId,
      facilityId: facility.id,
      now: at,
      timeZone: zone,
    });
    assert.equal(center.status, "ready");
    if (center.status !== "ready") return;
    const item = center.needsAttention.find((row) => row.id === notice.id);
    assert.equal(item?.priority, "URGENT");
    assert.equal(item?.priorityLabel, "Urgent");
    assert.equal(item?.actionLabel, "Open Work Order");
    assert.equal(item?.actionPath, `/repairs/${opened.id}`);
    assert.equal(item?.requiresAcknowledgement, true);
    assert.equal(await getActiveAttentionCountForUser(db, { userId: primary.userId, facilityId: facility.id, now: at }), 1);
    await markNotificationRead(db, { facilityId: facility.id, notificationId: notice.id, userId: primary.userId, readAt: at });
    await acknowledgeNotification(db, {
      facilityId: facility.id,
      notificationId: notice.id,
      userId: primary.userId,
      acknowledgedAt: at,
    });
    const afterAck = await db.notification.findUniqueOrThrow({ where: { id: notice.id } });
    assert.equal(afterAck.resolvedAt, null);
    assert.equal(await getActiveAttentionCountForUser(db, { userId: primary.userId, facilityId: facility.id, now: at }), 1);

    const same = await setWorkOrderResponseRequirement(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      responseRequirement: "IMMEDIATE",
      client: db,
      now: later(60),
    });
    assert.equal(same.historyId, null);
    assert.equal((await rowsFor(opened.id)).length, 1);

    const quiet = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: plant.id,
      responsibleDepartmentId: plant.id,
      unitId: plantRoom.id,
      title: "Uncovered boiler",
      description: "No on-call coverage is assigned.",
      priority: "MEDIUM",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: at,
    });
    const quietNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${quiet.id}` },
    });
    assert.equal(quietNotice.priority, "URGENT");
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: quietNotice.id } }), 0);
    const quietFacts = (quietNotice.metadata as { unresolvedRecipients?: Array<{ cause?: string }> }).unresolvedRecipients;
    assert.equal(quietFacts?.some((row) => row.cause === "on_call_responsibility_uncovered"), true);
    await cover({ employeeId: plantResponder.employee.id, departmentId: plant.id, roleKey: "ON_CALL_COVERAGE" });

    const cleared = await setWorkOrderResponseRequirement(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      responseRequirement: "STANDARD",
      client: db,
      now: later(120),
    });
    assert.ok(cleared.historyId);
    const ended = await db.notification.findUniqueOrThrow({ where: { id: notice.id } });
    assert.equal(ended.resolvedAt, null);
    assert.ok(ended.expiresAt);
    assert.equal((ended.metadata as { endedReason?: string }).endedReason, "intervention_cleared");
    const endedCenter = await loadNotificationCenter(db, {
      userId: primary.userId,
      facilityId: facility.id,
      now: later(121),
      timeZone: zone,
    });
    assert.equal(endedCenter.status, "ready");
    if (endedCenter.status !== "ready") return;
    assert.equal(endedCenter.ended.some((row) => row.id === notice.id), true);
    assert.equal(endedCenter.needsAttention.some((row) => row.id === notice.id), false);

    const again = await setWorkOrderResponseRequirement(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: opened.id,
      responseRequirement: "IMMEDIATE",
      client: db,
      now: later(180),
    });
    assert.ok(again.historyId);
    assert.notEqual(again.historyId, opening.id);
    const secondNotice = await db.notification.findFirstOrThrow({
      where: {
        facilityId: facility.id,
        actionPath: `/repairs/${opened.id}`,
        sourceType: "work_order_response",
        expiresAt: null,
        resolvedAt: null,
      },
    });
    assert.notEqual(secondNotice.id, notice.id);
    assert.notEqual(secondNotice.dedupeKey, notice.dedupeKey);
    assert.equal((secondNotice.metadata as { openingHistoryId?: string }).openingHistoryId, again.historyId);
    const stillEnded = await db.notification.findUniqueOrThrow({ where: { id: notice.id } });
    assert.ok(stillEnded.expiresAt);
    assert.equal(stillEnded.resolvedAt, null);
    const secondRecipients = await db.notificationRecipient.findMany({ where: { notificationId: secondNotice.id } });
    assert.equal(secondRecipients.some((row) => row.userId === plantResponder.userId), false);

    const held = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
      title: "Held response",
      description: "Still immediate while waiting.",
      priority: "MEDIUM",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: later(200),
    });
    const heldNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${held.id}`, sourceType: "work_order_response" },
    });
    await updateWorkOrderStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: held.id,
      toStatus: "ON_HOLD",
      holdReason: "WAITING_FOR_VENDOR",
      client: db,
      now: later(210),
    });
    await updateWorkOrderStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: held.id,
      toStatus: "WAITING_ON_VENDOR",
      client: db,
      now: later(220),
    });
    await recordWorkOrderDeadline(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: held.id,
      dueAt: new Date("2026-10-30T16:00:00.000Z"),
      client: db,
      now: later(230),
    });
    const afterHold = await db.notification.findUniqueOrThrow({ where: { id: heldNotice.id } });
    assert.equal(afterHold.expiresAt, null);
    assert.equal(afterHold.resolvedAt, null);
    assert.equal((await db.repair.findUniqueOrThrow({ where: { id: held.id } })).responseRequirement, "IMMEDIATE");

    const owned = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
      title: "Assigned response",
      description: "Someone is already doing the work.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      assignedEmployeeId: manager.employee.id,
      client: db,
      now: later(240),
    });
    const ownedNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${owned.id}`, sourceType: "work_order_response" },
    });
    const ownedRecipients = await db.notificationRecipient.findMany({ where: { notificationId: ownedNotice.id } });
    assert.equal(ownedRecipients.some((row) => row.userId === manager.userId), false);
    const assignmentNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${owned.id}`, sourceType: "work_order_assignment" },
    });
    assert.equal(assignmentNotice.priority, "UPDATE");
    const assignee = await db.notificationRecipient.findFirstOrThrow({ where: { notificationId: assignmentNotice.id } });
    assert.equal(assignee.userId, manager.userId);
    await assignResponsibleEmployee(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: owned.id,
      assignedEmployeeId: primary.employee.id,
      client: db,
    });
    const afterAssign = await db.notification.findUniqueOrThrow({ where: { id: ownedNotice.id } });
    assert.equal(afterAssign.expiresAt, null);
    assert.equal(afterAssign.priority, "URGENT");
    const both = await db.notification.findMany({
      where: { facilityId: facility.id, actionPath: `/repairs/${owned.id}`, recipients: { some: { userId: primary.userId } } },
    });
    assert.equal(both.some((row) => row.sourceType === "work_order_response" && row.priority === "URGENT"), true);
    assert.equal(both.some((row) => row.sourceType === "work_order_assignment" && row.priority === "UPDATE"), true);

    const late = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
      title: "Late and immediate",
      description: "The deadline and the response are different.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      assignedEmployeeId: manager.employee.id,
      dueAt: new Date("2026-10-28T16:00:00.000Z"),
      client: db,
      now: later(260),
    });
    const lateIntervention = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${late.id}`, sourceType: "work_order_response" },
    });
    const lateOverdue = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${late.id}`, sourceType: "work_order_overdue" },
    });
    assert.equal(lateIntervention.priority, "URGENT");
    assert.equal(lateOverdue.priority, "NEEDS_ATTENTION");
    assert.notEqual(lateIntervention.dedupeKey, lateOverdue.dedupeKey);
    const overdueRecipient = await db.notificationRecipient.findFirstOrThrow({ where: { notificationId: lateOverdue.id } });
    assert.equal(overdueRecipient.userId, manager.userId);
    const lateOnCall = await db.notificationRecipient.findMany({ where: { notificationId: lateIntervention.id } });
    assert.equal(lateOnCall.some((row) => row.userId === manager.userId), false);

    const floorOrder = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: floor.id,
      title: "Floor response",
      description: "The nearer on-call assignment applies.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: later(280),
    });
    const floorNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${floorOrder.id}` },
    });
    const floorRecipients = await db.notificationRecipient.findMany({ where: { notificationId: floorNotice.id } });
    assert.deepEqual(floorRecipients.map((row) => row.userId), [located.userId]);

    const asset = await db.asset.create({
      data: {
        assetCode: `INT-${suffix}`,
        name: "Walk-in",
        equipmentType: "EQUIPMENT",
        unitId: kitchen.id,
        departmentId: dietary.id,
        criticality: "CRITICAL",
        status: "OPERATIONAL",
      },
    });
    await changeAssetStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      assetId: asset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      client: db,
      now: later(300),
    });
    const withAsset = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      assetId: asset.id,
      title: "Walk-in response",
      description: "The outage and the response are different.",
      priority: "EMERGENCY",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: later(310),
    });
    const assetNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceType: "asset_status", actionPath: `/assets/${asset.id}` },
    });
    const assetWork = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, sourceType: "work_order_response", actionPath: `/repairs/${withAsset.id}` },
    });
    assert.notEqual(assetNotice.dedupeKey, assetWork.dedupeKey);
    assert.equal(assetWork.priority, "URGENT");

    const issue = await reportIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      unitId: kitchen.id,
      summary: "Noisy mixer",
      description: "Heard during service.",
      priority: "EMERGENCY",
      operationalImpact: "EQUIPMENT_UNAVAILABLE",
      client: db,
      observedAt: later(320),
    });
    const fromIssue = await createWorkOrderFromIssue(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      issueId: issue.issue.id,
      client: db,
      now: later(320),
    });
    assert.equal(fromIssue.responseRequirement, "STANDARD");
    assert.equal((await rowsFor(fromIssue.id)).length, 0);

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
        observedAt: later(330),
      },
    });
    const fromRequest = await createWorkOrderFromOperationalRequest(actor, {
      facilityId: facility.id,
      plantDepartmentId: dietary.id,
      requestId: request.id,
      client: db,
      now: later(330),
    });
    assert.equal(fromRequest.responseRequirement, "STANDARD");
    assert.equal((await rowsFor(fromRequest.id)).length, 0);

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
    assert.equal((await rowsFor(preventive.id)).length, 0);

    const done = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
      title: "Finish the response",
      description: "Complete it while immediate.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: later(340),
    });
    const doneNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${done.id}`, sourceType: "work_order_response" },
    });
    await updateWorkOrderStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: done.id,
      toStatus: "IN_PROGRESS",
      client: db,
      now: later(350),
    });
    await updateWorkOrderStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: done.id,
      toStatus: "COMPLETED",
      client: db,
      now: later(360),
    });
    const resolved = await db.notification.findUniqueOrThrow({ where: { id: doneNotice.id } });
    assert.ok(resolved.resolvedAt);
    assert.equal(resolved.expiresAt, null);
    const resolvedAgain = await recordWorkOrderResponseTerminal(db, {
      repairId: done.id,
      responseRequirement: "IMMEDIATE",
      transition: "COMPLETED",
      changedByUserId: manager.userId,
      changedAt: later(370),
    });
    assert.deepEqual(resolvedAgain, []);
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: done.id, transition: "COMPLETED" } }), 1);
    const doneCenter = await loadNotificationCenter(db, {
      userId: primary.userId,
      facilityId: facility.id,
      now: later(371),
      timeZone: zone,
    });
    assert.equal(doneCenter.status, "ready");
    if (doneCenter.status !== "ready") return;
    assert.equal(doneCenter.resolved.some((row) => row.id === doneNotice.id), true);

    const cancelled = await createWorkOrderDirect(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      responsibleDepartmentId: dietary.id,
      unitId: kitchen.id,
      title: "Withdraw the response",
      description: "Cancel it while immediate.",
      priority: "LOW",
      responseRequirement: "IMMEDIATE",
      client: db,
      now: later(380),
    });
    const cancelNotice = await db.notification.findFirstOrThrow({
      where: { facilityId: facility.id, actionPath: `/repairs/${cancelled.id}`, sourceType: "work_order_response" },
    });
    await updateWorkOrderStatus(actor, {
      facilityId: facility.id,
      departmentId: dietary.id,
      repairId: cancelled.id,
      toStatus: "CANCELLED",
      client: db,
      now: later(390),
    });
    const cancelledNotice = await db.notification.findUniqueOrThrow({ where: { id: cancelNotice.id } });
    assert.equal(cancelledNotice.resolvedAt, null);
    assert.ok(cancelledNotice.expiresAt);
    assert.equal((cancelledNotice.metadata as { endedReason?: string }).endedReason, "work_order_cancelled");
    const cancelAgain = await recordWorkOrderResponseTerminal(db, {
      repairId: cancelled.id,
      responseRequirement: "IMMEDIATE",
      transition: "CANCELLED",
      changedByUserId: manager.userId,
      changedAt: later(400),
    });
    assert.deepEqual(cancelAgain, []);
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: cancelled.id, transition: "CANCELLED" } }), 1);
    const cancelCenter = await loadNotificationCenter(db, {
      userId: primary.userId,
      facilityId: facility.id,
      now: later(401),
      timeZone: zone,
    });
    assert.equal(cancelCenter.status, "ready");
    if (cancelCenter.status !== "ready") return;
    assert.equal(cancelCenter.ended.some((row) => row.id === cancelNotice.id), true);

    let retryId = "";
    const retryOrder = await db.$transaction(async (tx) => {
      const created = await createWorkOrderDirect(actor, {
        facilityId: facility.id,
        departmentId: dietary.id,
        responsibleDepartmentId: dietary.id,
        unitId: kitchen.id,
        title: "Retry response",
        description: "The notice can fail after the Work Order commits.",
        priority: "LOW",
        responseRequirement: "IMMEDIATE",
        client: tx,
        now: later(420),
      });
      retryId = created.id;
      return created;
    });
    const retryOutbox = (await rowsFor(retryOrder.id)).find((row) => row.eventType === "work_order.intervention_required");
    assert.ok(retryOutbox);
    assert.equal(retryOutbox.processedAt, null);
    const boom = {
      $transaction: async () => {
        throw new Error("processor down");
      },
      notificationOutbox: db.notificationOutbox,
    } as unknown as PrismaClient;
    const failed = await processNotificationOutboxRow(boom, { outboxId: retryOutbox.id });
    assert.equal(failed.outcome, "failed");
    assert.equal((await db.repair.findUniqueOrThrow({ where: { id: retryId } })).responseRequirement, "IMMEDIATE");
    assert.equal(await db.workOrderResponseHistory.count({ where: { repairId: retryId, transition: "OPENED" } }), 1);
    const retryRow = await db.notificationOutbox.findUniqueOrThrow({ where: { id: retryOutbox.id } });
    assert.equal(retryRow.processedAt, null);
    assert.ok(retryRow.attemptCount >= 1);
    const retried = await processNotificationOutboxRow(db, { outboxId: retryOutbox.id });
    assert.equal(retried.outcome, "applied");
    assert.equal(
      await db.notification.count({ where: { facilityId: facility.id, actionPath: `/repairs/${retryId}`, sourceType: "work_order_response" } }),
      1,
    );
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: facility.id, eventType: "shift.called_off" } }),
      0,
    );
  } finally {
    process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previousContracted;
    const facilityWhere = { displayName: { contains: suffix } };
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facility: facilityWhere } } },
    });
    await db.notificationRecipient.deleteMany({ where: { notification: { facility: facilityWhere } } });
    await db.notification.deleteMany({ where: { facility: facilityWhere } });
    await db.notificationOutbox.deleteMany({ where: { facility: facilityWhere } });
    await db.workOrderResponseHistory.deleteMany({ where: { repair: { unit: { facility: facilityWhere } } } });
    await db.repairLaborEntry.deleteMany({ where: { repair: { unit: { facility: facilityWhere } } } });
    await db.repairUpdate.deleteMany({ where: { repair: { unit: { facility: facilityWhere } } } });
    await db.repair.deleteMany({ where: { unit: { facility: facilityWhere } } });
    await db.operationalRequestUpdate.deleteMany({ where: { request: { facility: facilityWhere } } });
    await db.operationalRequest.deleteMany({ where: { facility: facilityWhere } });
    await db.assetIssueUpdate.deleteMany({ where: { issue: { facility: facilityWhere } } }).catch(() => undefined);
    await db.assetIssue.deleteMany({ where: { facility: facilityWhere } });
    await db.assetStatusHistory.deleteMany({ where: { asset: { unit: { facility: facilityWhere } } } });
    await db.asset.deleteMany({ where: { unit: { facility: facilityWhere } } });
    await db.scheduleEntry.deleteMany({ where: { department: { facility: facilityWhere } } });
    await db.operationalAssignment.deleteMany({ where: { facility: facilityWhere } });
    await db.maintenanceCategory.deleteMany({ where: { facility: facilityWhere } });
    await db.unit.deleteMany({ where: { facility: facilityWhere } });
    await db.employee.deleteMany({ where: { facility: facilityWhere } });
    await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { userId: { in: userIds } } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { facility: facilityWhere } });
    await db.facility.deleteMany({ where: facilityWhere });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});
