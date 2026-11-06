import assert from "node:assert/strict";
import test from "node:test";

import { NotificationKind, NotificationPriority, NotificationRecipientReason } from "@prisma/client";

import { evaluateAcknowledgementEscalation } from "@/lib/notifications/escalation";
import { enqueueSnoozeExpiryWake, SNOOZE_WAKE_HORIZON_MS } from "@/lib/notifications/push-dispatch";
import {
  deliverQueuedPushDispatches,
  PUSH_CLAIM_LEASE_MS,
  PUSH_MAX_ATTEMPTS,
  PUSH_TTL_SECONDS,
  pushRetryEligibility,
} from "@/lib/notifications/push-delivery";

import {
  SCHEDULED_EVALUATION_CADENCE_MS,
  SCHEDULED_EVALUATION_EXECUTION_BUDGET_MS,
  SCHEDULED_EVALUATION_FACILITY_BATCH,
  SCHEDULED_EVALUATION_LEASE_MS,
  SCHEDULED_EVALUATION_OVERDUE_MS,
} from "./cadence";
import { evaluationIsOverdue, takeFacilityBatch } from "./continuation";
import { handleScheduledEvaluationCron } from "./cron";
import {
  recordEvaluatorHealth,
  releaseScheduledEvaluationLease,
  renewScheduledEvaluationLease,
  tryAcquireScheduledEvaluationLease,
} from "./lease";
import { processScheduledEvaluationOutbox } from "./run";
import type { ScheduledEvaluationDb } from "./types";

const FACILITY_BATCH = SCHEDULED_EVALUATION_FACILITY_BATCH;

function ids(count: number, width = 2): string[] {
  return Array.from({ length: count }, (_, index) => `f${String(index + 1).padStart(width, "0")}`);
}

test("facility 26 is reached on the next successful pass and 51 stay fair", () => {
  const twentySix = ids(26);
  const first = takeFacilityBatch(twentySix, null, FACILITY_BATCH);
  const second = takeFacilityBatch(twentySix, first.nextCursor, FACILITY_BATCH);
  const third = takeFacilityBatch(twentySix, second.nextCursor, FACILITY_BATCH);
  assert.equal(first.ids.length, 25);
  assert.deepEqual(second.ids, ["f26"]);
  assert.equal(third.ids[0], "f01");
  assert.equal(second.ids.includes("f26"), true);

  const fiftyOne = ids(51, 3);
  const visits = new Map<string, number>();
  let cursor: string | null = null;
  for (let pass = 0; pass < 6; pass += 1) {
    const batch = takeFacilityBatch(fiftyOne, cursor, FACILITY_BATCH);
    for (const id of batch.ids) visits.set(id, (visits.get(id) ?? 0) + 1);
    cursor = batch.nextCursor;
  }
  assert.equal(visits.size, 51);
  const counts = [...visits.values()];
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);

  const withNewcomer = [...fiftyOne, "f052"].sort();
  const afterOutage = takeFacilityBatch(withNewcomer, "f040", FACILITY_BATCH);
  assert.equal(afterOutage.ids.includes("f052"), true);
  assert.equal(afterOutage.ids.includes("f040"), false);
});

test("missed ticks keep the cursor and reevaluate the current time", () => {
  const facilities = ids(26);
  const first = takeFacilityBatch(facilities, null, FACILITY_BATCH);
  const afterOneMiss = takeFacilityBatch(facilities, first.nextCursor, FACILITY_BATCH);
  const afterTwoMisses = takeFacilityBatch(facilities, first.nextCursor, FACILITY_BATCH);
  assert.deepEqual(afterOneMiss.ids, ["f26"]);
  assert.deepEqual(afterTwoMisses.ids, afterOneMiss.ids);
  const success = new Date("2026-11-05T12:00:00.000Z");
  assert.equal(evaluationIsOverdue(success, new Date(success.getTime() + SCHEDULED_EVALUATION_CADENCE_MS)), false);
  assert.equal(evaluationIsOverdue(success, new Date(success.getTime() + 20 * 60 * 1000)), true);
  assert.equal(evaluationIsOverdue(success, new Date(success.getTime() + 60 * 60 * 1000)), true);
  const duringOutage = [...facilities, "f27"].sort();
  const resumed = takeFacilityBatch(duringOutage, first.nextCursor, FACILITY_BATCH);
  assert.deepEqual(resumed.ids, ["f26", "f27"]);
});

