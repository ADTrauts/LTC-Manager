/**
 * Notification click facility handoff.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { resolveAttentionClick } from "./attention-click";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

test("a click focuses the current facility and switches only with existing access", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomBytes(4).toString("hex");
  const orgIds: string[] = [];
  const userIds: string[] = [];
  try {
    const org = await db.organization.create({ data: { name: `Click ${suffix}` } });
    orgIds.push(org.id);
    const facilityA = await db.facility.create({
      data: { organizationId: org.id, displayName: `Click A ${suffix}`, timezone: "America/New_York" },
    });
    const facilityB = await db.facility.create({
      data: { organizationId: org.id, displayName: `Click B ${suffix}`, timezone: "America/New_York" },
    });
    const user = await db.user.create({
      data: {
        email: `click-user-${suffix}@example.test`,
        displayName: "Click User",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    userIds.push(user.id);
    const outsider = await db.user.create({
      data: {
        email: `click-out-${suffix}@example.test`,
        displayName: "Click Outsider",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    userIds.push(outsider.id);
    await db.userFacilityAccess.createMany({
      data: [
        { userId: user.id, facilityId: facilityA.id, isActive: true },
        { userId: user.id, facilityId: facilityB.id, isActive: true },
        { userId: outsider.id, facilityId: facilityA.id, isActive: true },
      ],
    });
    const notification = await db.notification.create({
      data: {
        facilityId: facilityB.id,
        kind: "OPERATIONAL",
        category: "maintenance",
        priority: "NEEDS_ATTENTION",
        sourceType: "asset",
        sourceId: `asset-${suffix}`,
        title: "Private title",
        body: "Private body",
        dedupeKey: `click-${suffix}`,
        requiresAcknowledgement: true,
        occurredAt: new Date("2026-11-04T12:00:00.000Z"),
        policyVersion: "notifications-n1b-v1",
        metadata: { protected: false },
      },
    });
    await db.notificationRecipient.create({
      data: {
        notificationId: notification.id,
        userId: user.id,
        reason: "DEPARTMENT_MANAGER",
        explanation: "Department head",
      },
    });

    const switched = await resolveAttentionClick(db, {
      userId: user.id,
      facilityId: facilityA.id,
      attentionId: notification.id,
    });
    assert.deepEqual(switched, {
      kind: "switch",
      contextKey: `facility_internal:${facilityB.id}`,
      next: `/notifications?attention=${encodeURIComponent(notification.id)}`,
    });

    const focused = await resolveAttentionClick(db, {
      userId: user.id,
      facilityId: facilityB.id,
      attentionId: notification.id,
    });
    assert.deepEqual(focused, { kind: "focus", notificationId: notification.id });

    const blocked = await resolveAttentionClick(db, {
      userId: outsider.id,
      facilityId: facilityA.id,
      attentionId: notification.id,
    });
    assert.deepEqual(blocked, { kind: "unavailable" });

    await db.userFacilityAccess.update({
      where: { userId_facilityId: { userId: user.id, facilityId: facilityB.id } },
      data: { isActive: false, revokedAt: new Date("2026-11-04T13:00:00.000Z") },
    });
    const denied = await resolveAttentionClick(db, {
      userId: user.id,
      facilityId: facilityA.id,
      attentionId: notification.id,
    });
    assert.deepEqual(denied, { kind: "denied" });

    const stored = await db.notification.findUniqueOrThrow({ where: { id: notification.id } });
    assert.equal(stored.priority, "NEEDS_ATTENTION");
    assert.equal(stored.resolvedAt, null);
    const recipient = await db.notificationRecipient.findFirstOrThrow({
      where: { notificationId: notification.id, userId: user.id },
    });
    assert.equal(recipient.acknowledgedAt, null);
    assert.equal(recipient.readAt, null);
  } finally {
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
