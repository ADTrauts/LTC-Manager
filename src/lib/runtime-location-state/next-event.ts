/**
 * Deterministic next-event pick over already-composed RLS facts.
 * Earliest at >= now. Not a workflow scheduler.
 */

import { parseFacilityLocalScheduledStart } from "@/lib/operational-time";

import type {
  RuntimeLocationState,
  RuntimeNextEvent,
} from "./types";

function candidate(
  kind: RuntimeNextEvent["kind"],
  at: Date | null | undefined,
  label: string,
  sourceId: string,
): RuntimeNextEvent | null {
  if (!at || Number.isNaN(at.getTime())) return null;
  return { kind, at, label, sourceId };
}

function localToDate(
  local: string | null | undefined,
  now: Date,
  timezone: string,
): Date | null {
  if (!local) return null;
  return parseFacilityLocalScheduledStart(local, now, timezone);
}

export function deriveRuntimeNextEvent(
  state: Pick<
    RuntimeLocationState,
    "operation" | "evidence" | "milestones" | "coverage" | "asOf"
  >,
  extras?: {
    assignmentTransitions?: Array<{ at: Date; label: string; sourceId: string }>;
  },
): RuntimeNextEvent | null {
  const now = state.asOf.now;
  const timezone = state.asOf.timezone;
  const candidates: RuntimeNextEvent[] = [];

  const upcoming = state.operation.upcoming;
  if (upcoming?.startsAt) {
    const at = new Date(upcoming.startsAt);
    const next = candidate(
      "cycle_start",
      at,
      upcoming.label,
      upcoming.cycleStableKey,
    );
    if (next) candidates.push(next);
  }

  if (state.operation.state === "ACTIVE" && state.operation.current) {
    const endLocal = state.operation.current.window.end;
    const at = localToDate(endLocal, now, timezone);
    const next = candidate(
      "cycle_end",
      at,
      `${state.operation.current.label} ends`,
      state.operation.current.cycleStableKey,
    );
    if (next) candidates.push(next);
  }

  for (const milestone of state.milestones.items) {
    if (!milestone.canonical) continue;
    if (milestone.statusKey === "completed_on_time" || milestone.statusKey === "completed_late") {
      continue;
    }
    const local =
      milestone.timing.expectedToday ??
      milestone.timing.adjusted ??
      milestone.timing.configured;
    const at = localToDate(local, now, timezone);
    const next = candidate("key_time", at, milestone.label, milestone.label);
    if (next) candidates.push(next);
  }

  for (const item of state.evidence.items) {
    if (item.productState === "COMPLETED" || item.productState === "COMPLETED_WITH_EXCEPTION") {
      continue;
    }
    if (item.productState === "NOT_APPLICABLE" || item.productState === "NEEDS_SETUP") {
      continue;
    }
    const start = item.window.start
      ? parseFacilityLocalScheduledStart(item.window.start, now, timezone)
      : null;
    const end = item.window.end
      ? parseFacilityLocalScheduledStart(item.window.end, now, timezone)
      : null;
    const at =
      start && start.getTime() >= now.getTime()
        ? start
        : end && end.getTime() >= now.getTime()
          ? end
          : start ?? end;
    const next = candidate(
      "evidence_window",
      at,
      item.displayName,
      item.requirementKey,
    );
    if (next) candidates.push(next);
  }

  for (const row of extras?.assignmentTransitions ?? []) {
    const next = candidate(
      "assignment_transition",
      row.at,
      row.label,
      row.sourceId,
    );
    if (next) candidates.push(next);
  }

  const future = candidates
    .filter((row) => row.at.getTime() >= now.getTime())
    .sort(
      (a, b) =>
        a.at.getTime() - b.at.getTime() ||
        a.kind.localeCompare(b.kind) ||
        a.sourceId.localeCompare(b.sourceId),
    );

  return future[0] ?? null;
}
