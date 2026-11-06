import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { processScheduledEvaluationOutbox, runScheduledEvaluations } from "./run";

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
  try {
    const summary = await runScheduledEvaluations(client, { now: now ?? new Date() });
    const processingFailures = await processScheduledEvaluationOutbox(client, summary.outboxIds);
    const failed = summary.failures > 0 || processingFailures > 0;
    const at = now ?? new Date();
    const health = (
      client as PrismaClient & {
        scheduledEvaluationLease?: {
          upsert?: (args: {
            where: { evaluatorKey: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => Promise<unknown>;
        };
      }
    ).scheduledEvaluationLease;
    if (health?.upsert) {
      const completed = !failed && summary.skipped === 0;
      await health.upsert({
        where: { evaluatorKey: "scheduled-evaluation.pass" },
        create: {
          evaluatorKey: "scheduled-evaluation.pass",
          lockedUntil: new Date(0),
          lockedBy: "health",
          lastAttemptedAt: at,
          lastSucceededAt: completed ? at : null,
          lastOutcome: failed ? "failed" : completed ? "completed" : "skipped",
          lastFailureCount: summary.failures,
          lastProcessingFailureCount: processingFailures,
        },
        update: {
          lastAttemptedAt: at,
          lastOutcome: failed ? "failed" : completed ? "completed" : "skipped",
          lastFailureCount: summary.failures,
          lastProcessingFailureCount: processingFailures,
          ...(completed ? { lastSucceededAt: at } : {}),
        },
      });
    }
    return NextResponse.json(
      {
        ok: !failed,
        evaluators: summary.evaluators,
        skipped: summary.skipped,
        facilitiesScanned: summary.facilitiesScanned,
        candidates: summary.candidates,
        transitions: summary.transitions,
        reevaluations: summary.reevaluations,
        failures: summary.failures,
        processingFailures,
        ...(failed ? { error: "evaluation_incomplete" } : {}),
      },
      { status: failed ? 503 : 200 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }
}