test("a failing facility does not freeze the cursor, and a crash retries the unfinished tail", () => {
  const list = ids(6);
  let cursor: string | null = null;
  const batch = takeFacilityBatch(list, cursor, 4);
  const completed = batch.ids.slice(0, 2);
  cursor = completed.at(-1) ?? null;
  const resumed = takeFacilityBatch(list, cursor, 4);
  assert.deepEqual(completed, ["f01", "f02"]);
  assert.deepEqual(resumed.ids, ["f03", "f04", "f05", "f06"]);
  const afterFailure = takeFacilityBatch(list, "f03", 4);
  assert.equal(afterFailure.ids.includes("f03"), false);
  assert.equal(afterFailure.ids[0], "f04");
});

test("600 notification threads are evaluated without lifting the 500-per-pass cap", async () => {
  const threads = Array.from({ length: 600 }, (_, index) => ({
    id: `n${String(index + 1).padStart(4, "0")}`,
    facilityId: "fac-1",
  }));
  const seen = new Set<string>();
  const pages: number[] = [];
  const checkpoints = new Map<string, { resumeAfter: string | null; resumeFacilityId: string | null }>();
  const db = {
    notification: {
      findMany: async (args: {
        distinct?: string[];
        cursor?: { id: string };
        take?: number;
      }) => {
        if (args.distinct) return [{ facilityId: "fac-1" }];
        const after = args.cursor?.id ?? "";
        const page = threads.filter((row) => row.id > after).slice(0, args.take ?? 100);
        pages.push(page.length);
        for (const row of page) seen.add(row.id);
        return page;
      },
    },
    scheduledEvaluationLease: {
      findUnique: async ({ where }: { where: { evaluatorKey: string } }) =>
        checkpoints.get(where.evaluatorKey) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { evaluatorKey: string };
        data: { resumeAfter: string | null; resumeFacilityId: string | null };
      }) => {
        checkpoints.set(where.evaluatorKey, {
          resumeAfter: data.resumeAfter,
          resumeFacilityId: data.resumeFacilityId,
        });
      },
    },
  };
  const started = performance.now();
  const first = await evaluateAcknowledgementEscalation({
    db: db as unknown as ScheduledEvaluationDb,
    now: new Date("2026-11-05T12:00:00.000Z"),
  });
  const elapsedMs = performance.now() - started;
  assert.equal(first.facilitiesScanned, 1);
  assert.equal(pages.slice(0, 5).every((length) => length === 100), true);
  assert.ok(pages.length >= 6 && pages.length <= 8);
  assert.equal(seen.size, 600);
  assert.ok(elapsedMs < 2000, `600-thread scan took ${elapsedMs}ms`);
});

test("26 facilities are visited by the escalation evaluator within two passes", async () => {
  const facilities = ids(26);
  const visited: string[][] = [];
  const checkpoints = new Map<string, { resumeAfter: string | null; resumeFacilityId: string | null }>();
  const db = {
    notification: {
      findMany: async (args: { distinct?: string[]; where?: { facilityId?: string } }) => {
        if (args.distinct) return facilities.map((facilityId) => ({ facilityId }));
        const current = visited[visited.length - 1];
        if (args.where?.facilityId) current?.push(args.where.facilityId);
        return [];
      },
    },
    scheduledEvaluationLease: {
      findUnique: async ({ where }: { where: { evaluatorKey: string } }) =>
        checkpoints.get(where.evaluatorKey) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { evaluatorKey: string };
        data: { resumeAfter: string | null; resumeFacilityId: string | null };
      }) => {
        checkpoints.set(where.evaluatorKey, {
          resumeAfter: data.resumeAfter,
          resumeFacilityId: data.resumeFacilityId,
        });
      },
    },
  };
  const started = performance.now();
  visited.push([]);
  let renews = 0;
  await evaluateAcknowledgementEscalation({
    db: db as unknown as ScheduledEvaluationDb,
    now: new Date("2026-11-05T12:00:00.000Z"),
    control: {
      deadline: new Date(Date.now() + 60_000),
      renew: async () => {
        renews += 1;
        return renews < 2;
      },
    },
  });
  visited.push([]);
  await evaluateAcknowledgementEscalation({
    db: db as unknown as ScheduledEvaluationDb,
    now: new Date("2026-11-05T12:05:00.000Z"),
  });
  const elapsedMs = performance.now() - started;
  assert.deepEqual(visited[0], ids(26).slice(0, 25));
  assert.equal(visited[1]?.includes("f26"), true);
  assert.ok(elapsedMs < 1000, `26-facility rotation took ${elapsedMs}ms`);
});

