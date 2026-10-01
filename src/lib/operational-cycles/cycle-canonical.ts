/**
 * Canonical Operational Cycle structure.
 * Persistence stays PERIOD / KEY_TIME. New drafts cannot nest a Phase under a
 * Phase or parent a Key Point to a Phase. Published history is not rewritten.
 *
 * Shift-contents is not applied here. Each date-specific adjustment is one node.
 */

import { parseLocalTime, resolveCycleWindowInstants } from "./cycle-windows";

export type OccurrenceTracking = "NONE" | "OPTIONAL" | "REQUIRED";
export type KeyPointGrain = "DEPARTMENT" | "LOCATION";
export type CycleNodeKind = "PERIOD" | "KEY_TIME";

export type CanonicalNodeRef = {
  stableKey: string;
  parentStableKey?: string | null;
  nodeKind?: CycleNodeKind;
  startLocal?: string | null;
  endLocal?: string | null;
  overnight?: boolean;
};

export type CanonicalParentContext = {
  stableKey: string;
  parentStableKey: string | null;
  nodeKind: CycleNodeKind;
  startLocal?: string | null;
  endLocal?: string | null;
  overnight?: boolean;
};

export function isRootCycle(node: CanonicalNodeRef): boolean {
  return (node.nodeKind ?? "PERIOD") === "PERIOD" && !node.parentStableKey?.trim();
}

export function isPhaseNode(node: CanonicalNodeRef): boolean {
  return (node.nodeKind ?? "PERIOD") === "PERIOD" && Boolean(node.parentStableKey?.trim());
}

/** Parent role for a proposed child. A Phase is a PERIOD that itself has a parent. */
export function canonicalParentRejection(input: {
  nodeKind: CycleNodeKind;
  parent: CanonicalParentContext | null;
}): string | null {
  const parent = input.parent;
  if (input.nodeKind === "KEY_TIME") {
    if (!parent) {
      return "A Key Point must belong directly to an Operational Cycle.";
    }
    if (parent.nodeKind === "KEY_TIME") {
      return "A Key Point cannot belong to another Key Point.";
    }
    if (parent.parentStableKey?.trim()) {
      return "A Key Point belongs on the Operational Cycle, not on a Phase.";
    }
    return null;
  }
  if (!parent) return null;
  if (parent.nodeKind === "KEY_TIME") {
    return "A Phase cannot belong to a Key Point.";
  }
  if (parent.parentStableKey?.trim()) {
    return "A Phase cannot contain another Phase.";
  }
  return null;
}

function minutesOf(local: string | null | undefined): number | null {
  const parsed = parseLocalTime(local ?? "");
  if (!parsed) return null;
  return parsed.hours * 60 + parsed.minutes;
}

/**
 * Minutes from the start of the facility-local day, shifted onto an overnight
 * timeline that begins at the Cycle start. Non-overnight times stay on the clock.
 */
export function timelineMinute(input: {
  local: string;
  cycleStartLocal: string;
  overnight: boolean;
}): number | null {
  const point = minutesOf(input.local);
  const start = minutesOf(input.cycleStartLocal);
  if (point == null || start == null) return null;
  if (!input.overnight) return point;
  return point < start ? point + 1440 : point;
}

export function cycleEndTimelineMinute(input: {
  startLocal: string;
  endLocal: string;
  overnight: boolean;
}): number | null {
  const start = minutesOf(input.startLocal);
  const end = minutesOf(input.endLocal);
  if (start == null || end == null) return null;
  if (input.overnight) return end + 1440;
  return end;
}

export function windowContainedInCycle(input: {
  cycleStartLocal: string;
  cycleEndLocal: string;
  overnight: boolean;
  startLocal: string;
  endLocal: string;
  childOvernight?: boolean;
}): boolean {
  const start = timelineMinute({
    local: input.startLocal,
    cycleStartLocal: input.cycleStartLocal,
    overnight: input.overnight,
  });
  const cycleEnd = cycleEndTimelineMinute({
    startLocal: input.cycleStartLocal,
    endLocal: input.cycleEndLocal,
    overnight: input.overnight,
  });
  const cycleStart = minutesOf(input.cycleStartLocal);
  if (start == null || cycleEnd == null || cycleStart == null) return false;
  const childOvernight =
    input.childOvernight ??
    (input.overnight &&
      (minutesOf(input.endLocal) ?? 0) <= (minutesOf(input.startLocal) ?? 0));
  const end = childOvernight
    ? (minutesOf(input.endLocal) ?? 0) + 1440
    : timelineMinute({
        local: input.endLocal,
        cycleStartLocal: input.cycleStartLocal,
        overnight: input.overnight,
      });
  if (end == null) return false;
  return start >= cycleStart && start < cycleEnd && end <= cycleEnd && end > start;
}

