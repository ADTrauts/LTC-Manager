/**
 * Durable Web Push delivery.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RoleKey } from "@prisma/client";

import { facilityLocalDateToServiceDate, parseFacilityLocalScheduledStartOnDate } from "@/lib/operational-time";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { evaluateAcknowledgementEscalation } from "./escalation";
import { deliverQueuedPushDispatches, type PushTransport } from "./push-delivery";
import { revokeAllPushSubscriptionsForUser } from "./push-subscription";
import {
  enqueuePriorityRiseIfStrict,
  enqueuePushForNewRecipient,
  priorityRiseTriggerKey,
  recipientAddedTriggerKey,
} from "./push-dispatch";
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

async function withSending<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.WEB_PUSH_SENDING_ENABLED;
  process.env.WEB_PUSH_SENDING_ENABLED = "true";
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.WEB_PUSH_SENDING_ENABLED;
    else process.env.WEB_PUSH_SENDING_ENABLED = previous;
  }
}

test("a recipient and a priority rise become recoverable push attempts", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const now = new Date("2026-10-29T16:00:00.000Z");
  const orgIds: string[] = [];
  const userIds: string[] = [];
  try {
    await withSending(async () => {
      const org = await db.organization.create({ data: { name: `Push ${suffix}` } });
      orgIds.push(org.id);
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `Push Terrace ${suffix}`, timezone: zone },
      });
      const other = await db.facility.create({
        data: { organizationId: org.id, displayName: `Push Other ${suffix}`, timezone: zone },
      });
      const user = await db.user.create({
        data: {
          email: `push-user-${suffix}@example.test`,
          displayName: "Push User",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      userIds.push(user.id);
      const access = await db.userFacilityAccess.create({
        data: { userId: user.id, facilityId: facility.id, isActive: true },
      });
      const notification = await db.notification.create({
        data: {
          facilityId: facility.id,
          kind: "OPERATIONAL",
          category: "maintenance",
          priority: "NEEDS_ATTENTION",
          sourceType: "issue",
          sourceId: `issue-${suffix}`,
          title: "Resident private title must not ship",
          body: "Private operational body must not ship",
          dedupeKey: `push-${suffix}`,
          requiresAcknowledgement: true,
          occurredAt: now,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } },
        },
      });
      const recipient = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: user.id,
          reason: "DEPARTMENT_MANAGER",
          explanation: "Department head",
        },
      });
      const secondReason = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: user.id,
          reason: "ON_CALL_RESPONDER",
          explanation: "On-call coverage",
        },
      });

      const previousFlag = process.env.WEB_PUSH_SENDING_ENABLED;
      delete process.env.WEB_PUSH_SENDING_ENABLED;
      await enqueuePushForNewRecipient(db, { recipientId: recipient.id, now });
      assert.equal(await db.pushDispatch.count({ where: { notificationRecipientId: recipient.id } }), 0);
      process.env.WEB_PUSH_SENDING_ENABLED = "true";
      await enqueuePushForNewRecipient(db, { recipientId: recipient.id, now });
      await deliverQueuedPushDispatches(db, { now, transport: rejectingTransport() });
      assert.equal(await db.pushDispatch.count({ where: { notificationRecipientId: recipient.id } }), 0);
      if (previousFlag === undefined) process.env.WEB_PUSH_SENDING_ENABLED = "true";

      const desktop = await subscribe(db, user.id, suffix, "desktop");
      const phone = await subscribe(db, user.id, suffix, "phone");
      const laptop = await subscribe(db, user.id, suffix, "laptop");
      const revoked = await subscribe(db, user.id, suffix, "revoked");
      await db.pushSubscription.update({
        where: { id: revoked.id },
        data: { revokedAt: now, revokedReason: "USER_DISABLED" },
      });
      await enqueuePushForNewRecipient(db, { recipientId: recipient.id, now });
      await enqueuePushForNewRecipient(db, { recipientId: recipient.id, now });
      const first = await db.pushDispatch.findMany({ where: { notificationRecipientId: recipient.id } });
      assert.equal(first.length, 3);
      assert.deepEqual(first.map((row) => row.triggerKey).sort(), [
        recipientAddedTriggerKey(recipient.id),
        recipientAddedTriggerKey(recipient.id),
        recipientAddedTriggerKey(recipient.id),
      ]);
      assert.equal(first.every((row) => row.status === "QUEUED"), true);
      assert.equal(first.some((row) => row.pushSubscriptionId === revoked.id), false);

      await enqueuePushForNewRecipient(db, { recipientId: secondReason.id, now });
      const second = await db.pushDispatch.findMany({ where: { notificationRecipientId: secondReason.id } });
      assert.equal(second.length, 3);
      assert.equal(second[0]?.triggerKey, recipientAddedTriggerKey(secondReason.id));

      const calls: string[] = [];
      const transport: PushTransport = async (input) => {
        calls.push(JSON.stringify(input.payload));
        assert.equal(input.payload.attentionId, notification.id);
        assert.equal(JSON.stringify(input.payload).includes("Resident"), false);
        assert.equal(JSON.stringify(input.payload).includes("Private operational"), false);
        assert.deepEqual(Object.keys(input.payload).sort(), ["attentionId", "renotify"]);
        return { outcome: "accepted" };
      };
      const sent = await deliverQueuedPushDispatches(db, { now, transport, limit: 20 });
      assert.equal(sent.sent, 6);
      assert.equal(calls.length, 6);
      assert.equal(calls.every((body) => body.includes('"renotify":false')), true);
      const again = await deliverQueuedPushDispatches(db, { now, transport: rejectingTransport(), limit: 20 });
      assert.equal(again.sent, 0);

      await db.notification.update({ where: { id: notification.id }, data: { priority: "URGENT" } });
      await db.notificationRecipient.updateMany({
        where: { notificationId: notification.id },
        data: { snoozedUntil: null },
      });
      const rose = await enqueuePriorityRiseIfStrict(db, {
        notificationId: notification.id,
        previous: "NEEDS_ATTENTION",
        next: "URGENT",
        now,
      });
      assert.equal(rose, true);
      const priorityRows = await db.pushDispatch.findMany({
        where: { triggerKey: priorityRiseTriggerKey(recipient.id, "URGENT") },
      });
      assert.equal(priorityRows.length, 3);
      const held = await enqueuePriorityRiseIfStrict(db, {
        notificationId: notification.id,
        previous: "URGENT",
        next: "URGENT",
        now,
      });
      assert.equal(held, false);
      assert.equal(
        await db.pushDispatch.count({ where: { triggerKey: priorityRiseTriggerKey(recipient.id, "URGENT") } }),
        3,
      );

      const quietUser = await db.user.create({
        data: {
          email: `push-quiet-${suffix}@example.test`,
          displayName: "Quiet",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      userIds.push(quietUser.id);
      await db.userFacilityAccess.create({ data: { userId: quietUser.id, facilityId: facility.id, isActive: true } });
      await db.notificationPreference.create({
        data: {
          userId: quietUser.id,
          facilityId: facility.id,
          quietEnabled: true,
          quietStartMinute: 0,
          quietEndMinute: 1439,
          updateDigestEnabled: false,
        },
      });
      const quietNotice = await db.notification.create({
        data: {
          facilityId: facility.id,
          kind: "OPERATIONAL",
          category: "publication",
          priority: "UPDATE",
          sourceType: "publication_attempt",
          sourceId: `pub-${suffix}`,
          title: "Hidden title",
          body: "Hidden body",
          dedupeKey: `push-quiet-${suffix}`,
          occurredAt: now,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: null } },
        },
      });
      const quietRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: quietNotice.id,
          userId: quietUser.id,
          reason: "DEPARTMENT_MANAGER",
          explanation: "Update",
        },
      });
      await subscribe(db, quietUser.id, suffix, "quiet");
      await enqueuePushForNewRecipient(db, { recipientId: quietRecipient.id, now });
      const quietRow = await db.pushDispatch.findFirstOrThrow({ where: { notificationRecipientId: quietRecipient.id } });
      assert.equal(quietRow.status, "SUPPRESSED");
      assert.equal(quietRow.lastErrorCode, "quiet");

      await db.notificationPreference.update({
        where: { userId_facilityId: { userId: quietUser.id, facilityId: facility.id } },
        data: { quietEnabled: false, updateDigestEnabled: true },
      });
      const digestNotice = await db.notification.create({
        data: {
          facilityId: facility.id,
          kind: "OPERATIONAL",
          category: "publication",
          priority: "UPDATE",
          sourceType: "publication_attempt",
          sourceId: `digest-${suffix}`,
          title: "Hidden title",
          body: "Hidden body",
          dedupeKey: `push-digest-${suffix}`,
          occurredAt: now,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: null } },
        },
      });
      const digestRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: digestNotice.id,
          userId: quietUser.id,
          reason: "DEPARTMENT_MANAGER",
          explanation: "Digest",
        },
      });
      await enqueuePushForNewRecipient(db, { recipientId: digestRecipient.id, now });
      const digestRow = await db.pushDispatch.findFirstOrThrow({
        where: { notificationRecipientId: digestRecipient.id },
      });
      assert.equal(digestRow.status, "SUPPRESSED");
      assert.equal(digestRow.lastErrorCode, "digest_selected");

      const snoozed = await db.notification.create({
        data: {
          facilityId: facility.id,
          kind: "OPERATIONAL",
          category: "maintenance",
          priority: "NEEDS_ATTENTION",
          sourceType: "issue",
          sourceId: `snooze-${suffix}`,
          title: "Hidden title",
          body: "Hidden body",
          dedupeKey: `push-snooze-${suffix}`,
          requiresAcknowledgement: true,
          occurredAt: now,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } },
        },
      });
      const snoozedRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: snoozed.id,
          userId: user.id,
          reason: "DEPARTMENT_MANAGER",
          explanation: "Snoozed",
          snoozedUntil: new Date(now.getTime() + 60_000),
        },
      });
      await enqueuePushForNewRecipient(db, { recipientId: snoozedRecipient.id, now });
      const snoozeRows = await db.pushDispatch.findMany({ where: { notificationRecipientId: snoozedRecipient.id } });
      assert.equal(snoozeRows.length, 3);
      assert.equal(snoozeRows.every((row) => row.status === "SUPPRESSED" && row.lastErrorCode === "snoozed"), true);

      await db.notification.update({ where: { id: snoozed.id }, data: { priority: "URGENT", metadata: { protected: true, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } } } });
      await db.notificationRecipient.update({ where: { id: snoozedRecipient.id }, data: { snoozedUntil: null } });
      await enqueuePriorityRiseIfStrict(db, {
        notificationId: snoozed.id,
        previous: "NEEDS_ATTENTION",
        next: "URGENT",
        now,
      });
      const roseSnooze = await db.pushDispatch.findFirstOrThrow({
        where: { triggerKey: priorityRiseTriggerKey(snoozedRecipient.id, "URGENT"), pushSubscriptionId: desktop.id },
      });
      assert.equal(roseSnooze.status, "QUEUED");
      assert.equal(snoozedRecipient.id.length > 0, true);

      await parkExcept(db, userIds, [roseSnooze.id]);
      const beforeEscalation = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
      const temporary = await db.pushDispatch.findFirstOrThrow({
        where: { id: roseSnooze.id },
      });
      let attempts = 0;
      const retryTransport: PushTransport = async () => {
        attempts += 1;
        return attempts === 1 ? { outcome: "temporary", code: "http" } : { outcome: "accepted" };
      };
      await deliverQueuedPushDispatches(db, { now, transport: retryTransport, limit: 5 });
      const retried = await db.pushDispatch.findUniqueOrThrow({ where: { id: temporary.id } });
      assert.equal(retried.status, "QUEUED");
      assert.equal(retried.attemptCount, 1);
      assert.equal(retried.lastErrorCode, "temporary");
      const later = new Date(now.getTime() + 20_000);
      await deliverQueuedPushDispatches(db, { now: later, transport: retryTransport, limit: 5 });
      const sentRetry = await db.pushDispatch.findUniqueOrThrow({ where: { id: temporary.id } });
      assert.equal(sentRetry.id, temporary.id);
      assert.equal(sentRetry.status, "SENT");
      assert.equal(sentRetry.attemptCount, 2);
      const afterRetry = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert.equal(afterRetry.escalatedAt, beforeEscalation.escalatedAt);
      assert.equal(afterRetry.priority, beforeEscalation.priority);
      const ack = await db.notificationRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
      assert.equal(ack.acknowledgedAt, null);

      const closed = await db.notification.create({
        data: {
          facilityId: facility.id,
          kind: "OPERATIONAL",
          category: "maintenance",
          priority: "NEEDS_ATTENTION",
          sourceType: "issue",
          sourceId: `closed-${suffix}`,
          title: "Hidden title",
          body: "Hidden body",
          dedupeKey: `push-closed-${suffix}`,
          requiresAcknowledgement: true,
          occurredAt: now,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } },
        },
      });
      const closedRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: closed.id,
          userId: user.id,
          reason: "DEPARTMENT_MANAGER",
          explanation: "Closing",
        },
      });
      await enqueuePushForNewRecipient(db, { recipientId: closedRecipient.id, now });
      await db.notification.update({ where: { id: closed.id }, data: { resolvedAt: now } });
      const closedIds = (
        await db.pushDispatch.findMany({ where: { notificationRecipientId: closedRecipient.id }, select: { id: true } })
      ).map((row) => row.id);
      await parkExcept(db, userIds, closedIds);
      const closedCalls: string[] = [];
      await deliverQueuedPushDispatches(db, {
        now,
        limit: 20,
        transport: async () => {
          closedCalls.push("sent");
          return { outcome: "accepted" };
        },
      });
      assert.equal(closedCalls.length, 0);
      const closedRows = await db.pushDispatch.findMany({ where: { notificationRecipientId: closedRecipient.id } });
      assert.equal(closedRows.every((row) => row.status === "SUPPRESSED"), true);

      const removed = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: quietUser.id,
          reason: "WORK_ORDER_ASSIGNEE",
          explanation: "Former assignee",
        },
      });
      await subscribe(db, quietUser.id, suffix, "assignee");
      await enqueuePushForNewRecipient(db, { recipientId: removed.id, now });
      assert.ok((await db.pushDispatch.count({ where: { notificationRecipientId: removed.id } })) >= 1);
      await db.notificationDelivery.deleteMany({ where: { notificationRecipientId: removed.id } });
      await db.notificationRecipient.delete({ where: { id: removed.id } });
      assert.equal(await db.pushDispatch.count({ where: { notificationRecipientId: removed.id } }), 0);

      const goneSub = await subscribe(db, user.id, suffix, "gone");
      const goneRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: user.id,
          reason: "ASSET_OWNER",
          explanation: "Gone endpoint",
        },
      });
      await enqueuePushForNewRecipient(db, { recipientId: goneRecipient.id, now: later });
      const goneDispatch = await db.pushDispatch.findFirstOrThrow({ where: { pushSubscriptionId: goneSub.id } });
      await parkExcept(db, userIds, [goneDispatch.id]);
      await deliverQueuedPushDispatches(db, {
        now: later,
        limit: 5,
        transport: async (input) => (input.endpoint.endsWith("/gone") ? { outcome: "gone" } : { outcome: "accepted" }),
      });
      const goneAfter = await db.pushSubscription.findUniqueOrThrow({ where: { id: goneSub.id } });
      assert.equal(goneAfter.revokedReason, "GONE");
      const goneRow = await db.pushDispatch.findUniqueOrThrow({ where: { id: goneDispatch.id } });
      assert.equal(goneRow.status, "FAILED");
      const afterGone = await deliverQueuedPushDispatches(db, {
        now: later,
        transport: rejectingTransport(),
        limit: 5,
      });
      assert.equal(afterGone.sent, 0);

      const invalidSub = await subscribe(db, user.id, suffix, "invalid");
      const invalidRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: user.id,
          reason: "ESCALATION_TARGET",
          explanation: "Invalid request",
        },
      });
      await enqueuePushForNewRecipient(db, { recipientId: invalidRecipient.id, now: later });
      const invalidDispatch = await db.pushDispatch.findFirstOrThrow({ where: { pushSubscriptionId: invalidSub.id } });
      await parkExcept(db, userIds, [invalidDispatch.id]);
      await deliverQueuedPushDispatches(db, {
        now: later,
        limit: 5,
        transport: async () => ({ outcome: "invalid", code: "invalid" }),
      });
      const invalidAfter = await db.pushSubscription.findUniqueOrThrow({ where: { id: invalidSub.id } });
      assert.equal(invalidAfter.revokedAt, null);
      const invalidRow = await db.pushDispatch.findUniqueOrThrow({ where: { id: invalidDispatch.id } });
      assert.equal(invalidRow.status, "FAILED");
      assert.equal(invalidRow.lastErrorCode, "invalid");

      const unsafe = await db.pushSubscription.create({
        data: {
          userId: user.id,
          endpoint: `https://127.0.0.1/push/${suffix}`,
          p256dh: "B".repeat(40),
          auth: "C".repeat(22),
          authorizedSessionVersion: 0,
          authorizedUntil: new Date("2099-01-01T00:00:00.000Z"),
        },
      });
      const unsafeRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: user.id,
          reason: "FACILITY_ADMIN",
          explanation: "Unsafe",
        },
      });
      await db.pushDispatch.create({
        data: {
          notificationRecipientId: unsafeRecipient.id,
          pushSubscriptionId: unsafe.id,
          triggerKey: recipientAddedTriggerKey(unsafeRecipient.id),
          status: "QUEUED",
          queuedAt: later,
          expiresAt: new Date(later.getTime() + 15 * 60 * 1000),
        },
      });
      await parkExcept(
        db,
        userIds,
        (
          await db.pushDispatch.findMany({ where: { pushSubscriptionId: unsafe.id }, select: { id: true } })
        ).map((row) => row.id),
      );
      let unsafeCalls = 0;
      await deliverQueuedPushDispatches(db, {
        now: later,
        limit: 5,
        transport: async () => {
          unsafeCalls += 1;
          return { outcome: "accepted" };
        },
      });
      assert.equal(unsafeCalls, 0);
      const unsafeRow = await db.pushSubscription.findUniqueOrThrow({ where: { id: unsafe.id } });
      assert.equal(unsafeRow.revokedReason, "UNAUTHORIZED");

      await db.userFacilityAccess.update({ where: { id: access.id }, data: { isActive: false } });
      const foreign = await db.notification.create({
        data: {
          facilityId: other.id,
          kind: "OPERATIONAL",
          category: "maintenance",
          priority: "NEEDS_ATTENTION",
          sourceType: "issue",
          sourceId: `other-${suffix}`,
          title: "Other facility",
          body: "Other facility",
          dedupeKey: `push-other-${suffix}`,
          requiresAcknowledgement: true,
          occurredAt: later,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } },
        },
      });
      await db.userFacilityAccess.create({ data: { userId: user.id, facilityId: other.id, isActive: true } });
      const foreignRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: foreign.id,
          userId: user.id,
          reason: "DEPARTMENT_MANAGER",
          explanation: "Other",
        },
      });
      const home = phone.id;
      await enqueuePushForNewRecipient(db, { recipientId: foreignRecipient.id, now: later });
      await db.userFacilityAccess.updateMany({
        where: { userId: user.id, facilityId: other.id },
        data: { isActive: false },
      });
      await parkExcept(
        db,
        userIds,
        (
          await db.pushDispatch.findMany({
            where: { notificationRecipientId: foreignRecipient.id },
            select: { id: true },
          })
        ).map((row) => row.id),
      );
      let foreignCalls = 0;
      await deliverQueuedPushDispatches(db, {
        now: later,
        limit: 10,
        transport: async () => {
          foreignCalls += 1;
          return { outcome: "accepted" };
        },
      });
      assert.equal(foreignCalls, 0);
      const foreignRows = await db.pushDispatch.findMany({ where: { notificationRecipientId: foreignRecipient.id } });
      assert.equal(foreignRows.every((row) => row.status === "SUPPRESSED" && row.lastErrorCode === "facility_access"), true);
      assert.equal(home.length > 0, true);

      const stale = await db.pushDispatch.create({
        data: {
          notificationRecipientId: recipient.id,
          pushSubscriptionId: desktop.id,
          triggerKey: "recipient-added:stale-history",
          status: "QUEUED",
          queuedAt: new Date(now.getTime() - 60 * 60 * 1000),
          expiresAt: new Date(now.getTime() - 1000),
        },
      });
      let staleCalls = 0;
      delete process.env.WEB_PUSH_SENDING_ENABLED;
      await deliverQueuedPushDispatches(db, {
        now,
        transport: async () => {
          staleCalls += 1;
          return { outcome: "accepted" };
        },
      });
      process.env.WEB_PUSH_SENDING_ENABLED = "true";
      const staleRow = await db.pushDispatch.findUniqueOrThrow({ where: { id: stale.id } });
      assert.equal(staleRow.status, "FAILED");
      assert.equal(staleRow.lastErrorCode, "expired");
      assert.equal(staleCalls, 0);

      const configRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: quietUser.id,
          reason: "DEPARTMENT_MANAGER",
          explanation: "Config",
        },
      });
      const configSub = await subscribe(db, quietUser.id, suffix, "config");
      await db.pushDispatch.create({
        data: {
          notificationRecipientId: configRecipient.id,
          pushSubscriptionId: configSub.id,
          triggerKey: recipientAddedTriggerKey(configRecipient.id),
          status: "QUEUED",
          queuedAt: later,
          expiresAt: new Date(later.getTime() + 15 * 60 * 1000),
        },
      });
      const savedPublic = process.env.VAPID_PUBLIC_KEY;
      const savedPrivate = process.env.VAPID_PRIVATE_KEY;
      const savedSubject = process.env.VAPID_SUBJECT;
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      delete process.env.VAPID_SUBJECT;
      const blocked = await deliverQueuedPushDispatches(db, { now: later, limit: 5 });
      if (savedPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = savedPublic;
      if (savedPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
      else process.env.VAPID_PRIVATE_KEY = savedPrivate;
      if (savedSubject === undefined) delete process.env.VAPID_SUBJECT;
      else process.env.VAPID_SUBJECT = savedSubject;
      assert.equal(blocked.stopped, "configuration");
      const configRow = await db.pushDispatch.findFirstOrThrow({ where: { pushSubscriptionId: configSub.id } });
      assert.equal(configRow.status, "QUEUED");
      const configSubAfter = await db.pushSubscription.findUniqueOrThrow({ where: { id: configSub.id } });
      assert.equal(configSubAfter.revokedAt, null);

      const claimSub = await subscribe(db, user.id, suffix, "claim");
      const claimRecipient = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: user.id,
          reason: "ON_DUTY_SUPERVISOR",
          explanation: "Claim",
        },
      });
      await db.userFacilityAccess.update({ where: { id: access.id }, data: { isActive: true } });
      await db.pushDispatch.create({
        data: {
          notificationRecipientId: claimRecipient.id,
          pushSubscriptionId: claimSub.id,
          triggerKey: recipientAddedTriggerKey(claimRecipient.id),
          status: "QUEUED",
          queuedAt: later,
          expiresAt: new Date(later.getTime() + 15 * 60 * 1000),
        },
      });
      const claimRow = await db.pushDispatch.findFirstOrThrow({ where: { pushSubscriptionId: claimSub.id } });
      await parkExcept(db, userIds, [claimRow.id]);
      let claimCalls = 0;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let opened: () => void = () => undefined;
      const openedGate = new Promise<void>((resolve) => {
        opened = resolve;
      });
      const firstPass = deliverQueuedPushDispatches(db, {
        now: later,
        limit: 1,
        transport: async () => {
          claimCalls += 1;
          opened();
          await gate;
          return { outcome: "accepted" };
        },
      });
      await openedGate;
      const secondPass = await deliverQueuedPushDispatches(db, {
        now: later,
        limit: 1,
        transport: async () => {
          claimCalls += 1;
          return { outcome: "accepted" };
        },
      });
      assert.equal(secondPass.sent, 0);
      assert.equal(claimCalls, 1);
      release();
      const firstResult = await firstPass;
      assert.equal(firstResult.sent, 1);
      assert.equal(claimCalls, 1);
    });
  } finally {
    await db.notificationDelivery.deleteMany({ where: { notificationRecipient: { userId: { in: userIds } } } });
    await db.notificationRecipient.deleteMany({ where: { userId: { in: userIds } } });
    await db.notification.deleteMany({ where: { facility: { organizationId: { in: orgIds } } } });
    await db.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
    await db.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.facility.deleteMany({ where: { organizationId: { in: orgIds } } });
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    await db.$disconnect();
  }
});

test("reconciliation and escalation add a push opportunity for the new recipient", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const now = at("20:00");
  const userIds: string[] = [];
  let orgId = "";
  let departmentId = "";
  try {
    await withSending(async () => {
      for (const key of Object.values(RoleKey)) {
        await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
      }
      const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
      const staffRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.STAFF } });
      const org = await db.organization.create({ data: { name: `Push duty ${suffix}` } });
      orgId = org.id;
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `Push Duty ${suffix}`, timezone: zone },
      });
      const dietary = await db.department.create({
        data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
      });
      departmentId = dietary.id;
      const kitchen = await db.unit.create({
        data: { facilityId: facility.id, name: `Kitchen ${suffix}`, unitType: "KITCHEN" },
      });
      const space = await db.unitSpace.create({
        data: { facilityId: facility.id, unitId: kitchen.id, name: `Dining ${suffix}`, spaceType: "SERVICE_AREA" },
      });

      async function person(label: string, role: "MANAGER" | "STAFF") {
        const user = await db.user.create({
          data: {
            email: `push-duty-${label}-${suffix}@example.test`,
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
            firstName: "Push",
            lastName: label,
            roleType: role === "MANAGER" ? RoleKey.MANAGER : RoleKey.STAFF,
            primaryDepartmentId: dietary.id,
          },
        });
        return { userId: user.id, employeeId: employee.id };
      }

      const alpha = await person("alpha", "STAFF");
      const beta = await person("beta", "STAFF");
      const head = await person("head", "MANAGER");
      await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: head.employeeId } });
      await db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          employeeId: beta.employeeId,
          serviceDate: facilityLocalDateToServiceDate(day),
          roleKey: "DIETARY_ON_CALL_COVERAGE",
          roleLabel: "On-Call Coverage",
          status: "PLANNED",
          startsAt: at("19:00"),
          endsAt: at("23:00"),
        },
      });
      await subscribe(db, beta.userId, suffix, "beta");
      await subscribe(db, head.userId, suffix, "head");
      const sourceId = JSON.stringify(["coverage", facility.id, day, dietary.id, space.id, `episode-${suffix}`]);
      const notice = await db.notification.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          kind: "OPERATIONAL",
          category: "coverage",
          priority: "NEEDS_ATTENTION",
          sourceType: "coverage_responsibility",
          sourceId,
          title: "Coverage title stays off the lock screen",
          body: "Coverage body stays off the lock screen",
          dedupeKey: `push-duty-${suffix}`,
          requiresAcknowledgement: true,
          occurredAt: now,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: "ON_CALL_RESPONDER" } },
        },
      });
      await db.notificationRecipient.create({
        data: {
          notificationId: notice.id,
          userId: alpha.userId,
          reason: "ON_CALL_RESPONDER",
          explanation: "Earlier duty",
        },
      });
      const gained = await evaluateResponsibilityReconciliation({ db, now, facilityIds: [facility.id] });
      assert.equal(gained.transitions, 1);
      const betaRecipient = await db.notificationRecipient.findFirstOrThrow({
        where: { notificationId: notice.id, userId: beta.userId, reason: "ON_CALL_RESPONDER" },
      });
      const betaDispatch = await db.pushDispatch.findMany({ where: { notificationRecipientId: betaRecipient.id } });
      assert.equal(betaDispatch.length, 1);
      assert.equal(betaDispatch[0]?.status, "QUEUED");
      assert.equal(betaDispatch[0]?.triggerKey, recipientAddedTriggerKey(betaRecipient.id));

      await db.notification.update({
        where: { id: notice.id },
        data: {
          createdAt: new Date(now.getTime() - 30 * 60 * 1000),
          escalationDueAt: new Date(now.getTime() - 60 * 1000),
          escalationPolicyVersion: "notifications-n4c-v1",
        },
      });
      const escalated = await evaluateAcknowledgementEscalation({ db, now, facilityIds: [facility.id] });
      assert.equal(escalated.transitions, 1);
      const manager = await db.notificationRecipient.findFirstOrThrow({
        where: { notificationId: notice.id, userId: head.userId, reason: "DEPARTMENT_MANAGER" },
      });
      const managerDispatch = await db.pushDispatch.findMany({ where: { notificationRecipientId: manager.id } });
      assert.equal(managerDispatch.length, 1);
      assert.equal(managerDispatch[0]?.triggerKey, recipientAddedTriggerKey(manager.id));
      const thread = await db.notification.findUniqueOrThrow({ where: { id: notice.id } });
      assert.equal(thread.priority, "NEEDS_ATTENTION");
      assert.ok(thread.escalatedAt);
    });
  } finally {
    if (departmentId) await db.department.update({ where: { id: departmentId }, data: { headEmployeeId: null } }).catch(() => undefined);
    await db.notificationDelivery.deleteMany({ where: { notificationRecipient: { userId: { in: userIds } } } });
    await db.notificationRecipient.deleteMany({ where: { userId: { in: userIds } } });
    await db.notification.deleteMany({ where: { facility: { organizationId: orgId || undefined } } });
    await db.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
    await db.operationalAssignment.deleteMany({ where: { employee: { userId: { in: userIds } } } });
    await db.employee.deleteMany({ where: { userId: { in: userIds } } });
    await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { userId: { in: userIds } } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (orgId) {
      await db.unitSpaceResponsibility.deleteMany({ where: { department: { facility: { organizationId: orgId } } } }).catch(() => undefined);
      await db.unitSpace.deleteMany({ where: { unit: { facility: { organizationId: orgId } } } }).catch(() => undefined);
      await db.unit.deleteMany({ where: { facility: { organizationId: orgId } } }).catch(() => undefined);
      await db.department.deleteMany({ where: { facility: { organizationId: orgId } } }).catch(() => undefined);
      await db.facility.deleteMany({ where: { organizationId: orgId } });
      await db.organization.deleteMany({ where: { id: orgId } });
    }
    await db.$disconnect();
  }
});

test("a revoked or expired authorization is not sent, and an in-flight send cannot be recalled", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const now = new Date("2026-11-04T18:00:00.000Z");
  const orgIds: string[] = [];
  const userIds: string[] = [];
  try {
    await withSending(async () => {
      const org = await db.organization.create({ data: { name: `Authz ${suffix}` } });
      orgIds.push(org.id);
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `Authz Terrace ${suffix}`, timezone: zone },
      });
      const user = await db.user.create({
        data: {
          email: `authz-send-${suffix}@example.test`,
          displayName: "Authz",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      userIds.push(user.id);
      await db.userFacilityAccess.create({ data: { userId: user.id, facilityId: facility.id, isActive: true } });
      const notification = await db.notification.create({
        data: {
          facilityId: facility.id,
          kind: "OPERATIONAL",
          category: "maintenance",
          priority: "NEEDS_ATTENTION",
          sourceType: "issue",
          sourceId: `authz-${suffix}`,
          title: "Private title",
          body: "Private body",
          dedupeKey: `authz-${suffix}`,
          requiresAcknowledgement: true,
          occurredAt: now,
          policyVersion: "notifications-n1b-v1",
          metadata: { protected: false, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } },
        },
      });
      const recipient = await db.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: user.id,
          reason: "DEPARTMENT_MANAGER",
          explanation: "Department head",
        },
      });
      const live = await subscribe(db, user.id, suffix, "live");
      const stale = await db.pushSubscription.create({
        data: {
          userId: user.id,
          endpoint: `https://push.example.test/${suffix}/stale`,
          p256dh: "B".repeat(40),
          auth: "C".repeat(22),
        },
      });
      const expired = await db.pushSubscription.create({
        data: {
          userId: user.id,
          endpoint: `https://push.example.test/${suffix}/expired`,
          p256dh: "D".repeat(40),
          auth: "E".repeat(22),
          authorizedSessionVersion: 1,
          authorizedUntil: now,
        },
      });
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      await db.pushDispatch.create({
        data: {
          notificationRecipientId: recipient.id,
          pushSubscriptionId: stale.id,
          triggerKey: `authz-stale-${suffix}`,
          expiresAt,
        },
      });
      await db.pushDispatch.create({
        data: {
          notificationRecipientId: recipient.id,
          pushSubscriptionId: expired.id,
          triggerKey: `authz-expired-${suffix}`,
          expiresAt,
        },
      });
      let calls = 0;
      const closed = await deliverQueuedPushDispatches(db, {
        now,
        limit: 10,
        transport: async () => {
          calls += 1;
          return { outcome: "accepted" };
        },
      });
      assert.equal(calls, 0);
      assert.equal(closed.sent, 0);
      assert.equal(closed.suppressed, 2);
      const staleRow = await db.pushDispatch.findFirstOrThrow({ where: { pushSubscriptionId: stale.id } });
      const expiredRow = await db.pushDispatch.findFirstOrThrow({ where: { pushSubscriptionId: expired.id } });
      assert.equal(staleRow.status, "SUPPRESSED");
      assert.equal(staleRow.lastErrorCode, "authorization_unbound");
      assert.equal(expiredRow.lastErrorCode, "authorization_expired");

      const queued = await db.pushDispatch.create({
        data: {
          notificationRecipientId: recipient.id,
          pushSubscriptionId: live.id,
          triggerKey: `authz-live-${suffix}`,
          expiresAt,
        },
      });
      await revokeAllPushSubscriptionsForUser(db, { userId: user.id, now });
      const blocked = await deliverQueuedPushDispatches(db, {
        now,
        limit: 10,
        transport: async () => {
          calls += 1;
          return { outcome: "accepted" };
        },
      });
      assert.equal(calls, 0);
      assert.equal(blocked.sent, 0);
      assert.equal(blocked.suppressed, 1);
      assert.equal((await db.pushDispatch.findUniqueOrThrow({ where: { id: queued.id } })).lastErrorCode, "subscription_revoked");
      assert.equal(await db.notificationRecipient.count({ where: { id: recipient.id } }), 1);
      const again = await deliverQueuedPushDispatches(db, {
        now,
        limit: 10,
        transport: async () => {
          calls += 1;
          return { outcome: "accepted" };
        },
      });
      assert.equal(again.sent, 0);
      assert.equal(calls, 0);

      await db.pushSubscription.update({
        where: { id: live.id },
        data: { revokedAt: null, revokedReason: null, authorizedUntil: new Date("2099-01-01T00:00:00.000Z") },
      });
      await db.pushDispatch.update({
        where: { id: queued.id },
        data: { status: "QUEUED", claimedUntil: null, lastErrorCode: null, attemptCount: 0 },
      });
      const raced = await deliverQueuedPushDispatches(db, {
        now,
        limit: 5,
        beforeSend: async () => {
          await revokeAllPushSubscriptionsForUser(db, { userId: user.id, now });
        },
        transport: async () => {
          calls += 1;
          return { outcome: "accepted" };
        },
      });
      assert.equal(calls, 0);
      assert.equal(raced.suppressed, 1);
      assert.equal((await db.pushDispatch.findUniqueOrThrow({ where: { id: queued.id } })).status, "SUPPRESSED");

      await db.pushSubscription.update({
        where: { id: live.id },
        data: { revokedAt: null, revokedReason: null, authorizedUntil: new Date("2099-01-01T00:00:00.000Z") },
      });
      await db.pushDispatch.update({
        where: { id: queued.id },
        data: { status: "QUEUED", claimedUntil: null, lastErrorCode: null, attemptCount: 0 },
      });
      const inflight = await deliverQueuedPushDispatches(db, {
        now,
        limit: 5,
        transport: async () => {
          calls += 1;
          await revokeAllPushSubscriptionsForUser(db, { userId: user.id, now });
          return { outcome: "accepted" };
        },
      });
      assert.equal(calls, 1);
      assert.equal(inflight.sent, 1);
      assert.equal((await db.pushDispatch.findUniqueOrThrow({ where: { id: queued.id } })).status, "SENT");
      assert.equal(await db.notificationRecipient.count({ where: { notificationId: notification.id } }), 1);
    });
  } finally {
    await db.pushDispatch.deleteMany({ where: { notificationRecipient: { userId: { in: userIds } } } });
    await db.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
    await db.notificationRecipient.deleteMany({ where: { userId: { in: userIds } } });
    await db.notification.deleteMany({ where: { facility: { organizationId: { in: orgIds } } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (orgIds.length > 0) {
      await db.facility.deleteMany({ where: { organizationId: { in: orgIds } } });
      await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await db.$disconnect();
  }
});

async function parkExcept(db: PrismaClient, userIds: string[], keepIds: string[]) {
  await db.pushDispatch.updateMany({
    where: {
      status: { in: ["QUEUED", "SENDING"] },
      id: { notIn: keepIds },
      notificationRecipient: { userId: { in: userIds } },
    },
    data: { status: "SUPPRESSED", lastErrorCode: "parked" },
  });
}

function rejectingTransport(): PushTransport {
  return async () => {
    throw new Error("push transport should not be called");
  };
}

async function subscribe(db: PrismaClient, userId: string, suffix: string, name: string) {
  return db.pushSubscription.create({
    data: {
      userId,
      endpoint: `https://push.example.test/${suffix}/${name}`,
      p256dh: "B".repeat(40),
      auth: "C".repeat(22),
      authorizedSessionVersion: 0,
      authorizedUntil: new Date("2099-01-01T00:00:00.000Z"),
    },
  });
}