type LeaseRow = { until: Date; owner: string };

function memoryLease() {
  const rows = new Map<string, LeaseRow>();
  const writes: string[] = [];
  const db = {
    $queryRaw: async (_query: TemplateStringsArray, key: string, until: Date, owner: string, _updated: Date, now: Date) => {
      const current = rows.get(key);
      if (!current || current.until.getTime() <= now.getTime()) {
        rows.set(key, { until, owner });
        return [{ evaluatorKey: key }];
      }
      return [];
    },
    $executeRaw: async (
      _query: TemplateStringsArray,
      until: Date,
      _now: Date,
      key: string,
      owner: string,
    ) => {
      const current = rows.get(key);
      if (!current || current.owner !== owner) return 0;
      current.until = until;
      return 1;
    },
    write(owner: string) {
      const current = [...rows.values()].find((row) => row.owner === owner);
      if (!current) return false;
      writes.push(owner);
      return true;
    },
  };
  return { db, rows, writes };
}

test("one owner holds the lease through a slow pass and a second worker does not write", async () => {
  const { db, writes } = memoryLease();
  const now = new Date("2026-11-05T12:00:00.000Z");
  const owner = await tryAcquireScheduledEvaluationLease(db as unknown as ScheduledEvaluationDb, "coverage.time-boundaries", now);
  assert.ok(owner);
  const simultaneous = await tryAcquireScheduledEvaluationLease(
    db as unknown as ScheduledEvaluationDb,
    "coverage.time-boundaries",
    now,
  );
  assert.equal(simultaneous, null);
  assert.equal(db.write(owner as string), true);
  assert.equal(db.write("other"), false);

  const renewed = await renewScheduledEvaluationLease(
    db as unknown as ScheduledEvaluationDb,
    "coverage.time-boundaries",
    owner as string,
    new Date(now.getTime() + 3 * 60 * 1000),
  );
  assert.equal(renewed, true);
  const duringSlowPass = await tryAcquireScheduledEvaluationLease(
    db as unknown as ScheduledEvaluationDb,
    "coverage.time-boundaries",
    new Date(now.getTime() + 3 * 60 * 1000),
  );
  assert.equal(duringSlowPass, null);
  assert.deepEqual(writes, [owner]);

  await releaseScheduledEvaluationLease(
    db as unknown as ScheduledEvaluationDb,
    "coverage.time-boundaries",
    owner as string,
    new Date(now.getTime() + 10_000),
  );
  const afterRelease = await tryAcquireScheduledEvaluationLease(
    db as unknown as ScheduledEvaluationDb,
    "coverage.time-boundaries",
    new Date(now.getTime() + 10_000),
  );
  assert.ok(afterRelease);
  assert.notEqual(afterRelease, owner);
});

test("an abandoned lease can be taken and a failed owner releases it", async () => {
  const { db, rows } = memoryLease();
  const now = new Date("2026-11-05T12:00:00.000Z");
  rows.set("key-points.overdue", { until: new Date(now.getTime() - 1000), owner: "abandoned" });
  const owner = await tryAcquireScheduledEvaluationLease(db as unknown as ScheduledEvaluationDb, "key-points.overdue", now);
  assert.ok(owner);
  assert.notEqual(rows.get("key-points.overdue")?.owner, "abandoned");
  await releaseScheduledEvaluationLease(db as unknown as ScheduledEvaluationDb, "key-points.overdue", owner as string, now);
  assert.equal(rows.get("key-points.overdue")?.until.getTime(), 0);
});

