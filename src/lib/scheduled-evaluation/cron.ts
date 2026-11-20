import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";

import { processPendingNotificationOutbox } from "@/lib/notifications/processing";
import { prisma } from "@/lib/prisma";
import { runScheduledEvaluations } from "./run";
import { SCHEDULED_EVALUATION_EXECUTION_BUDGET_MS, SCHEDULED_EVALUATION_OUTBOX_RESERVE_MS } from "./cadence";
import { tryAcquireScheduledEvaluationLease, recordEvaluatorHealth, releaseScheduledEvaluationLease } from "./lease";

/**
 * Same server secret as the other internal crons. Not a facility user action.
 */
export function isScheduledEvaluationAuthorized(
  request: Request,
  secret = process.env.CRON_SECRET,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function handleScheduledEvaluationCron(
  request: Request,
  client: PrismaClient = prisma,
  now?: Date,
) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "cron_unconfigured" }, { status: 503 });
  }
  if (!isScheduledEvaluationAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (process.env.SCHEDULED_EVALUATION_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "scheduled_evaluation_disabled" }, { status: 503 });
  }
  const passKey = "scheduled-evaluation.pass";
  const deadline = new Date(Date.now() + SCHEDULED_EVALUATION_EXECUTION_BUDGET_MS);
  const at = now ?? new Date();
  let owner: string | null = null;
  try {
    owner = await tryAcquireScheduledEvaluationLease(client, passKey, new Date());
    if (!owner) return NextResponse.json({ ok: true, outcome: "skipped", reason: "already_running" }, { status: 202 });
    const summary = await runScheduledEvaluations(client, {
      now: at,
      deadline: new Date(deadline.getTime() - SCHEDULED_EVALUATION_OUTBOX_RESERVE_MS),
    });
    // Read the durable pending queue, including work left by a prior interrupted
    // pass. Processing only this invocation's new IDs would strand that work.
    const results = await processPendingNotificationOutbox(client, {
      limit: 20, deadline, excludeSuspended: true,
    });
    const processingFailures = results.filter(result => result.outcome === "failed").length;
    const pending = await client.notificationOutbox.findFirst({
      where: { processedAt: null, facility: { operationsSuspendedAt: null } },
      select: { id: true },
    });
    const failed = summary.failures > 0 || processingFailures > 0;
    const completed = !failed && summary.skipped === 0 && summary.cycleCompleted !== false && !pending;
    const outcome = failed ? "failed" : completed ? "completed" : "incomplete";
    const recorded = await recordEvaluatorHealth(client, {
      evaluatorKey: passKey, owner, now: new Date(), outcome,
      failures: summary.failures, processingFailures,
    });
    return NextResponse.json({
      ok: !failed && recorded, completed: completed && recorded, outcome: recorded ? outcome : "lease_lost",
      evaluators: summary.evaluators, skipped: summary.skipped,
      facilitiesScanned: summary.facilitiesScanned, candidates: summary.candidates,
      transitions: summary.transitions, reevaluations: summary.reevaluations,
      failures: summary.failures, processingFailures,
      outboxProcessed: results.length, outboxPending: Boolean(pending),
    }, { status: !recorded || failed ? 503 : completed ? 200 : 202 });
  } catch {
    if (owner) await recordEvaluatorHealth(client, {
      evaluatorKey: passKey, owner, now: new Date(), outcome: "failed", failures: 1,
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  } finally {
    if (owner) await releaseScheduledEvaluationLease(client, passKey, owner, new Date());
  }
}
