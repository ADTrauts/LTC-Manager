/**
 * Detect material Assignment change for employee Job Flow view.
 * Compares current confirmed assignment vs prior known revision from offline bundle
 * or previous load params. No DB acknowledgment — revision indicator + refresh is enough.
 */

export type AssignmentRevisionPrior = {
  assignmentId: string;
  unitId: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type AssignmentRevisionCurrent = {
  assignmentId: string | null;
  unitId: string | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
};

export type AssignmentRevisionKind = "unit" | "window" | "replaced" | "cancelled";

export type AssignmentRevisionResult = {
  changed: boolean;
  kind: AssignmentRevisionKind | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

/**
 * Pure comparison of prior known Assignment revision vs current confirmed Assignment.
 */
export function detectAssignmentRevision(
  prior: AssignmentRevisionPrior | null | undefined,
  current: AssignmentRevisionCurrent | null | undefined,
): AssignmentRevisionResult {
  if (!prior) {
    return { changed: false, kind: null };
  }

  const currentId = current?.assignmentId ?? null;
  if (!currentId) {
    return { changed: true, kind: "cancelled" };
  }

  if (currentId !== prior.assignmentId) {
    return { changed: true, kind: "replaced" };
  }

  const currentUnit = current?.unitId ?? null;
  if (currentUnit !== prior.unitId) {
    return { changed: true, kind: "unit" };
  }

  const currentStarts = toIso(current?.startsAt ?? null);
  const currentEnds = toIso(current?.endsAt ?? null);
  if (currentStarts !== prior.startsAt || currentEnds !== prior.endsAt) {
    return { changed: true, kind: "window" };
  }

  return { changed: false, kind: null };
}