test("health keeps the last success when a later pass fails", async () => {
  const row: { lastSucceededAt: Date | null; lastOutcome: string | null; lastFailureCount: number } = {
    lastSucceededAt: null,
    lastOutcome: null,
    lastFailureCount: 0,
  };
  const db = {
    scheduledEvaluationLease: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if ("lastOutcome" in data) row.lastOutcome = data.lastOutcome as string;
        if ("lastFailureCount" in data) row.lastFailureCount = data.lastFailureCount as number;
        if ("lastSucceededAt" in data) row.lastSucceededAt = data.lastSucceededAt as Date;
      },
    },
  };
  const first = new Date("2026-11-05T12:00:00.000Z");
  await recordEvaluatorHealth(db as unknown as ScheduledEvaluationDb, {
    evaluatorKey: "work-orders.overdue",
    now: first,
    outcome: "completed",
    failures: 0,
  });
  await recordEvaluatorHealth(db as unknown as ScheduledEvaluationDb, {
    evaluatorKey: "work-orders.overdue",
    now: new Date(first.getTime() + SCHEDULED_EVALUATION_CADENCE_MS),
    outcome: "failed",
    failures: 2,
  });
  assert.equal(row.lastSucceededAt?.toISOString(), first.toISOString());
  assert.equal(row.lastOutcome, "failed");
  assert.equal(evaluationIsOverdue(null, first), true);
  assert.equal(evaluationIsOverdue(first, new Date(first.getTime() + SCHEDULED_EVALUATION_OVERDUE_MS)), false);
  assert.equal(evaluationIsOverdue(first, new Date(first.getTime() + SCHEDULED_EVALUATION_OVERDUE_MS + 1)), true);
  assert.ok(SCHEDULED_EVALUATION_EXECUTION_BUDGET_MS < SCHEDULED_EVALUATION_LEASE_MS);
});

test("the route reports unauthorized, unconfigured, success, and partial failure", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "reliability-test-secret";
  const url = "https://vssyl.example/api/internal/scheduled-evaluation";
  try {
    delete process.env.CRON_SECRET;
    const missing = await handleScheduledEvaluationCron(new Request(url), {} as never);
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).error, "cron_unconfigured");

    process.env.CRON_SECRET = "reliability-test-secret";
    const denied = await handleScheduledEvaluationCron(
      new Request(url, { headers: { authorization: "Bearer other" } }),
      {} as never,
    );
    assert.equal(denied.status, 401);

    const empty = emptyEvaluationDb();
    const ok = await handleScheduledEvaluationCron(
      new Request(url, { headers: { authorization: "Bearer reliability-test-secret" } }),
      empty.db as never,
    );
    const okBody = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(okBody.ok, true);
    assert.equal(okBody.failures, 0);
    assert.equal(empty.pass?.lastOutcome, "completed");

    empty.coverageThrows = true;
    const failed = await handleScheduledEvaluationCron(
      new Request(url, { headers: { authorization: "Bearer reliability-test-secret" } }),
      empty.db as never,
    );
    const failedBody = await failed.json();
    assert.equal(failed.status, 503);
    assert.equal(failedBody.error, "evaluation_incomplete");
    assert.equal(JSON.stringify(failedBody).includes("boom"), false);
    assert.equal(JSON.stringify(failedBody).includes("fac-"), false);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("outbox processing failures stay counted and do not invent a second thread", async () => {
  const failures = await processScheduledEvaluationOutbox({} as never, ["outbox-1"]);
  assert.equal(failures, 1);
});

test("push attempts stop at three and never cross the fifteen-minute TTL", () => {
  const queued = new Date("2026-11-05T12:00:00.000Z");
  const expires = new Date(queued.getTime() + PUSH_TTL_SECONDS * 1000);
  assert.equal(PUSH_MAX_ATTEMPTS, 3);
  assert.equal(PUSH_CLAIM_LEASE_MS, 20_000);
  assert.equal(PUSH_TTL_SECONDS, 15 * 60);
  assert.equal(SCHEDULED_EVALUATION_CADENCE_MS, 5 * 60 * 1000);

  const first = pushRetryEligibility({ attemptCount: 1, now: queued, expiresAt: expires });
  assert.equal(first.action, "retry");
  if (first.action === "retry") assert.equal(first.notBefore.toISOString(), new Date(queued.getTime() + 15_000).toISOString());

  const second = pushRetryEligibility({
    attemptCount: 2,
    now: new Date(queued.getTime() + SCHEDULED_EVALUATION_CADENCE_MS),
    expiresAt: expires,
  });
  assert.equal(second.action, "retry");

  const third = pushRetryEligibility({
    attemptCount: 3,
    now: new Date(queued.getTime() + 2 * SCHEDULED_EVALUATION_CADENCE_MS),
    expiresAt: expires,
  });
  assert.deepEqual(third, { action: "stop", reason: "attempts" });

  const atExpiry = pushRetryEligibility({ attemptCount: 1, now: expires, expiresAt: expires });
  assert.deepEqual(atExpiry, { action: "stop", reason: "expired" });

  const missed = pushRetryEligibility({
    attemptCount: 1,
    now: new Date(queued.getTime() + 10 * 60 * 1000),
    expiresAt: expires,
  });
  assert.equal(missed.action, "retry");
  const afterGap = pushRetryEligibility({
    attemptCount: 2,
    now: new Date(queued.getTime() + 20 * 60 * 1000),
    expiresAt: expires,
  });
  assert.deepEqual(afterGap, { action: "stop", reason: "expired" });
});

