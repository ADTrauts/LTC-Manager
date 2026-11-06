import { randomBytes } from "node:crypto";

import { SCHEDULED_EVALUATION_LEASE_MS } from "./cadence";
import type { ScheduledEvaluationDb } from "./types";

const RELEASED = new Date(0);

export async function tryAcquireScheduledEvaluationLease(
  db: ScheduledEvaluationDb,
  evaluatorKey: string,
  now: Date,
): Promise<string | null> {
  const owner = randomBytes(8).toString("hex");
  const until = new Date(now.getTime() + SCHEDULED_EVALUATION_LEASE_MS);
  const rows = await db.$queryRaw<Array<{ evaluatorKey: string }>>`
    INSERT INTO "ScheduledEvaluationLease" ("evaluatorKey", "lockedUntil", "lockedBy", "updatedAt")
    VALUES (${evaluatorKey}, ${until}, ${owner}, ${now})
    ON CONFLICT ("evaluatorKey") DO UPDATE
    SET "lockedUntil" = EXCLUDED."lockedUntil",
        "lockedBy" = EXCLUDED."lockedBy",
        "updatedAt" = EXCLUDED."updatedAt"
    WHERE "ScheduledEvaluationLease"."lockedUntil" <= ${now}
    RETURNING "evaluatorKey"
  `;
  return rows.length > 0 ? owner : null;
}

export async function renewScheduledEvaluationLease(
  db: ScheduledEvaluationDb,
  evaluatorKey: string,
  owner: string,
  now: Date,
): Promise<boolean> {
  const until = new Date(now.getTime() + SCHEDULED_EVALUATION_LEASE_MS);
  const renewed = await db.$executeRaw`
    UPDATE "ScheduledEvaluationLease"
    SET "lockedUntil" = ${until}, "updatedAt" = ${now}
    WHERE "evaluatorKey" = ${evaluatorKey} AND "lockedBy" = ${owner}
  `;
  return Number(renewed) === 1;
}

export async function recordEvaluatorHealth(
  db: ScheduledEvaluationDb,
  input: {
    evaluatorKey: string;
    owner?: string;
    now: Date;
    outcome: "completed" | "failed" | "incomplete";
    failures: number;
    processingFailures?: number;
  },
): Promise<boolean> {
  const table = (
    db as ScheduledEvaluationDb & {
      scheduledEvaluationLease?: {
        update?: (args: {
          where: { evaluatorKey: string };
          data: Record<string, unknown>;
        }) => Promise<unknown>;
        updateMany?: (args: {
          where: { evaluatorKey: string; lockedBy?: string };
          data: Record<string, unknown>;
        }) => Promise<{ count: number }>;
      };
    }
  ).scheduledEvaluationLease;
  if (!table) return false;
  const data = {
    lastAttemptedAt: input.now,
    lastFailureCount: input.failures,
    lastProcessingFailureCount: input.processingFailures ?? 0,
    lastOutcome: input.outcome,
    ...(input.outcome === "completed" ? { lastSucceededAt: input.now } : {}),
  };
  if (input.owner && table.updateMany) {
    const updated = await table.updateMany({
      where: { evaluatorKey: input.evaluatorKey, lockedBy: input.owner },
      data,
    });
    return updated.count === 1;
  }
  if (!table.update) return false;
  await table.update({ where: { evaluatorKey: input.evaluatorKey }, data });
  return true;
}

export async function releaseScheduledEvaluationLease(
  db: ScheduledEvaluationDb,
  evaluatorKey: string,
  owner: string,
  now: Date,
): Promise<void> {
  await db.$executeRaw`
    UPDATE "ScheduledEvaluationLease"
    SET "lockedUntil" = ${RELEASED}, "updatedAt" = ${now}
    WHERE "evaluatorKey" = ${evaluatorKey} AND "lockedBy" = ${owner}
  `;
}
