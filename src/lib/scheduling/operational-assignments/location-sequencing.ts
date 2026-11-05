/**
 * Assignment location order for Job Flow.
 * Explicitly not route optimization, and not a Work Plan.
 */

import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";

export type SequencedLocationWork = {
  unitSpaceId: string;
  label: string;
  sortOrder: number;
  roomNumber: string | null;
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
  currentSpaceId?: string | null;
}): DeterministicSequence {
  const sequenced: SequencedLocationWork[] = input.locations.map((loc) => ({
    unitSpaceId: loc.unitSpaceId,
    label: loc.label,
    sortOrder: loc.sortOrder,
    roomNumber: loc.roomNumber,
    hasUrgent: false,
    hasCurrentWork: false,
    allComplete: false,
  }));

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
      "Order follows the assigned rooms. This is not an optimized walking route.",
  };
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
