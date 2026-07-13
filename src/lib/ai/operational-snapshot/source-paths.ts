/** Stable app paths the Morning Brief may link to. */

export function unitWorkspacePath(unitId: string): string {
  return `/unit/${unitId}`;
}

export function issueDetailPath(issueId: string): string {
  return `/issues/${issueId}`;
}

export function todaysWorkCoveragePath(): string {
  return "/today/coverage";
}

export function todaysWorkHandoffsPath(): string {
  return "/today/handoffs";
}

export function todaysWorkWalkPath(): string {
  return "/today/walk";
}

export function staffingPath(): string {
  return "/staffing";
}

export function inspectionsAdminPath(): string {
  return "/admin/inspections";
}

export function isAllowedAppSourcePath(path: string, allowed: ReadonlySet<string>): boolean {
  if (!path.startsWith("/")) return false;
  if (path.includes("://") || path.includes("..")) return false;
  return allowed.has(path);
}
