export type TaskSyncDb = object;

export type TaskSyncOutcome = { ok: true; skipped: true; reason: "flag_disabled" };

export type TaskSyncDeps = {
  isEnabled?: () => boolean;
  db?: TaskSyncDb;
};

/**
 * Task Sync is retired. Callers keep their source write. Nothing is copied onto Task.
 */
export async function runGuardedTaskSync(
  _label: string,
  _context: Record<string, string>,
  _run: () => Promise<unknown>,
  _deps: TaskSyncDeps = {},
): Promise<TaskSyncOutcome> {
  return { ok: true, skipped: true, reason: "flag_disabled" };
}

export function resolveTaskSyncDb(deps: TaskSyncDeps = {}): TaskSyncDb {
  return deps.db ?? {};
}
