/**
 * SQL-backed N1C processing.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { acknowledgeNotification, markNotificationRead, NotificationLifecycleError } from "./lifecycle";
import { enqueueNotificationEvent, type NotificationIntake } from "./outbox";
import { NOTIFICATION_POLICY_VERSION } from "./policy-registry";
import { processNotificationOutboxRow, processPendingNotificationOutbox } from "./processing";
import { coverageAttentionThreadKey } from "./thread-key";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

test("outbox processing keeps one coverage thread and does not invent recipients", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const userIds: string[] = [];
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const org = await db.organization.create({ data: { name: `N1C ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `N1C Terrace ${suffix}`, timezone: "America/New_York" },
    });
    const otherFacility = await db.facility.create({
      data: { organizationId: org.id, displayName: `N1C Other ${suffix}`, timezone: "America/New_York" },
    });
    const department = await db.department.create({
      data: { facilityId: facility.id, key: `DIETARY_${suffix}`, name: "Food and Nutrition" },
    });

    async function person(input: {
      facilityId: string;
      label: string;
      roleKey: RoleKey;
      departmentId?: string | null;
    }) {
      const user = await db.user.create({
        data: {
          email: `n1c-${input.label}-${suffix}@example.test`,
          displayName: `N1C ${input.label}`,
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
          firstName: "N1C",
          lastName: input.label,
          roleType: input.roleKey,
          primaryDepartmentId: input.departmentId ?? null,
        },
      });
      return { user, employee };
    }

    const administrator = await person({
      facilityId: facility.id,
      label: "admin",
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      departmentId: department.id,
    });
    const head = await person({
      facilityId: facility.id,
      label: "head",
      roleKey: RoleKey.MANAGER,
      departmentId: department.id,
    });
    await db.department.update({ where: { id: department.id }, data: { headEmployeeId: head.employee.id } });
    const assignee = await person({
      facilityId: facility.id,
      label: "assignee",
      roleKey: RoleKey.STAFF,
      departmentId: department.id,
    });
    const supervisor = await person({
      facilityId: facility.id,
      label: "supervisor",
      roleKey: RoleKey.SUPERVISOR,
      departmentId: department.id,
    });
    const otherEmployee = await person({
      facilityId: otherFacility.id,
      label: "other",
      roleKey: RoleKey.STAFF,
    });

    const supportBefore = await db.supportStaffNotification.count();
    const sourceBefore = {
      assignments: await db.operationalAssignment.count({ where: { facilityId: facility.id } }),
      assignmentEvents: await db.operationalAssignmentEvent.count({ where: { facilityId: facility.id } }),
      templates: await db.operationalAssignmentTemplate.count({ where: { facilityId: facility.id } }),
      repairs: await db.repair.count({ where: { unit: { facilityId: facility.id } } }),
    };
    const thread = coverageAttentionThreadKey({
      kind: "coverage",
      facilityId: facility.id,
      serviceDate: "2026-10-29",
      departmentId: department.id,
      spaceId: `space-${suffix}`,
      responsibility: "SERVER",
      cycleStableKey: "breakfast",
      episodeId: `episode-${suffix}`,
    });
    const coveragePayload = {
      serviceDate: "2026-10-29",
      departmentId: department.id,
      spaceId: `space-${suffix}`,
      responsibility: "SERVER",
      cycleStableKey: "breakfast",
      coverageEpisodeId: `episode-${suffix}`,
      locationLabel: "North dining room",
      cycleLabel: "Breakfast",
    };

    async function intake(event: Omit<NotificationIntake, "facilityId" | "occurredAt"> & { occurredAt?: Date }) {
      return db.$transaction((tx) =>
        enqueueNotificationEvent(tx, {
          facilityId: facility.id,
          occurredAt: event.occurredAt ?? new Date("2026-10-29T11:05:00.000Z"),
          ...event,
        }),
      );
    }

    const atRisk = await intake({
      departmentId: department.id,
      eventType: "coverage.became_at_risk",
      aggregateType: "coverage_responsibility",
      aggregateId: thread,
      payload: { ...coveragePayload, coverageState: "AT_RISK" },
      dedupeKey: `at-risk-${suffix}`,
    });
    const first = await processNotificationOutboxRow(db, { outboxId: atRisk.id });
    assert.equal(first.outcome, "applied");
    assert.equal(first.recipientCount, 0);
    const opened = await db.notification.findUniqueOrThrow({
      where: { facilityId_dedupeKey: { facilityId: facility.id, dedupeKey: thread } },
    });
    assert.equal(opened.priority, "NEEDS_ATTENTION");
    assert.equal(opened.kind, "OPERATIONAL");
    assert.equal(opened.category, "coverage");
    assert.equal(opened.sourceType, "coverage_responsibility");
    assert.equal(opened.sourceId, thread);
    assert.equal(opened.dedupeKey, thread);
    assert.notEqual(opened.dedupeKey, `at-risk-${suffix}`);
    assert.equal(opened.title, "Coverage needs attention");
    assert.equal(opened.body, "North dining room · Breakfast");
    assert.equal(opened.actionPath, "/staffing?date=2026-10-29");
    assert.equal(opened.groupKey, null);
    assert.equal(opened.requiresAcknowledgement, false);
    assert.equal(opened.resolvedAt, null);
    assert.equal(opened.policyVersion, NOTIFICATION_POLICY_VERSION);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: opened.id } }), 0);
    assert.equal(await db.notificationDelivery.count({ where: { notificationRecipient: { notificationId: opened.id } } }), 0);
    const atRiskOutbox = await db.notificationOutbox.findUniqueOrThrow({ where: { id: atRisk.id } });
    assert.ok(atRiskOutbox.processedAt);
    assert.equal(atRiskOutbox.attemptCount, 1);
    assert.equal(atRiskOutbox.lastError, null);

    const again = await processNotificationOutboxRow(db, { outboxId: atRisk.id });
    assert.equal(again.outcome, "already_processed");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id, dedupeKey: thread } }), 1);
    assert.equal((await db.notificationOutbox.findUniqueOrThrow({ where: { id: atRisk.id } })).attemptCount, 1);

    const uncovered = await intake({
      departmentId: department.id,
      eventType: "coverage.became_uncovered",
      aggregateType: "coverage_responsibility",
      aggregateId: thread,
      occurredAt: new Date("2026-10-29T12:00:00.000Z"),
      payload: { ...coveragePayload, coverageState: "UNCOVERED", serviceState: "active" },
      dedupeKey: `uncovered-${suffix}`,
    });
    const raised = await processNotificationOutboxRow(db, { outboxId: uncovered.id });
    assert.equal(raised.outcome, "applied");
    assert.equal(raised.notificationId, opened.id);
    const critical = await db.notification.findUniqueOrThrow({ where: { id: opened.id } });
    assert.equal(critical.priority, "CRITICAL");
    assert.equal(critical.requiresAcknowledgement, true);
    assert.equal(critical.resolvedAt, null);
    assert.equal(critical.occurredAt.toISOString(), "2026-10-29T12:00:00.000Z");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id } }), 1);
    assert.equal(await db.notificationRecipient.count({ where: { userId: supervisor.user.id } }), 0);

    const downgrade = await intake({
      departmentId: department.id,
      eventType: "coverage.became_at_risk",
      aggregateType: "coverage_responsibility",
      aggregateId: thread,
      payload: { ...coveragePayload, coverageState: "AT_RISK" },
      dedupeKey: `downgrade-${suffix}`,
    });
    const held = await processNotificationOutboxRow(db, { outboxId: downgrade.id });
    assert.equal(held.outcome, "priority_held");
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: opened.id } })).priority, "CRITICAL");

    const restored = await intake({
      departmentId: department.id,
      eventType: "coverage.restored",
      aggregateType: "coverage_responsibility",
      aggregateId: thread,
      occurredAt: new Date("2026-10-29T12:20:00.000Z"),
      payload: { ...coveragePayload, coverageState: "COVERED" },
      dedupeKey: `restored-${suffix}`,
    });
    const resolved = await processNotificationOutboxRow(db, { outboxId: restored.id });
    assert.equal(resolved.outcome, "resolved");
    assert.equal(resolved.notificationId, opened.id);
    const closed = await db.notification.findUniqueOrThrow({ where: { id: opened.id } });
    assert.equal(closed.resolvedAt?.toISOString(), "2026-10-29T12:20:00.000Z");
    assert.equal(closed.kind, "OPERATIONAL");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id } }), 1);

    const nextEpisode = coverageAttentionThreadKey({
      kind: "coverage",
      facilityId: facility.id,
      serviceDate: "2026-10-29",
      departmentId: department.id,
      spaceId: `space-${suffix}`,
      responsibility: "SERVER",
      cycleStableKey: "breakfast",
      episodeId: `episode-next-${suffix}`,
    });
    const repeat = await intake({
      departmentId: department.id,
      eventType: "coverage.became_at_risk",
      aggregateType: "coverage_responsibility",
      aggregateId: nextEpisode,
      payload: {
        ...coveragePayload,
        coverageEpisodeId: `episode-next-${suffix}`,
        coverageState: "AT_RISK",
      },
      dedupeKey: `repeat-${suffix}`,
    });
    const reopened = await processNotificationOutboxRow(db, { outboxId: repeat.id });
    assert.equal(reopened.outcome, "applied");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id } }), 2);
    assert.ok((await db.notification.findUniqueOrThrow({ where: { id: opened.id } })).resolvedAt);
    const replay = await intake({
      departmentId: department.id,
      eventType: "coverage.became_at_risk",
      aggregateType: "coverage_responsibility",
      aggregateId: thread,
      payload: { ...coveragePayload, coverageState: "AT_RISK" },
      dedupeKey: `replay-${suffix}`,
    });
    const sameEpisode = await processNotificationOutboxRow(db, { outboxId: replay.id });
    assert.equal(sameEpisode.outcome, "deferred");
    assert.equal(sameEpisode.note, "deferred:repeat_episode_not_defined");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id } }), 2);

    const assignment = await intake({
      departmentId: department.id,
      eventType: "assignment.changed",
      aggregateType: "assignment_change",
      aggregateId: `assignment-${suffix}`,
      payload: {
        serviceState: "inactive",
        assignmentId: `assignment-${suffix}`,
        assignmentEventId: `event-assignment-${suffix}`,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee.id,
        subjectLabel: "North dining room",
      },
      dedupeKey: `assignment-inactive-${suffix}`,
    });
    const assigned = await processNotificationOutboxRow(db, { outboxId: assignment.id });
    assert.equal(assigned.outcome, "applied");
    assert.equal(assigned.recipientCount, 1);
    const assignmentNotificationId = assigned.notificationId;
    assert.ok(assignmentNotificationId);
    const recipient = await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: assignmentNotificationId },
    });
    assert.equal(recipient.userId, assignee.user.id);
    assert.equal(recipient.reason, "CURRENT_ASSIGNEE");
    assert.equal(recipient.readAt, null);
    assert.equal(recipient.acknowledgedAt, null);
    assert.equal(recipient.seenAt, null);
    const delivery = await db.notificationDelivery.findFirstOrThrow({
      where: { notificationRecipientId: recipient.id },
    });
    assert.equal(delivery.channel, "IN_APP");
    assert.equal(delivery.status, "DELIVERED");
    assert.ok(delivery.deliveredAt);
    assert.equal(await db.notificationDelivery.count({ where: { channel: { not: "IN_APP" }, notificationRecipient: { notificationId: assignmentNotificationId } } }), 0);
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: assignmentNotificationId, userId: supervisor.user.id } }), 0);

    const read = await markNotificationRead(db, {
      facilityId: facility.id,
      notificationId: assignmentNotificationId,
      userId: assignee.user.id,
      readAt: new Date("2026-10-29T12:30:00.000Z"),
    });
    assert.equal(read.readAt.toISOString(), "2026-10-29T12:30:00.000Z");
    assert.equal(read.acknowledgedAt, null);
    assert.equal(read.resolvedAt, null);
    await assert.rejects(
      () =>
        acknowledgeNotification(db, {
          facilityId: facility.id,
          notificationId: assignmentNotificationId,
          userId: assignee.user.id,
        }),
      (error: unknown) => error instanceof NotificationLifecycleError && error.code === "ACKNOWLEDGEMENT_NOT_REQUIRED",
    );
    const acknowledgedAt = new Date("2026-10-29T12:31:00.000Z");
    await db.notificationRecipient.update({ where: { id: recipient.id }, data: { acknowledgedAt } });
    const assignmentActive = await intake({
      departmentId: department.id,
      eventType: "assignment.changed",
      aggregateType: "assignment_change",
      aggregateId: `assignment-${suffix}`,
      occurredAt: new Date("2026-10-29T12:40:00.000Z"),
      payload: {
        serviceState: "active",
        assignmentId: `assignment-${suffix}`,
        assignmentEventId: `event-assignment-${suffix}`,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee.id,
        subjectLabel: "North dining room",
      },
      dedupeKey: `assignment-active-${suffix}`,
    });
    const raisedAssignment = await processNotificationOutboxRow(db, { outboxId: assignmentActive.id });
    assert.equal(raisedAssignment.outcome, "applied");
    assert.equal(raisedAssignment.notificationId, assignmentNotificationId);
    const preserved = await db.notificationRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    assert.equal(preserved.readAt?.toISOString(), "2026-10-29T12:30:00.000Z");
    assert.equal(preserved.acknowledgedAt?.toISOString(), acknowledgedAt.toISOString());
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: assignmentNotificationId } })).priority, "NEEDS_ATTENTION");
    assert.equal((await db.notification.findUniqueOrThrow({ where: { id: assignmentNotificationId } })).resolvedAt, null);
    assert.equal(await db.notificationDelivery.count({ where: { notificationRecipientId: recipient.id } }), 1);

    const foreign = await intake({
      departmentId: department.id,
      eventType: "assignment.changed",
      aggregateType: "assignment_change",
      aggregateId: `foreign-${suffix}`,
      payload: {
        serviceState: "inactive",
        assignmentId: `foreign-${suffix}`,
        assignmentEventId: `event-foreign-${suffix}`,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: otherEmployee.employee.id,
      },
      dedupeKey: `foreign-${suffix}`,
    });
    const foreignResult = await processNotificationOutboxRow(db, { outboxId: foreign.id });
    assert.equal(foreignResult.outcome, "applied");
    assert.equal(foreignResult.recipientCount, 0);
    assert.equal(
      await db.notificationRecipient.count({
        where: { notificationId: foreignResult.notificationId ?? "", userId: otherEmployee.user.id },
      }),
      0,
    );

    const publication = await intake({
      departmentId: department.id,
      eventType: "publication.failed",
      aggregateType: "publication_attempt",
      aggregateId: `attempt-${suffix}`,
      payload: { publicationAttemptId: `attempt-${suffix}`, subjectLabel: "Tomorrow's cycle" },
      dedupeKey: `publication-${suffix}`,
    });
    const published = await processNotificationOutboxRow(db, { outboxId: publication.id });
    assert.equal(published.outcome, "applied");
    const publicationRecipients = await db.notificationRecipient.findMany({
      where: { notificationId: published.notificationId ?? "" },
      orderBy: { reason: "asc" },
    });
    assert.deepEqual(
      publicationRecipients.map((row) => row.userId).sort(),
      [administrator.user.id, head.user.id].sort(),
    );
    assert.equal(await db.notificationDelivery.count({ where: { notificationRecipient: { notificationId: published.notificationId ?? "" }, channel: "IN_APP" } }), 2);
    const publicationRow = await db.notification.findUniqueOrThrow({ where: { id: published.notificationId ?? "" } });
    assert.equal(publicationRow.kind, "ADMIN");
    assert.equal(publicationRow.requiresAcknowledgement, true);
    const adminRecipient = publicationRecipients.find((row) => row.userId === administrator.user.id);
    assert.ok(adminRecipient);
    const acknowledged = await acknowledgeNotification(db, {
      facilityId: facility.id,
      notificationId: publicationRow.id,
      userId: administrator.user.id,
      acknowledgedAt: new Date("2026-10-29T13:00:00.000Z"),
    });
    assert.equal(acknowledged.acknowledgedAt.toISOString(), "2026-10-29T13:00:00.000Z");
    assert.equal(acknowledged.resolvedAt, null);
    const readPublication = await markNotificationRead(db, {
      facilityId: facility.id,
      notificationId: publicationRow.id,
      userId: administrator.user.id,
      readAt: new Date("2026-10-29T13:01:00.000Z"),
    });
    assert.equal(readPublication.readAt.toISOString(), "2026-10-29T13:01:00.000Z");
    assert.equal(readPublication.acknowledgedAt?.toISOString(), "2026-10-29T13:00:00.000Z");
    assert.equal(readPublication.resolvedAt, null);
    await assert.rejects(
      () =>
        markNotificationRead(db, {
          facilityId: facility.id,
          notificationId: opened.id,
          userId: supervisor.user.id,
        }),
      (error: unknown) => error instanceof NotificationLifecycleError && error.code === "NOT_RECIPIENT",
    );

    const beforeBatch = await db.notification.count({ where: { facilityId: facility.id } });
    await intake({
      departmentId: department.id,
      eventType: "chat.message.created",
      aggregateType: "chat_message",
      aggregateId: `chat-${suffix}`,
      payload: { text: "hello" },
      dedupeKey: `chat-${suffix}`,
    });
    await intake({
      departmentId: department.id,
      eventType: "coverage.became_at_risk",
      aggregateType: "coverage_responsibility",
      aggregateId: "broken",
      payload: { coverageState: "AT_RISK" },
      dedupeKey: `broken-${suffix}`,
    });
    await intake({
      departmentId: department.id,
      eventType: "sync.conflict_detected",
      aggregateType: "sync_conflict",
      aggregateId: `sync-${suffix}`,
      payload: { blocksActiveOperation: true, syncActorUserId: assignee.user.id },
      dedupeKey: `sync-${suffix}`,
    });
    await intake({
      departmentId: department.id,
      eventType: "coverage.became_at_risk",
      aggregateType: "coverage_responsibility",
      aggregateId: `other-space-${suffix}`,
      payload: { ...coveragePayload, spaceId: `other-space-${suffix}`, coverageState: "AT_RISK" },
      dedupeKey: `other-space-${suffix}`,
    });
    const batch = await processPendingNotificationOutbox(db, { facilityId: facility.id, limit: 20 });
    const byNote = new Map(batch.map((result) => [result.note, result.outcome]));
    assert.equal(byNote.get("unsupported:chat_is_not_operational_attention"), "unsupported");
    assert.equal(byNote.get("invalid_payload:missing_coverage_grain"), "invalid_payload");
    assert.equal(byNote.get("deferred:sync_not_processable"), "deferred");
    assert.equal(await db.notification.count({ where: { facilityId: facility.id, category: "sync" } }), 0);
    assert.equal(await db.notification.count({ where: { facilityId: facility.id, dedupeKey: { contains: "chat" } } }), 0);
    assert.equal(await db.notification.count({ where: { facilityId: facility.id } }), beforeBatch + 1);
    const broken = await db.notificationOutbox.findFirstOrThrow({ where: { dedupeKey: `broken-${suffix}` } });
    assert.ok(broken.processedAt);
    assert.equal(broken.lastError, "invalid_payload:missing_coverage_grain");
    const undepartmented = await intake({
      eventType: "assignment.changed",
      aggregateType: "assignment_change",
      aggregateId: `no-department-${suffix}`,
      payload: {
        serviceState: "active",
        assignmentId: `no-department-${suffix}`,
        assignmentEventId: `event-no-department-${suffix}`,
        serviceDate: "2026-10-29",
        assigneeEmployeeId: assignee.employee.id,
      },
      dedupeKey: `no-department-${suffix}`,
    });
    const missingDepartment = await processNotificationOutboxRow(db, { outboxId: undepartmented.id });
    assert.equal(missingDepartment.outcome, "deferred");
    assert.equal(missingDepartment.note, "deferred:department_required");
    assert.equal(missingDepartment.notificationId, null);
    assert.equal(
      await db.notification.count({ where: { facilityId: facility.id, category: "assignment", dedupeKey: { contains: "no-department" } } }),
      0,
    );

    assert.equal(await db.supportStaffNotification.count(), supportBefore);
    assert.equal(await db.operationalAssignment.count({ where: { facilityId: facility.id } }), sourceBefore.assignments);
    assert.equal(
      await db.operationalAssignmentEvent.count({ where: { facilityId: facility.id } }),
      sourceBefore.assignmentEvents,
    );
    assert.equal(
      await db.operationalAssignmentTemplate.count({ where: { facilityId: facility.id } }),
      sourceBefore.templates,
    );
    assert.equal(await db.repair.count({ where: { unit: { facilityId: facility.id } } }), sourceBefore.repairs);
    assert.equal(await db.notification.count({ where: { facilityId: otherFacility.id } }), 0);
  } finally {
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facility: { displayName: { contains: suffix } } } } },
    });
    await db.notificationRecipient.deleteMany({
      where: { notification: { facility: { displayName: { contains: suffix } } } },
    });
    await db.notification.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.notificationOutbox.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
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
