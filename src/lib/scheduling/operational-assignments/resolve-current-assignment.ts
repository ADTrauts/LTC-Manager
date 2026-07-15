import type { OperationalAssignmentStatus } from "@prisma/client";

export type EmployeeAssignmentRow = {
  id: string;
  roleKey: string;
  roleLabel: string;
  unitName: string | null;
  operationLabel: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: OperationalAssignmentStatus;
  source: string;
  notes: string | null;
};

export type ResolvedCurrentAssignment = {
  current: EmployeeAssignmentRow | null;
  upcoming: EmployeeAssignmentRow | null;
};

/**
 * Pick the most relevant current and next-upcoming assignment for an employee.
 *
 * Ordering:
 * 1. ACTIVE assignment containing `now`
 * 2. PLANNED assignment containing `now`
 * 3. nearest upcoming PLANNED assignment
 *
 * Excludes CANCELLED and COMPLETED.
 */
export function resolveCurrentEmployeeAssignment(
  assignments: EmployeeAssignmentRow[],
  now: Date,
): ResolvedCurrentAssignment {
  const active = assignments.filter(
    (a) => a.status === "ACTIVE" || a.status === "PLANNED",
  );

  const containing: EmployeeAssignmentRow[] = [];
  const upcoming: EmployeeAssignmentRow[] = [];

  for (const a of active) {
    if (a.startsAt && a.endsAt) {
      const s = a.startsAt.getTime();
      const e = a.endsAt.getTime();
      const n = now.getTime();
      if (n >= s && n < e) {
        containing.push(a);
      } else if (s > n) {
        upcoming.push(a);
      }
    } else {
      containing.push(a);
    }
  }

  containing.sort((a, b) => {
    if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
    if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
    return 0;
  });

  upcoming.sort((a, b) => {
    const aTime = a.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  const current = containing[0] ?? null;
  const next = upcoming[0] ?? (containing[1] ?? null);

  return { current, upcoming: next };
}