test("delivery honors the flag, revocation, resolution, recovery, and expiry", async () => {
  const previous = process.env.WEB_PUSH_SENDING_ENABLED;
  const now = new Date("2026-11-05T12:00:00.000Z");
  const stopped = await deliverQueuedPushDispatches(pushDb({ now, resolved: false, revoked: false }).db as never, {
    now,
    transport: async () => {
      throw new Error("should not send");
    },
  });
  assert.equal(stopped.stopped, "flag");
  assert.equal(stopped.sent, 0);

  process.env.WEB_PUSH_SENDING_ENABLED = "true";
  try {
    const recovered = pushDb({ now, resolved: false, revoked: false });
    let calls = 0;
    const first = await deliverQueuedPushDispatches(recovered.db as never, {
      now,
      transport: async () => {
        calls += 1;
        return { outcome: "temporary", code: "temporary" };
      },
    });
    assert.equal(first.sent, 0);
    assert.equal(calls, 1);
    const later = new Date(now.getTime() + SCHEDULED_EVALUATION_CADENCE_MS);
    const second = await deliverQueuedPushDispatches(recovered.db as never, {
      now: later,
      transport: async () => {
        calls += 1;
        return { outcome: "accepted" };
      },
    });
    assert.equal(second.sent, 1);
    assert.equal(calls, 2);
    assert.ok(later.getTime() < recovered.dispatch.expiresAt.getTime());

    const revoked = pushDb({ now, resolved: false, revoked: true });
    let revokedCalls = 0;
    const revokedResult = await deliverQueuedPushDispatches(revoked.db as never, {
      now,
      transport: async () => {
        revokedCalls += 1;
        return { outcome: "accepted" };
      },
    });
    assert.equal(revokedResult.suppressed, 1);
    assert.equal(revokedCalls, 0);

    const resolved = pushDb({ now, resolved: true, revoked: false });
    let resolvedCalls = 0;
    const resolvedResult = await deliverQueuedPushDispatches(resolved.db as never, {
      now,
      transport: async () => {
        resolvedCalls += 1;
        return { outcome: "accepted" };
      },
    });
    assert.equal(resolvedResult.suppressed, 1);
    assert.equal(resolvedCalls, 0);

    const expired = pushDb({ now, resolved: false, revoked: false });
    expired.dispatch.expiresAt = now;
    let expiredCalls = 0;
    const expiredResult = await deliverQueuedPushDispatches(expired.db as never, {
      now,
      transport: async () => {
        expiredCalls += 1;
        return { outcome: "accepted" };
      },
    });
    assert.equal(expiredResult.sent, 0);
    assert.equal(expiredCalls, 0);
    assert.equal(expired.dispatch.status, "FAILED");
  } finally {
    if (previous === undefined) delete process.env.WEB_PUSH_SENDING_ENABLED;
    else process.env.WEB_PUSH_SENDING_ENABLED = previous;
  }
});

