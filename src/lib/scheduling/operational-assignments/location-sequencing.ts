/**
 * Phase 11C — Deterministic EVS location / work sequencing for Job Flow.
 * Explicitly NOT route optimization.
 */

import type { WorkRequirement } from "@/lib/department-work/types";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  TIME_SENSITIVE: 1,
  ROUTINE: 2,
};

export type SequencedLocationWork = {
  unitSpaceId: string;
  label: string;
  sortOrder: number;
  roomNumber: string | null;
  work: WorkRequirement[];
  hasUrgent: boolean;
  hasCurrentWork: boolean;
  allComplete: boolean;
};

export type DeterministicSequence = {
  now: SequencedLocationWork | null;
  next: SequencedLocationWork | null;
  queue: SequencedLocationWork[];
  all: SequencedLocationWork[];
  /** User-facing disclaimer — never claim optimal routing. */
  sequencingNote: string;
};

export function buildDeterministicLocationSequence(input: {
  locations: ResolvedAssignmentLocation[];
  workRequirements: WorkRequirement[];
  currentSpaceId?: string | null;
}): DeterministicSequence {
  const workBySpace = new Map<string, WorkRequirement[]>();
  for (const req of input.workRequirements) {
    if (!req.spaceId) continue;
    const list = workBySpace.get(req.spaceId) ?? [];
    list.push(req);
    workBySpace.set(req.spaceId, list);
  }

  const sequenced: SequencedLocationWork[] = input.locations.map((loc) => {
    const work = (workBySpace.get(loc.unitSpaceId) ?? []).slice().sort(compareWork);
    const incomplete = work.filter((w) => !isWorkComplete(w));
    return {
      unitSpaceId: loc.unitSpaceId,
      label: loc.label,
      sortOrder: loc.sortOrder,
      roomNumber: loc.roomNumber,
      work,
      hasUrgent: incomplete.some((w) => w.priority === "URGENT"),
      hasCurrentWork: incomplete.length > 0,
      allComplete: work.length > 0 && incomplete.length === 0,
    };
  });

  sequenced.sort((a, b) => {
    if (a.hasUrgent !== b.hasUrgent) return a.hasUrgent ? -1 : 1;
    if (a.hasCurrentWork !== b.hasCurrentWork) return a.hasCurrentWork ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });

  let nowItem: SequencedLocationWork | null = null;
  if (input.currentSpaceId) {
    nowItem = sequenced.find((s) => s.unitSpaceId === input.currentSpaceId) ?? null;
  }
  if (!nowItem) {
    nowItem = sequenced.find((s) => s.hasCurrentWork) ?? sequenced[0] ?? null;
  }

  const remaining = sequenced.filter((s) => s.unitSpaceId !== nowItem?.unitSpaceId && s.hasCurrentWork);
  const next = remaining[0] ?? null;
  const queue = remaining.slice(0, 5);

  return {
    now: nowItem,
    next,
    queue,
    all: sequenced,
    sequencingNote:
      "Order follows Room display order, priority, and due time. This is not an optimized walking route.",
  };
}

function isWorkComplete(w: WorkRequirement): boolean {
  return (
    w.state === "COMPLETED" ||
    w.state === "COMPLETED_WITH_EVIDENCE" ||
    w.state === "NOT_REQUIRED"
  );
}

function compareWork(a: WorkRequirement, b: WorkRequirement): number {
  const pa = PRIORITY_RANK[a.priority] ?? 9;
  const pb = PRIORITY_RANK[b.priority] ?? 9;
  if (pa !== pb) return pa - pb;
  const da = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const db = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return (a.label ?? "").localeCompare(b.label ?? "");
}

/** Compact scope summary for Employee Job Flow header. */
export function formatAssignedScopeSummary(input: {
  scopeKind: "UNIT" | "SPACES";
  unitName?: string | null;
  zoneName?: string | null;
  locations: Array<{ label: string; roomNumber?: string | null }>;
}): { title: string; detail: string } {
  if (input.scopeKind === "UNIT") {
    return {
      title: "Assigned Area",
      detail: input.unitName ? `${input.unitName} (entire Unit)` : "Entire Unit",
    };
  }
  const count = input.locations.length;
  if (input.zoneName) {
    return {
      title: "Assigned Area",
      detail: `${input.zoneName} · ${count} Room${count === 1 ? "" : "s"}`,
    };
  }
  const numbers = input.locations
    .map((l) => l.roomNumber?.trim())
    .filter((n): n is string => Boolean(n));
  if (numbers.length >= 2 && numbers.length === count) {
    const sorted = numbers.slice().sort();
    return {
      title: "Assigned Rooms",
      detail: `${sorted[0]}–${sorted[sorted.length - 1]} (${count})`,
    };
  }
  return {
    title: "Assigned Rooms",
    detail: `${count} Room${count === 1 ? "" : "s"}`,
  };
}