export function instantContainedInCycle(input: {
  cycleStartLocal: string;
  cycleEndLocal: string;
  overnight: boolean;
  dueLocal: string;
}): boolean {
  const point = timelineMinute({
    local: input.dueLocal,
    cycleStartLocal: input.cycleStartLocal,
    overnight: input.overnight,
  });
  const cycleStart = minutesOf(input.cycleStartLocal);
  const cycleEnd = cycleEndTimelineMinute({
    startLocal: input.cycleStartLocal,
    endLocal: input.cycleEndLocal,
    overnight: input.overnight,
  });
  if (point == null || cycleStart == null || cycleEnd == null) return false;
  return point >= cycleStart && point < cycleEnd;
}

export function containmentRejection(input: {
  nodeKind: CycleNodeKind;
  parent: CanonicalParentContext | null;
  startLocal?: string | null;
  endLocal?: string | null;
  overnight?: boolean;
  dueLocals?: readonly string[];
}): string | null {
  const parent = input.parent;
  if (!parent?.startLocal?.trim() || !parent.endLocal?.trim()) return null;
  const overnight = parent.overnight ?? false;
  if (input.nodeKind === "PERIOD") {
    if (!input.startLocal?.trim() || !input.endLocal?.trim()) return null;
    const ok = windowContainedInCycle({
      cycleStartLocal: parent.startLocal,
      cycleEndLocal: parent.endLocal,
      overnight,
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      childOvernight: input.overnight,
    });
    return ok ? null : "A Phase must stay inside its Operational Cycle.";
  }
  for (const due of input.dueLocals ?? []) {
    if (!due.trim()) continue;
    const ok = instantContainedInCycle({
      cycleStartLocal: parent.startLocal,
      cycleEndLocal: parent.endLocal,
      overnight,
      dueLocal: due,
    });
    if (!ok) return "A Key Point must stay inside its Operational Cycle.";
  }
  return null;
}

/**
 * Display parent for a historical Key Point stored under a Phase.
 * Does not change the stored parentStableKey.
 */
export function displayParentStableKey(
  node: CanonicalNodeRef,
  byKey: ReadonlyMap<string, CanonicalNodeRef>,
): string | null {
  const stored = node.parentStableKey?.trim() || null;
  if ((node.nodeKind ?? "PERIOD") !== "KEY_TIME" || !stored) return stored;
  let cursor: string | null = stored;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) return stored;
    seen.add(cursor);
    const parent = byKey.get(cursor);
    if (!parent) return cursor;
    if (!parent.parentStableKey?.trim()) return parent.stableKey;
    cursor = parent.parentStableKey.trim();
  }
  return stored;
}

export type KeyPointActualFact = {
  id: string;
  actualLocal: string;
  recordedAt: string;
  correctionReason: string | null;
  correctsActualId: string | null;
};

export type KeyPointRuntimeState = {
  tracking: OccurrenceTracking;
  plannedLocal: string;
  adjustedLocal: string | null;
  expectedLocal: string;
  actualLocal: string | null;
  originalActualLocal: string | null;
  recordedAt: string | null;
  requiresActual: boolean;
  /** upcoming / due / past are planned-time states. absent is REQUIRED with no actual after the instant. */
  state: "upcoming" | "due" | "past" | "recorded" | "absent";
};

export function presentKeyPointRuntime(input: {
  tracking: OccurrenceTracking;
  plannedDueLocal: string;
  adjustedDueLocal?: string | null;
  nowLocal: string;
  actuals?: readonly KeyPointActualFact[];
}): KeyPointRuntimeState {
  const planned = input.plannedDueLocal;
  const adjusted = input.adjustedDueLocal?.trim() || null;
  const expected = adjusted ?? planned;
  const actuals = [...(input.actuals ?? [])];
  const original = actuals.find((fact) => !fact.correctsActualId) ?? actuals[0] ?? null;
  const current = actuals.length > 0 ? actuals[actuals.length - 1]! : null;
  const requiresActual = input.tracking === "REQUIRED";
  const now = minutesOf(input.nowLocal);
  const due = minutesOf(expected);
  let state: KeyPointRuntimeState["state"] = "upcoming";
  if (current && input.tracking !== "NONE") {
    state = "recorded";
  } else if (now != null && due != null) {
    if (now < due) state = "upcoming";
    else if (now === due) state = "due";
    else state = requiresActual ? "absent" : "past";
  }
  return {
    tracking: input.tracking,
    plannedLocal: planned,
    adjustedLocal: adjusted,
    expectedLocal: expected,
    actualLocal: input.tracking === "NONE" ? null : (current?.actualLocal ?? null),
    originalActualLocal: input.tracking === "NONE" ? null : (original?.actualLocal ?? null),
    recordedAt: input.tracking === "NONE" ? null : (current?.recordedAt ?? null),
    requiresActual,
    state,
  };
}

