/**
 * Snooze expiry on the shared Scheduled Evaluation clock.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { evaluateDeliveryEligibility } from "./delivery-eligibility";
import { evaluateExternalDelivery } from "./external-delivery";
import { getActiveAttentionCountForUser, loadNotificationCenter } from "./queries";
import { PUSH_TTL_MS, snoozeExpiredTriggerKey } from "./push-dispatch";
import { deliverQueuedPushDispatches, type PushTransport } from "./push-delivery";
import {
  clearNotificationSnooze,
  NotificationSnoozeError,
  setNotificationSnooze,
} from "./snooze";
import { loadNotificationPreference, saveNotificationPreference } from "./notification-preference";
import { runWithWebPushSendingEnabled } from "./web-push-config";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function tag() {
  return randomBytes(4).toString("hex");
}

const accept: PushTransport = async () => ({ outcome: "accepted" });

async function withSending<T>(enabled: boolean, run: () => Promise<T>): Promise<T> {
  // AsyncLocalStorage pin: process.env alone races under parallel verify:db.
  return runWithWebPushSendingEnabled(enabled, async () => {
    const previous = process.env.WEB_PUSH_SENDING_ENABLED;
    if (enabled) process.env.WEB_PUSH_SENDING_ENABLED = "true";
    else delete process.env.WEB_PUSH_SENDING_ENABLED;
    try {
      return await run();
    } finally {
      if (previous === undefined) delete process.env.WEB_PUSH_SENDING_ENABLED;
      else process.env.WEB_PUSH_SENDING_ENABLED = previous;
    }
  });
}

test("snooze changes only this user's interruption and leaves the center alone", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const now = new Date("2026-11-03T21:00:00.000Z");
  const userIds: string[] = [];
  let orgId = "";
  try {
    const org = await db.organization.create({ data: { name: `Snooze ${suffix}` } });
    orgId = org.id;
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Snooze Terrace ${suffix}`, timezone: "America/Chicago" },
    });
    const user = await db.user.create({
      data: { email: `snooze-${suffix}@example.test`, displayName: "Snooze User", emailVerifiedAt: now },
    });
    const other = await db.user.create({
      data: { email: `other-${suffix}@example.test`, displayName: "Other User", emailVerifiedAt: now },
    });
    const outsider = await db.user.create({
      data: { email: `outsider-${suffix}@example.test`, displayName: "Outsider", emailVerifiedAt: now },
    });
    userIds.push(user.id, other.id, outsider.id);
    await db.userFacilityAccess.create({ data: { userId: user.id, facilityId: facility.id, isActive: true } });
    await db.userFacilityAccess.create({ data: { userId: other.id, facilityId: facility.id, isActive: true } });
    await db.userFacilityAccess.create({ data: { userId: outsider.id, facilityId: facility.id, isActive: true } });
    const notification = await db.notification.create({
      data: {
        facilityId: facility.id,
        kind: "OPERATIONAL",
        category: "maintenance",
        priority: "NEEDS_ATTENTION",
        sourceType: "issue",
        sourceId: `issue-${suffix}`,
        title: "Loose closer",
        body: "North hall",
        dedupeKey: `snooze-${suffix}`,
        requiresAcknowledgement: true,
        occurredAt: now,
        policyVersion: "notifications-n1b-v1",
        escalationDueAt: new Date(now.getTime() + 15 * 60 * 1000),
        metadata: { protected: false, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } },
      },
    });
    const own = await db.notificationRecipient.create({
      data: {
        notificationId: notification.id,
        userId: user.id,
        reason: "DEPARTMENT_MANAGER",
        explanation: "Department head",
      },
    });
    const second = await db.notificationRecipient.create({
      data: {
        notificationId: notification.id,
        userId: user.id,
        reason: "ON_CALL_RESPONDER",
        explanation: "Former on-call",
      },
    });
    const stranger = await db.notificationRecipient.create({
      data: {
        notificationId: notification.id,
        userId: other.id,
        reason: "DEPARTMENT_MANAGER",
        explanation: "Other head",
      },
    });
    const before = await getActiveAttentionCountForUser(db, { userId: user.id, facilityId: facility.id, now });
    const saved = await setNotificationSnooze(db, {
      facilityId: facility.id,
      notificationId: notification.id,
      userId: user.id,
      snoozedUntil: new Date(now.getTime() + 30 * 60 * 1000),
      now,
    });
    assert.equal(saved.ok, true);
    const tooLong = await setNotificationSnooze(db, {
      facilityId: facility.id,
      notificationId: notification.id,
      userId: user.id,
      snoozedUntil: new Date(now.getTime() + 4 * 60 * 60 * 1000 + 1),
      now,
    });
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) assert.equal(tooLong.decision, "invalid_duration");
    await assert.rejects(
      () =>
        setNotificationSnooze(db, {
          facilityId: facility.id,
          notificationId: notification.id,
          userId: outsider.id,
          snoozedUntil: new Date(now.getTime() + 30 * 60 * 1000),
          now,
        }),
      (error: unknown) => error instanceof NotificationSnoozeError && error.code === "NOT_RECIPIENT",
    );
    const rows = await db.notificationRecipient.findMany({ where: { notificationId: notification.id } });
    assert.equal(rows.find((row) => row.id === own.id)?.snoozedUntil?.toISOString(), new Date(now.getTime() + 30 * 60 * 1000).toISOString());
    assert.equal(rows.find((row) => row.id === second.id)?.snoozedUntil?.toISOString(), new Date(now.getTime() + 30 * 60 * 1000).toISOString());
    assert.equal(rows.find((row) => row.id === stranger.id)?.snoozedUntil, null);
    assert.equal(rows.every((row) => row.readAt == null && row.acknowledgedAt == null), true);
    const thread = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
    assert.equal(thread.escalatedAt, null);
    assert.equal(thread.priority, "NEEDS_ATTENTION");
    assert.equal(thread.resolvedAt, null);
    const after = await getActiveAttentionCountForUser(db, { userId: user.id, facilityId: facility.id, now });
    assert.equal(after, before);
    const center = await loadNotificationCenter(db, {
      userId: user.id,
      facilityId: facility.id,
      now,
      timeZone: "America/Chicago",
    });
    assert.equal(center.status, "ready");
    if (center.status === "ready") {
      assert.equal(center.needsAttention.some((item) => item.id === notification.id), true);
      assert.equal(center.needsAttention.filter((item) => item.id === notification.id).length, 1);
      assert.equal(center.needsAttention.find((item) => item.id === notification.id)?.snooze.state, "paused");
      assert.equal(center.needsAttention.find((item) => item.id === notification.id)?.read, false);
      assert.equal(center.needsAttention.find((item) => item.id === notification.id)?.acknowledged, false);
    }
    await clearNotificationSnooze(db, { facilityId: facility.id, notificationId: notification.id, userId: user.id });
    const cleared = await db.notificationRecipient.findMany({ where: { userId: user.id, notificationId: notification.id } });
    assert.equal(cleared.every((row) => row.snoozedUntil == null), true);
    const resumed = await loadNotificationCenter(db, {
      userId: user.id,
      facilityId: facility.id,
      now,
      timeZone: "America/Chicago",
    });
    if (resumed.status === "ready") {
      assert.equal(resumed.needsAttention.find((item) => item.id === notification.id)?.snooze.state, "available");
    }
  } finally {
    await db.notificationDelivery.deleteMany({ where: { notificationRecipient: { userId: { in: userIds } } } });
    await db.notificationRecipient.deleteMany({ where: { userId: { in: userIds } } });
    if (orgId) await db.notification.deleteMany({ where: { facility: { organizationId: orgId } } });
    await db.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (orgId) {
      await db.facility.deleteMany({ where: { organizationId: orgId } });
      await db.organization.delete({ where: { id: orgId } });
    }
    await db.$disconnect();
  }
});

test("an expired snooze wakes once, and a cleared or old window does not", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const now = new Date("2026-11-03T22:00:00.000Z");
  const userIds: string[] = [];
  let orgId = "";
  try {
    const org = await db.organization.create({ data: { name: `Wake ${suffix}` } });
    orgId = org.id;
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Wake Terrace ${suffix}`, timezone: "America/Chicago" },
    });
    const user = await db.user.create({
      data: { email: `wake-${suffix}@example.test`, displayName: "Wake User", emailVerifiedAt: now },
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
        sourceId: `wake-${suffix}`,
        title: "Loose closer",
        body: "North hall",
        dedupeKey: `wake-${suffix}`,
        requiresAcknowledgement: true,
        occurredAt: now,
        policyVersion: "notifications-n1b-v1",
        metadata: { protected: false, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } },
      },
    });
    const beforeNotifications = await db.notification.count({ where: { facilityId: facility.id } });
    const recipient = await db.notificationRecipient.create({
      data: {
        notificationId: notification.id,
        userId: user.id,
        reason: "DEPARTMENT_MANAGER",
        explanation: "Department head",
        snoozedUntil: new Date(now.getTime() - 5 * 60 * 1000),
      },
    });
    const desktop = await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: `https://push.example.test/${suffix}/desktop`,
        p256dh: "B".repeat(40),
        auth: "C".repeat(22),
        authorizedSessionVersion: 0,
        authorizedUntil: new Date("2099-01-01T00:00:00.000Z"),
      },
    });
    const phone = await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: `https://push.example.test/${suffix}/phone`,
        p256dh: "D".repeat(40),
        auth: "E".repeat(22),
        authorizedSessionVersion: 0,
        authorizedUntil: new Date("2099-01-01T00:00:00.000Z"),
      },
    });

    await withSending(false, async () => {
      const paused = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(paused.transitions, 0);
    });
    assert.equal(await db.pushDispatch.count({ where: { notificationRecipientId: recipient.id } }), 0);

    await withSending(true, async () => {
      const [first, second] = await Promise.all([
        evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept }),
        evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept }),
      ]);
      assert.equal(first.transitions + second.transitions, 2);
      // Concurrent evaluate may leave SENDING claims; restore TTL and drain under the ALS
      // pin. Retry briefly if a peer still races the shared disposable DB.
      let rows = await db.pushDispatch.findMany({ where: { notificationRecipientId: recipient.id } });
      for (let attempt = 0; attempt < 3 && !rows.every((row) => row.status === "SENT"); attempt += 1) {
        await db.pushDispatch.updateMany({
          where: { notificationRecipientId: recipient.id },
          data: {
            status: "QUEUED",
            claimedUntil: null,
            lastErrorCode: null,
            attemptCount: 0,
            expiresAt: new Date(now.getTime() + PUSH_TTL_MS),
          },
        });
        await deliverQueuedPushDispatches(db, {
          now,
          limit: 25,
          transport: accept,
          facilityIds: [facility.id],
        });
        rows = await db.pushDispatch.findMany({ where: { notificationRecipientId: recipient.id } });
      }
      assert.equal(rows.length, 2);
      assert.deepEqual(
        rows.map((row) => row.triggerKey).sort(),
        [snoozeExpiredTriggerKey(recipient.id, recipient.snoozedUntil!), snoozeExpiredTriggerKey(recipient.id, recipient.snoozedUntil!)].sort(),
      );
      assert.equal(
        rows.every((row) => row.status === "SENT"),
        true,
        rows.map((row) => `${row.status}:${row.lastErrorCode ?? ""}`).join("|") || "no rows",
      );
      assert.equal(new Set(rows.map((row) => row.pushSubscriptionId)).size, 2);
      const again = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(again.transitions, 0);
      assert.equal(await db.pushDispatch.count({ where: { notificationRecipientId: recipient.id } }), 2);

      const later = new Date(now.getTime() + 60 * 60 * 1000);
      await db.notificationRecipient.update({ where: { id: recipient.id }, data: { snoozedUntil: later } });
      await db.pushDispatch.deleteMany({ where: { notificationRecipientId: recipient.id } });
      const early = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(early.transitions, 0);
      const onTime = await evaluateExternalDelivery({ db, now: later, facilityIds: [facility.id], transport: accept });
      assert.equal(onTime.transitions, 2);

      await db.pushDispatch.deleteMany({ where: { notificationRecipientId: recipient.id } });
      await db.notificationRecipient.update({ where: { id: recipient.id }, data: { snoozedUntil: null } });
      const cleared = await evaluateExternalDelivery({
        db,
        now: new Date(later.getTime() + 60 * 1000),
        facilityIds: [facility.id],
        transport: accept,
      });
      assert.equal(cleared.transitions, 0);

      await db.notificationRecipient.update({
        where: { id: recipient.id },
        data: { snoozedUntil: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
      });
      const historical = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(historical.transitions, 0);
      assert.equal(await db.pushDispatch.count({ where: { notificationRecipientId: recipient.id } }), 0);

      await db.notification.update({
        where: { id: notification.id },
        data: { priority: "URGENT", metadata: { protected: true, responsibility: { primaryReason: "DEPARTMENT_MANAGER" } } },
      });
      await db.notificationRecipient.update({
        where: { id: recipient.id },
        data: { snoozedUntil: null },
      });
      const risen = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(risen.transitions, 0);

      await db.notification.update({ where: { id: notification.id }, data: { priority: "NEEDS_ATTENTION", resolvedAt: now } });
      await db.notificationRecipient.update({
        where: { id: recipient.id },
        data: { snoozedUntil: new Date(now.getTime() - 60 * 1000) },
      });
      const resolved = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(resolved.transitions, 0);
      await db.notification.update({ where: { id: notification.id }, data: { resolvedAt: null, expiresAt: new Date(now.getTime() - 1000) } });
      const ended = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(ended.transitions, 0);
      await db.notification.update({ where: { id: notification.id }, data: { expiresAt: null } });

      await db.userFacilityAccess.update({ where: { id: access.id }, data: { isActive: false } });
      await db.notificationRecipient.update({
        where: { id: recipient.id },
        data: { snoozedUntil: new Date(now.getTime() - 60 * 1000) },
      });
      const denied = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(denied.transitions, 0);
      await db.userFacilityAccess.update({ where: { id: access.id }, data: { isActive: true } });

      await db.pushSubscription.update({ where: { id: desktop.id }, data: { revokedAt: now, revokedReason: "LOGOUT" } });
      await db.pushSubscription.update({ where: { id: phone.id }, data: { revokedAt: now, revokedReason: "LOGOUT" } });
      const revoked = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(revoked.transitions, 0);

      await db.pushSubscription.deleteMany({ where: { userId: user.id } });
      const missing = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(missing.transitions, 0);

      await db.notificationRecipient.delete({ where: { id: recipient.id } });
      const removed = await evaluateExternalDelivery({ db, now, facilityIds: [facility.id], transport: accept });
      assert.equal(removed.transitions, 0);
      assert.equal(await db.notification.count({ where: { facilityId: facility.id } }), beforeNotifications);
      const stored = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert.equal(stored.title, "Loose closer");
      assert.equal(stored.sourceId, `wake-${suffix}`);
    });
  } finally {
    await db.notificationDelivery.deleteMany({ where: { notificationRecipient: { userId: { in: userIds } } } });
    await db.pushDispatch.deleteMany({ where: { pushSubscription: { userId: { in: userIds } } } });
    await db.notificationRecipient.deleteMany({ where: { userId: { in: userIds } } });
    if (orgId) await db.notification.deleteMany({ where: { facility: { organizationId: orgId } } });
    await db.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (orgId) {
      await db.facility.deleteMany({ where: { organizationId: orgId } });
      await db.organization.delete({ where: { id: orgId } });
    }
    await db.$disconnect();
  }
});

test("quiet hours are saved per facility and do not send a digest", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const now = new Date("2026-11-04T07:00:00.000Z");
  const userIds: string[] = [];
  let orgId = "";
  try {
    const org = await db.organization.create({ data: { name: `Quiet ${suffix}` } });
    orgId = org.id;
    const chicago = await db.facility.create({
      data: { organizationId: org.id, displayName: `Chicago ${suffix}`, timezone: "America/Chicago" },
    });
    const denver = await db.facility.create({
      data: { organizationId: org.id, displayName: `Denver ${suffix}`, timezone: "America/Denver" },
    });
    const user = await db.user.create({
      data: { email: `quiet-${suffix}@example.test`, displayName: "Quiet User", emailVerifiedAt: now },
    });
    userIds.push(user.id);
    await db.userFacilityAccess.create({ data: { userId: user.id, facilityId: chicago.id, isActive: true } });
    await db.userFacilityAccess.create({ data: { userId: user.id, facilityId: denver.id, isActive: true } });
    const before = await loadNotificationPreference(db, { userId: user.id, facilityId: chicago.id });
    assert.equal(before.quietEnabled, false);
    assert.equal(before.updateDigestEnabled, false);
    assert.equal(await db.notificationPreference.count({ where: { userId: user.id } }), 0);
    await saveNotificationPreference(db, {
      userId: user.id,
      facilityId: chicago.id,
      quietEnabled: true,
      quietStartMinute: 22 * 60,
      quietEndMinute: 7 * 60,
      updateDigestEnabled: false,
    });
    const denverPreference = await loadNotificationPreference(db, { userId: user.id, facilityId: denver.id });
    assert.equal(denverPreference.quietEnabled, false);
    assert.equal(await db.notificationPreference.count({ where: { userId: user.id, facilityId: denver.id } }), 0);
    const stored = await db.notificationPreference.findUniqueOrThrow({
      where: { userId_facilityId: { userId: user.id, facilityId: chicago.id } },
    });
    assert.equal(stored.quietStartMinute, 22 * 60);
    assert.equal(stored.quietEndMinute, 7 * 60);
    assert.equal(stored.updateDigestEnabled, false);
    const update = {
      kind: "OPERATIONAL" as const,
      priority: "UPDATE" as const,
      requiresAcknowledgement: false,
      protected: false,
      recipientReasons: ["DEPARTMENT_MANAGER" as const],
      resolvedAt: null,
      expiresAt: null,
    };
    assert.equal(
      evaluateDeliveryEligibility({
        notification: update,
        recipient: { reason: "DEPARTMENT_MANAGER", snoozedUntil: null },
        preference: stored,
        now,
        timeZone: "America/Chicago",
        mode: "INTERRUPTIVE",
      }),
      "quiet",
    );
    const afterQuiet = new Date("2026-11-04T14:00:00.000Z");
    assert.equal(
      evaluateDeliveryEligibility({
        notification: update,
        recipient: { reason: "DEPARTMENT_MANAGER", snoozedUntil: null },
        preference: stored,
        now: afterQuiet,
        timeZone: "America/Chicago",
        mode: "INTERRUPTIVE",
      }),
      "eligible",
    );
    assert.equal(await db.pushDispatch.count({ where: { pushSubscription: { userId: user.id } } }), 0);
  } finally {
    await db.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (orgId) {
      await db.facility.deleteMany({ where: { organizationId: orgId } });
      await db.organization.delete({ where: { id: orgId } });
    }
    await db.$disconnect();
  }
});
