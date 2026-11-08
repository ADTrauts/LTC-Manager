/**
 * SQL-backed N1A intake tests.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";

import { enqueueNotificationEvent, type NotificationIntake } from "./outbox";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
const skipReason = databaseUrl
  ? false
  : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(4).toString("hex");
}

function intake(input: {
  facilityId: string;
  departmentId?: string | null;
  dedupeKey: string;
  payload?: Prisma.InputJsonValue;
}): NotificationIntake {
  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "coverage.became_at_risk",
    aggregateType: "coverage_slot",
    aggregateId: "slot-1",
    occurredAt: new Date("2026-10-29T11:05:00.000Z"),
    payload: input.payload ?? { condition: "AT_RISK", priority: "NEEDS_ATTENTION" },
    dedupeKey: input.dedupeKey,
  };
}

test("notification intake: uniqueness, facility scope, user recipient, no downstream rows", { skip: skipReason }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const tag = suffix();
  const facilityIds: string[] = [];
  const userIds: string[] = [];
  let orgId: string | null = null;

  try {
    const org = await db.organization.create({ data: { name: `N1A ${tag}` } });
    orgId = org.id;
    const [facilityA, facilityB] = await Promise.all(
      ["a", "b"].map((key) =>
        db.facility.create({
          data: { organizationId: org.id, displayName: `N1A ${key} ${tag}` },
        }),
      ),
    );
    facilityIds.push(facilityA.id, facilityB.id);
    const department = await db.department.create({
      data: { facilityId: facilityA.id, key: "DIETARY", name: "Food and Nutrition" },
    });
    const user = await db.user.create({
      data: { email: `n1a-${tag}@example.test`, displayName: `N1A ${tag}` },
    });
    userIds.push(user.id);
    const employee = await db.employee.create({
      data: {
        facilityId: facilityA.id,
        firstName: "Pin",
        lastName: "Only",
        roleType: "STAFF",
      },
    });

    const coverageBefore = await db.operationalAssignmentTemplate.count();
    const supportBefore = await db.supportStaffNotification.count();
    const dedupeKey = `intake-${tag}`;

    await assert.rejects(
      () => enqueueNotificationEvent(db, intake({ facilityId: facilityA.id, dedupeKey })),
      /transaction client/,
    );
    assert.equal(await db.notificationOutbox.count({ where: { facilityId: facilityA.id } }), 0);

    const first = await db.$transaction((tx) =>
      enqueueNotificationEvent(
        tx,
        intake({
          facilityId: facilityA.id,
          departmentId: department.id,
          dedupeKey,
          payload: { condition: "AT_RISK" },
        }),
      ),
    );
    assert.equal(first.outcome, "created");

    const second = await db.$transaction((tx) =>
      enqueueNotificationEvent(
        tx,
        intake({
          facilityId: facilityA.id,
          departmentId: department.id,
          dedupeKey,
          payload: { condition: "UNCOVERED" },
        }),
      ),
    );
    assert.equal(second.outcome, "duplicate");
    assert.equal(second.id, first.id);

    const stored = await db.notificationOutbox.findUniqueOrThrow({
      where: { id: first.id },
    });
    assert.deepEqual(stored.payload, { condition: "AT_RISK" });
    assert.equal(stored.departmentId, department.id);
    assert.equal(stored.processedAt, null);
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: facilityA.id, dedupeKey } }),
      1,
    );

    const otherFacility = await db.$transaction((tx) =>
      enqueueNotificationEvent(tx, intake({ facilityId: facilityB.id, dedupeKey })),
    );
    assert.equal(otherFacility.outcome, "created");
    assert.notEqual(otherFacility.id, first.id);

    const racedKey = `race-${tag}`;
    const raced = await Promise.all([
      db.$transaction((tx) =>
        enqueueNotificationEvent(tx, intake({ facilityId: facilityA.id, dedupeKey: racedKey })),
      ),
      db.$transaction((tx) =>
        enqueueNotificationEvent(tx, intake({ facilityId: facilityA.id, dedupeKey: racedKey })),
      ),
    ]);
    assert.equal(raced.filter((result) => result.outcome === "created").length, 1);
    assert.equal(raced.filter((result) => result.outcome === "duplicate").length, 1);
    assert.equal(raced[0].id, raced[1].id);
    assert.equal(
      await db.notificationOutbox.count({ where: { facilityId: facilityA.id, dedupeKey: racedKey } }),
      1,
    );

    assert.equal(await db.notification.count({ where: { facilityId: { in: facilityIds } } }), 0);
    assert.equal(await db.notificationRecipient.count({ where: { userId: user.id } }), 0);
    assert.equal(
      await db.notificationDelivery.count({
        where: { notificationRecipient: { userId: user.id } },
      }),
      0,
    );
    assert.equal(await db.operationalAssignmentTemplate.count(), coverageBefore);
    assert.equal(await db.supportStaffNotification.count(), supportBefore);

    const thread = await db.notification.create({
      data: {
        facilityId: facilityA.id,
        departmentId: department.id,
        kind: "OPERATIONAL",
        category: "coverage",
        priority: "NEEDS_ATTENTION",
        sourceType: "coverage_slot",
        sourceId: "slot-1",
        title: "Coverage needs attention",
        body: "1B breakfast",
        dedupeKey: `thread-${tag}`,
        policyVersion: "n1a-fixture",
        occurredAt: new Date("2026-10-29T11:05:00.000Z"),
      },
    });
    const recipient = await db.notificationRecipient.create({
      data: {
        notificationId: thread.id,
        userId: user.id,
        reason: "ON_DUTY_SUPERVISOR",
        explanation: "Fixture recipient. Resolver is not implemented.",
      },
    });
    const recipientFk = await db.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'NotificationRecipient_userId_fkey'
    `;
    assert.equal(recipientFk.length, 1);
    assert.match(recipientFk[0]!.definition, /REFERENCES "User"\(id\)/);
    assert.doesNotMatch(recipientFk[0]!.definition, /Employee/);

    const columns = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'NotificationRecipient'
    `;
    assert.equal(
      columns.some((column) => column.column_name === "employeeId"),
      false,
    );

    await assert.rejects(
      () =>
        db.notificationRecipient.create({
          data: {
            notificationId: thread.id,
            userId: employee.id,
            reason: "CURRENT_ASSIGNEE",
            explanation: "Employee ids are not recipients",
          },
        }),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
    );
    assert.equal(await db.notificationRecipient.count({ where: { notificationId: thread.id } }), 1);

    await db.notificationDelivery.create({
      data: {
        notificationRecipientId: recipient.id,
        channel: "IN_APP",
        status: "QUEUED",
      },
    });
    await assert.rejects(
      () =>
        db.notificationDelivery.create({
          data: {
            notificationRecipientId: recipient.id,
            channel: "IN_APP",
            status: "QUEUED",
          },
        }),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );
  } finally {
    await db.notificationDelivery.deleteMany({
      where: { notificationRecipient: { notification: { facilityId: { in: facilityIds } } } },
    });
    await db.notificationRecipient.deleteMany({
      where: { notification: { facilityId: { in: facilityIds } } },
    });
    await db.notification.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.notificationOutbox.deleteMany({ where: { facilityId: { in: facilityIds } } });
    if (userIds.length > 0) {
      await db.employee.deleteMany({ where: { facilityId: { in: facilityIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await db.department.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
    if (orgId) await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await db.$disconnect();
  }
});
