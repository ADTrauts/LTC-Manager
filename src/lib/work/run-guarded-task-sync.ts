import type { PrismaClient, Task } from "@prisma/client";

import { isTaskSyncEnabled } from "@/lib/feature-flags";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type TaskSyncDb = Pick<PrismaClient, "task">;

export type TaskSyncOutcome =
  | { ok: true; skipped: true; reason: "flag_disabled" }
  | { ok: true; skipped: false; task: Task }
  | { ok: false; skipped: false; error: unknown };

export type TaskSyncDeps = {
  isEnabled?: () => boolean;
  db?: TaskSyncDb;
};

/**
 * Guarded Work Engine sync: never throws to callers.
 * Source writes (LogSubmission / Repair) remain authoritative; Task failures are logged only.
 */
export async function runGuardedTaskSync(
  label: string,
  context: Record<string, string>,
  run: () => Promise<Task>,
  deps: TaskSyncDeps = {},
): Promise<TaskSyncOutcome> {
  const isEnabled = deps.isEnabled ?? isTaskSyncEnabled;
  if (!isEnabled()) {
    return { ok: true, skipped: true, reason: "flag_disabled" };
  }

  try {
    const task = await run();
    return { ok: true, skipped: false, task };
  } catch (error) {
    console.error(`[work/task-sync] ${label} failed`, { ...context, error });
    return { ok: false, skipped: false, error };
  }
}

export function resolveTaskSyncDb(deps: TaskSyncDeps = {}): TaskSyncDb {
  return deps.db ?? defaultPrisma;
}
