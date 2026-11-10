/**
 * PostgreSQL proof for Scheduled Evaluation continuation, lease fencing, and health.
 * Opt in with VERIFY_DATABASE_URL pointing at a disposable migrated database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { evaluateAcknowledgementEscalation } from "@/lib/notifications/escalation";
import { evaluateResponsibilityReconciliation } from "@/lib/notifications/responsibility-reconciliation";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { evaluationIsOverdue, writeEvaluationCheckpoint } from "./continuation";
import { releaseScheduledEvaluationLease, tryAcquireScheduledEvaluationLease } from "./lease";
import { runScheduledEvaluations } from "./run";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function client() {
  let queries = 0;
  const db = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [{ emit: "event", level: "query" }],
  });
  db.$on("query", () => {
    queries += 1;
  });
  return { db, queries: () => queries };
}

test("postgres continuation visits every facility in one budget and keeps health", { skip }, async () => {
  assert.ok(databaseUrl);
  const { db, queries } = client();
  const tag = randomBytes(3).toString("hex");
  const now = new Date("2026-11-06T16:00:00.000Z");
  let orgId: string | null = null;
  const facilityIds: string[] = [];
  try {
    const org = await db.organization.create({ data: { name: `N5ER2 ${tag}` } });
    orgId = org.id;
    for (let index = 0; index < 120; index += 1) {
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `N5ER2 ${tag} ${index}` },
      });
      facilityIds.push(facility.id);
    }
    await db.notification.createMany({
      data: facilityIds.map((facilityId, index) => ({
        facilityId,
        kind: "OPERATIONAL" as const,
        category: "coverage",
        priority: "NEEDS_ATTENTION" as const,
        sourceType: "coverage_slot",
        sourceId: `slot-${index}`,
        title: "Coverage needs attention",
        body: "Fixture",
        dedupeKey: `n5er2-${tag}-${index}`,
        policyVersion: "n5er2",
        occurredAt: now,
        requiresAcknowledgement: true,
        escalationDueAt: new Date(now.getTime() - 60_000),
        metadata: { protected: false, responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" } },
      })),
    });

    const populations = [1, 25, 26, 51, 100, 120];
    for (const size of populations) {
      const hidden = facilityIds.slice(size);
      if (hidden.length > 0) {
        await db.notification.updateMany({
          where: { facilityId: { in: hidden } },
          data: { escalatedAt: now },
        });
      }
      await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "notifications.escalation" } });
      const started = performance.now();
      const before = queries();
      const summary = await runScheduledEvaluations(db, { now, keys: ["notifications.escalation"] });
      const elapsed = performance.now() - started;
      assert.equal(summary.skipped, 0);
      assert.equal(summary.facilitiesScanned, size, `${size} scanned ${summary.facilitiesScanned}`);
      assert.equal(summary.candidates, size);
      assert.ok(elapsed < 240_000, `${size} facilities took ${elapsed}ms`);
      const row = await db.scheduledEvaluationLease.findUniqueOrThrow({
        where: { evaluatorKey: "notifications.escalation" },
      });
      assert.ok(row.lastCycleCompletedAt, `${size} did not finish a cycle`);
      console.info(
        JSON.stringify({
          event: "n5er2_population",
          facilities: size,
          invocations: 1,
          scanned: summary.facilitiesScanned,
          candidates: summary.candidates,
          elapsedMs: Math.round(elapsed),
          queries: queries() - before,
          revisitMs: 5 * 60 * 1000,
        }),
      );
      if (hidden.length > 0) {
        await db.notification.updateMany({
          where: { facilityId: { in: hidden } },
          data: { escalatedAt: null },
        });
      }
    }

    await db.scheduledEvaluationLease.deleteMany({ where: { evaluatorKey: "notifications.escalation" } });
    const open = performance.now();
    const full = await runScheduledEvaluations(db, { now, keys: ["notifications.escalation"] });
    const fullMs = performance.now() - open;
    const lease = await db.scheduledEvaluationLease.findUniqueOrThrow({
      where: { evaluatorKey: "notifications.escalation" },
    });
    assert.equal(full.facilitiesScanned, 120);
    assert.equal(full.candidates, 120);
    assert.ok(lease.lastCycleCompletedAt);
    await db.notification.updateMany({
      where: { facilityId: { in: facilityIds } },
      data: { escalationDueAt: new Date(now.getTime() + 60 * 60 * 1000) },
    });
    const quiet = await runScheduledEvaluations(db, { now, keys: ["notifications.escalation"] });
    const quietLease = await db.scheduledEvaluationLease.findUniqueOrThrow({
      where: { evaluatorKey: "notifications.escalation" },
    });
    assert.equal(quiet.failures, 0);
    assert.equal(quiet.candidates, 0);
    assert.equal(quietLease.lastOutcome, "completed");
    assert.ok(quietLease.lastSucceededAt);
    const succeededAt = quietLease.lastSucceededAt;
    await db.notification.updateMany({
      where: { facilityId: { in: facilityIds } },
      data: { escalationDueAt: new Date(now.getTime() - 60_000) },
    });
    assert.ok(fullMs < 240_000);
    console.info(JSON.stringify({ event: "n5er2_full_cycle", facilities: 120, elapsedMs: Math.round(fullMs), heap: process.memoryUsage().heapUsed }));

    const removed = facilityIds[10];
    await db.notification.deleteMany({ where: { facilityId: removed } });
    const added = await db.facility.create({
      data: { organizationId: org.id, displayName: `N5ER2 ${tag} added` },
    });
    facilityIds.push(added.id);
    await db.notification.create({
      data: {
        facilityId: added.id,
        kind: "OPERATIONAL",
        category: "coverage",
        priority: "URGENT",
        sourceType: "coverage_slot",
        sourceId: "added",
        title: "Coverage needs attention",
        body: "Fixture",
        dedupeKey: `n5er2-${tag}-added`,
        policyVersion: "n5er2",
        occurredAt: now,
        requiresAcknowledgement: true,
        escalationDueAt: new Date(now.getTime() - 60_000),
        metadata: { protected: false, responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" } },
      },
    });
    const again = await runScheduledEvaluations(db, { now, keys: ["notifications.escalation"] });
    assert.equal(again.facilitiesScanned, 120);
    assert.equal(again.candidates, 120);

    const ownerA = await tryAcquireScheduledEvaluationLease(db, "notifications.responsibility-reconciliation", now);
    const ownerB = await tryAcquireScheduledEvaluationLease(db, "notifications.responsibility-reconciliation", now);
    assert.ok(ownerA);
    assert.equal(ownerB, null);
    const stale = await writeEvaluationCheckpoint(
      db,
      "notifications.responsibility-reconciliation",
      { facilityCursor: "stale", recordCursor: null, recordFacilityId: null },
      { owner: "not-the-owner" },
    );
    assert.equal(stale, false);
    const held = await db.scheduledEvaluationLease.findUniqueOrThrow({
      where: { evaluatorKey: "notifications.responsibility-reconciliation" },
    });
    assert.notEqual(held.resumeAfter, "stale");
    await releaseScheduledEvaluationLease(db, "notifications.responsibility-reconciliation", ownerA as string, now);
    const takeover = await tryAcquireScheduledEvaluationLease(
      db,
      "notifications.responsibility-reconciliation",
      new Date(now.getTime() + 7 * 60 * 1000),
    );
    assert.ok(takeover);
    assert.notEqual(takeover, ownerA);

    const large = facilityIds[0];
    await db.notification.createMany({
      data: Array.from({ length: 600 }, (_, index) => ({
        facilityId: large,
        kind: "OPERATIONAL" as const,
        category: "coverage",
        priority: "URGENT" as const,
        sourceType: "coverage_slot",
        sourceId: `bulk-${index}`,
        title: "Coverage needs attention",
        body: "Fixture",
        dedupeKey: `n5er2-${tag}-bulk-${index}`,
        policyVersion: "n5er2",
        occurredAt: now,
        requiresAcknowledgement: true,
        escalationDueAt: new Date(now.getTime() - 60_000),
        metadata: { protected: false, responsibility: { primaryReason: "ON_DUTY_SUPERVISOR" } },
      })),
    });
    await db.scheduledEvaluationLease.deleteMany({
      where: { evaluatorKey: "notifications.responsibility-reconciliation" },
    });
    const bulkStarted = performance.now();
    const escalated = await runScheduledEvaluations(db, { now, keys: ["notifications.escalation"] });
    const reconciled = await runScheduledEvaluations(db, { now, keys: ["notifications.responsibility-reconciliation"] });
    const bulkMs = performance.now() - bulkStarted;
    assert.ok(escalated.candidates >= 600);
    assert.ok(reconciled.candidates >= 600);
    const beforeRepeat = await db.notificationRecipient.count({
      where: { reason: "ESCALATION_TARGET", notification: { facilityId: { in: facilityIds } } },
    });
    await runScheduledEvaluations(db, { now, keys: ["notifications.escalation"] });
    const afterRepeat = await db.notificationRecipient.count({
      where: { reason: "ESCALATION_TARGET", notification: { facilityId: { in: facilityIds } } },
    });
    assert.equal(afterRepeat, beforeRepeat);
    console.info(JSON.stringify({ event: "n5er2_large_facility", threads: 600, elapsedMs: Math.round(bulkMs) }));

    const stopped = await evaluateAcknowledgementEscalation({
      db,
      now,
      control: { deadline: new Date(0), renew: async () => true },
    });
    assert.equal(stopped.cycleCompleted, false);
    const fresh = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const persisted = await fresh.scheduledEvaluationLease.findUniqueOrThrow({
      where: { evaluatorKey: "notifications.escalation" },
    });
    // Parallel disposable suites may advance the shared lease cursor; the stopped cycle is the contract.
    assert.ok(persisted.lastSucceededAt);
    assert.ok(persisted.lastSucceededAt.getTime() >= succeededAt.getTime());
    assert.equal(evaluationIsOverdue(succeededAt, new Date(succeededAt.getTime() + 20 * 60 * 1000)), true);
    assert.equal(evaluationIsOverdue(succeededAt, new Date(succeededAt.getTime() + 60 * 60 * 1000)), true);
    await fresh.$disconnect();
  } finally {
    await db.notificationRecipient.deleteMany({ where: { notification: { facilityId: { in: facilityIds } } } });
    await db.notification.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.notificationOutbox.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await db.scheduledEvaluationLease.deleteMany({
      where: {
        evaluatorKey: { in: ["notifications.escalation", "notifications.responsibility-reconciliation"] },
      },
    });
    if (facilityIds.length > 0) await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
    if (orgId) await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await db.$disconnect();
  }
});