test("a snooze outside the fifteen-minute horizon is not sent late", async () => {
  assert.equal(SNOOZE_WAKE_HORIZON_MS, 15 * 60 * 1000);
  const previous = process.env.WEB_PUSH_SENDING_ENABLED;
  process.env.WEB_PUSH_SENDING_ENABLED = "true";
  try {
    const snoozedUntil = new Date("2026-11-05T12:00:00.000Z");
    const created = await enqueueSnoozeExpiryWake(
      {
        notificationRecipient: {
          findUnique: async () => ({
            id: "recipient-1",
            userId: "user-1",
            snoozedUntil,
            notification: { resolvedAt: null, expiresAt: null, facilityId: "fac-1" },
          }),
        },
      } as never,
      {
        recipientId: "recipient-1",
        snoozedUntil,
        now: new Date(snoozedUntil.getTime() + 20 * 60 * 1000),
      },
    );
    assert.equal(created, 0);
  } finally {
    if (previous === undefined) delete process.env.WEB_PUSH_SENDING_ENABLED;
    else process.env.WEB_PUSH_SENDING_ENABLED = previous;
  }
});

function emptyEvaluationDb() {
  const pass: { lastOutcome?: string; lastSucceededAt?: Date | null } = {};
  const state = {
    coverageThrows: false,
    pass,
    db: {} as Record<string, unknown>,
  };
  const lease = new Map<string, LeaseRow>();
  const empty = async () => [];
  state.db = {
    coverageEpisode: {
      findMany: async () => {
        if (state.coverageThrows) throw new Error("boom");
        return [];
      },
    },
    operationalCycleKeyTimeDayExpectation: { findMany: empty },
    repair: { findMany: empty },
    notification: { findMany: empty },
    notificationRecipient: { findMany: empty },
    pushDispatch: { updateMany: async () => ({ count: 0 }), findMany: empty },
    scheduledEvaluationLease: {
      findUnique: async () => ({ resumeAfter: null, resumeFacilityId: null }),
      update: async () => ({}),
      upsert: async ({ create, update }: { create: { lastOutcome: string; lastSucceededAt: Date | null }; update: { lastOutcome: string; lastSucceededAt?: Date } }) => {
        pass.lastOutcome = update.lastOutcome ?? create.lastOutcome;
        if (update.lastSucceededAt) pass.lastSucceededAt = update.lastSucceededAt;
        else if (create.lastSucceededAt) pass.lastSucceededAt = create.lastSucceededAt;
      },
    },
    $queryRaw: async (_query: TemplateStringsArray, key: string, until: Date, owner: string, _updated: Date, now: Date) => {
      const current = lease.get(key);
      if (!current || current.until.getTime() <= now.getTime()) {
        lease.set(key, { until, owner });
        return [{ evaluatorKey: key }];
      }
      return [];
    },
    $executeRaw: async (_query: TemplateStringsArray, until: Date, _now: Date, key: string, owner: string) => {
      const current = lease.get(key);
      if (!current || current.owner !== owner) return 0;
      current.until = until;
      return 1;
    },
  };
  return state;
}

