import type { AssignmentBoardEntry, AssignmentWarning } from "./types";

/**
 * Detect overlapping primary assignments for the same employee.
 * Time-bounded assignments overlap when their windows intersect.
 * Assignments without time bounds are treated as full-day and always overlap with each other.
 */
export function detectOverlappingAssignments(
  assignments: AssignmentBoardEntry[],
): AssignmentWarning[] {
  const warnings: AssignmentWarning[] = [];
  const byEmployee = new Map<string, AssignmentBoardEntry[]>();

  for (const a of assignments) {
    if (a.status === "CANCELLED") continue;
    const list = byEmployee.get(a.employeeId) ?? [];
    list.push(a);
    byEmployee.set(a.employeeId, list);
  }

  for (const [employeeId, entries] of byEmployee) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!;
        const b = entries[j]!;
        if (timesOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt)) {
          warnings.push({
            kind: "overlapping_primary",
            employeeId,
            assignmentId: b.id,
            message: `"${a.roleLabel}" and "${b.roleLabel}" overlap for this employee.`,
          });
        }
      }
    }
  }

  return warnings;
}

function timesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  return aS < bE && bS < aE;
}