export function appendKeyPointActual(input: {
  existing: readonly KeyPointActualFact[];
  id: string;
  actualLocal: string;
  recordedAt: string;
  correctionReason?: string | null;
}): { ok: true; facts: KeyPointActualFact[] } | { ok: false; message: string } {
  const existing = [...input.existing];
  if (existing.length === 0) {
    return {
      ok: true,
      facts: [
        {
          id: input.id,
          actualLocal: input.actualLocal,
          recordedAt: input.recordedAt,
          correctionReason: null,
          correctsActualId: null,
        },
      ],
    };
  }
  const reason = input.correctionReason?.trim() || "";
  if (!reason) {
    return { ok: false, message: "A correction requires a reason." };
  }
  const prior = existing[existing.length - 1]!;
  return {
    ok: true,
    facts: [
      ...existing,
      {
        id: input.id,
        actualLocal: input.actualLocal,
        recordedAt: input.recordedAt,
        correctionReason: reason,
        correctsActualId: prior.id,
      },
    ],
  };
}

export function validateTimingAdjustment(input: {
  reason?: string | null;
  actorId?: string | null;
  adjustedStartLocal?: string | null;
  adjustedEndLocal?: string | null;
  adjustedDueLocal?: string | null;
}): { ok: true } | { ok: false; message: string } {
  if (!input.reason?.trim()) return { ok: false, message: "An adjustment requires a reason." };
  if (!input.actorId?.trim()) return { ok: false, message: "An adjustment requires an actor." };
  const hasValue = Boolean(
    input.adjustedStartLocal?.trim() ||
      input.adjustedEndLocal?.trim() ||
      input.adjustedDueLocal?.trim(),
  );
  if (!hasValue) return { ok: false, message: "An adjustment requires a time or window." };
  return { ok: true };
}

export type StarterStructurePlan = {
  stableKey: string;
  parentStableKey: string | null;
  nodeKind: CycleNodeKind;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  overnight: boolean;
};

/** Future Product starter content must already obey canonical structure. */
export function validateStarterStructure(
  plans: readonly StarterStructurePlan[],
): string[] {
  const byKey = new Map(plans.map((plan) => [plan.stableKey, plan]));
  const errors: string[] = [];
  for (const plan of plans) {
    if (!plan.stableKey.trim()) {
      errors.push(`${plan.label} is missing a stable key.`);
      continue;
    }
    const parent = plan.parentStableKey ? byKey.get(plan.parentStableKey) ?? null : null;
    if (plan.parentStableKey && !parent) {
      errors.push(`${plan.stableKey} references a missing parent.`);
      continue;
    }
    const rejection = canonicalParentRejection({
      nodeKind: plan.nodeKind,
      parent: parent
        ? {
            stableKey: parent.stableKey,
            parentStableKey: parent.parentStableKey,
            nodeKind: parent.nodeKind,
            startLocal: parent.startLocal,
            endLocal: parent.endLocal,
            overnight: parent.overnight,
          }
        : null,
    });
    if (rejection) errors.push(`${plan.stableKey}: ${rejection}`);
    const contained = containmentRejection({
      nodeKind: plan.nodeKind,
      parent: parent
        ? {
            stableKey: parent.stableKey,
            parentStableKey: parent.parentStableKey,
            nodeKind: parent.nodeKind,
            startLocal: parent.startLocal,
            endLocal: parent.endLocal,
            overnight: parent.overnight,
          }
        : null,
      startLocal: plan.startLocal,
      endLocal: plan.endLocal,
      overnight: plan.overnight,
    });
    if (contained) errors.push(`${plan.stableKey}: ${contained}`);
  }
  return errors;
}

/** Service date is the facility-local date on which the Cycle begins. */
export function cycleServiceDateKey(input: {
  operationalDateKey: string;
  startLocal: string;
  endLocal: string;
  overnight: boolean;
  facilityTimezone?: string | null;
}): { serviceDateKey: string; startsAt: Date; endsAt: Date } | null {
  const window = resolveCycleWindowInstants({
    operationalDateKey: input.operationalDateKey,
    startLocal: input.startLocal,
    endLocal: input.endLocal,
    overnight: input.overnight,
    facilityTimezone: input.facilityTimezone,
  });
  if (!window) return null;
  return {
    serviceDateKey: input.operationalDateKey,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  };
}