function pushDb(input: { now: Date; resolved: boolean; revoked: boolean }) {
  const dispatch = {
    id: "dispatch-1",
    status: "QUEUED",
    attemptCount: 0,
    expiresAt: new Date(input.now.getTime() + PUSH_TTL_SECONDS * 1000),
    claimedUntil: null as Date | null,
    queuedAt: input.now,
    triggerKey: "recipient-added:recipient-1",
    notificationRecipientId: "recipient-1",
    lastErrorCode: null as string | null,
    sentAt: null as Date | null,
  };
  const subscription = {
    id: "sub-1",
    userId: "user-1",
    endpoint: "https://updates.push.services.mozilla.com/wpush/v2/example",
    p256dh: "key",
    auth: "auth",
    revokedAt: input.revoked ? input.now : null,
    authorizedUntil: new Date(input.now.getTime() + 60 * 60 * 1000),
    user: { isActive: true },
  };
  const matchesClaim = (at: Date) =>
    dispatch.expiresAt.getTime() > at.getTime() &&
    dispatch.attemptCount < PUSH_MAX_ATTEMPTS &&
    (dispatch.status === "QUEUED" || dispatch.status === "SENDING") &&
    (dispatch.claimedUntil == null || dispatch.claimedUntil.getTime() < at.getTime());
  const db = {
    pushDispatch: {
      updateMany: async (args: { where: { id?: string; expiresAt?: { lte: Date }; attemptCount?: { gte: number } }; data: Record<string, unknown> }) => {
        if (args.where.expiresAt?.lte && dispatch.expiresAt.getTime() <= args.where.expiresAt.lte.getTime()) {
          dispatch.status = "FAILED";
          dispatch.lastErrorCode = "expired";
          return { count: 1 };
        }
        if (args.where.attemptCount?.gte != null && dispatch.attemptCount >= args.where.attemptCount.gte) {
          dispatch.status = "FAILED";
          dispatch.lastErrorCode = "attempts";
          return { count: 1 };
        }
        if (args.where.id && args.where.id === dispatch.id) {
          return { count: 0 };
        }
        return { count: 0 };
      },
      findMany: async (args: { where?: { expiresAt?: { gt?: Date } } }) =>
        matchesClaim(args.where?.expiresAt?.gt ?? input.now) ? [{ id: dispatch.id }] : [],
      update: async (args: { data: Record<string, unknown> }) => {
        if (args.data.status) dispatch.status = args.data.status as string;
        if ("claimedUntil" in args.data) dispatch.claimedUntil = args.data.claimedUntil as Date | null;
        if ("lastErrorCode" in args.data) dispatch.lastErrorCode = args.data.lastErrorCode as string | null;
        if (args.data.sentAt) dispatch.sentAt = args.data.sentAt as Date;
        const increment = args.data.attemptCount as { increment?: number } | undefined;
        if (increment?.increment) dispatch.attemptCount += increment.increment;
        return dispatch;
      },
      findUnique: async () => ({
        ...dispatch,
        pushSubscription: subscription,
        notificationRecipient: {
          id: "recipient-1",
          userId: "user-1",
          reason: NotificationRecipientReason.ESCALATION_TARGET,
          snoozedUntil: null,
          notification: {
            id: "attention-1",
            facilityId: "fac-1",
            departmentId: null,
            kind: NotificationKind.OPERATIONAL,
            priority: NotificationPriority.URGENT,
            requiresAcknowledgement: true,
            sourceType: "work_order",
            sourceId: "work-1",
            metadata: { protected: false },
            resolvedAt: input.resolved ? input.now : null,
            expiresAt: null,
            facility: { timezone: "America/Chicago" },
          },
        },
      }),
    },
    pushSubscription: {
      findUnique: async () => subscription,
      update: async () => subscription,
    },
    notificationRecipient: {
      findUnique: async () => ({
        id: "recipient-1",
        userId: "user-1",
        reason: NotificationRecipientReason.ESCALATION_TARGET,
        snoozedUntil: null,
        notification: {
          id: "attention-1",
          facilityId: "fac-1",
          departmentId: null,
          kind: NotificationKind.OPERATIONAL,
          priority: NotificationPriority.URGENT,
          requiresAcknowledgement: true,
          sourceType: "work_order",
          sourceId: "work-1",
          metadata: { protected: false },
          resolvedAt: input.resolved ? input.now : null,
          expiresAt: null,
          facility: { timezone: "America/Chicago" },
        },
      }),
    },
    notificationPreference: { findUnique: async () => null },
    userFacilityAccess: { findFirst: async () => ({ id: "access-1" }) },
  };
  db.pushDispatch.updateMany = async (args: {
    where: { id?: string; status?: { in: string[] }; expiresAt?: { lte: Date }; attemptCount?: { gte: number }; OR?: unknown };
    data: { status?: string; claimedUntil?: Date; lastAttemptAt?: Date; attemptCount?: { increment: number }; lastErrorCode?: string };
  }) => {
    if (args.where.expiresAt?.lte && ["QUEUED", "SENDING"].includes(dispatch.status) && dispatch.expiresAt.getTime() <= args.where.expiresAt.lte.getTime()) {
      dispatch.status = "FAILED";
      dispatch.lastErrorCode = "expired";
      dispatch.claimedUntil = null;
      return { count: 1 };
    }
    if (args.where.attemptCount?.gte != null && dispatch.attemptCount >= args.where.attemptCount.gte && ["QUEUED", "SENDING"].includes(dispatch.status)) {
      dispatch.status = "FAILED";
      dispatch.lastErrorCode = "attempts";
      return { count: 1 };
    }
    if (args.where.id === dispatch.id && args.data.attemptCount?.increment) {
      const at = args.data.lastAttemptAt ?? input.now;
      if (!matchesClaim(at)) return { count: 0 };
      dispatch.status = "SENDING";
      dispatch.claimedUntil = args.data.claimedUntil ?? null;
      dispatch.attemptCount += 1;
      return { count: 1 };
    }
    return { count: 0 };
  };
  return { db, dispatch };
}
