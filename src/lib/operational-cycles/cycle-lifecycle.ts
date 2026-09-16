/**
 * Certified Build/Run lifecycle helpers for Operational Cycles.
 *
 * Activation boundary = facility operational/service day (calendar day in facility TZ).
 * LTC sites run seven days/week — "next business day" means next operational day,
 * not Monday–Friday.
 *
 * Keep this module free of imports from load-cycle-builder / cycle-service to avoid
 * circular dependency through the package index (which breaks named exports).
 */

import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time";

import { diffMilestoneTimes, summarizeScopeChange } from "./cycle-scope";
import type { OperationalCycleDefinition } from "./types";

/** Builder row shape needed for lifecycle partitioning (avoids import cycles). */
export type CycleLifecycleRow = OperationalCycleDefinition & {
  publishedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CycleLifecycleBucket = "current" | "draft" | "scheduled" | "history";

export type CycleDraftChangeKind =
  | "added"
  | "removed"
  | "label"
  | "timing"
  | "ordering"
  | "applicable_days"
  | "location"
  | "location_inherit"
  | "key_times"
  | "type"
  | "meal"
  | "milestones"
  | "description"
  | "service_times"
  | "parent";

export type CycleDraftChange = {
  kind: CycleDraftChangeKind;
  stableKey: string;
  label: string;
  summary: string;
};

export function dayAfter(dateKey: string): string {
  const d = facilityLocalDateToServiceDate(dateKey);
  d.setUTCDate(d.getUTCDate() + 1);
  return toServiceDateKey(d);
}

export function dayBefore(dateKey: string): string {
  const d = facilityLocalDateToServiceDate(dateKey);
  d.setUTCDate(d.getUTCDate() - 1);
  return toServiceDateKey(d);
}

/** Next facility operational/service day (7-day week). */
export function nextOperationalDayKey(todayKey: string): string {
  return dayAfter(todayKey);
}

/**
 * Minimum effectiveFrom allowed when scheduling publication.
 * - No current effective config → today is allowed (first setup).
 * - Current config exists → next operational day (never rewrite today's Run).
 */
export function minimumPublishEffectiveFrom(input: {
  todayKey: string;
  hasCurrentEffectiveConfig: boolean;
}): string {
  if (input.hasCurrentEffectiveConfig) {
    return nextOperationalDayKey(input.todayKey);
  }
  return input.todayKey;
}

export function isCycleEffectiveOnDate(
  cycle: Pick<OperationalCycleDefinition, "effectiveFrom" | "effectiveTo">,
  dateKey: string,
): boolean {
  const fromKey = toServiceDateKey(cycle.effectiveFrom);
  const toKey = cycle.effectiveTo ? toServiceDateKey(cycle.effectiveTo) : null;
  if (fromKey > dateKey) return false;
  if (toKey && toKey < dateKey) return false;
  return true;
}

/** Inclusive YYYY-MM-DD effective ranges overlap. */
export function effectiveDateRangesOverlap(
  aFrom: string,
  aTo: string | null | undefined,
  bFrom: string,
  bTo: string | null | undefined,
): boolean {
  const aEnd = aTo ?? "9999-12-31";
  const bEnd = bTo ?? "9999-12-31";
  return aFrom <= bEnd && bFrom <= aEnd;
}

export function partitionCyclesForLifecycle(
  cycles: readonly CycleLifecycleRow[],
  todayKey: string,
): {
  current: CycleLifecycleRow[];
  drafts: CycleLifecycleRow[];
  scheduled: CycleLifecycleRow[];
  history: CycleLifecycleRow[];
  currentEffectiveSince: string | null;
} {
  const drafts = latestDraftsByStableKey(
    cycles.filter((c) => c.status === "DRAFT"),
  ).sort(
    (a, b) =>
      a.displaySequence - b.displaySequence || a.label.localeCompare(b.label),
  );

  const published = cycles.filter((c) => c.status === "PUBLISHED");
  const current = published
    .filter((c) => isCycleEffectiveOnDate(c, todayKey))
    .sort(
      (a, b) =>
        a.displaySequence - b.displaySequence || a.label.localeCompare(b.label),
    );
  const scheduled = published
    .filter((c) => toServiceDateKey(c.effectiveFrom) > todayKey)
    .sort(
      (a, b) =>
        toServiceDateKey(a.effectiveFrom).localeCompare(
          toServiceDateKey(b.effectiveFrom),
        ) ||
        a.displaySequence - b.displaySequence ||
        a.label.localeCompare(b.label),
    );

  const history = cycles
    .filter((c) => {
      if (c.status === "RETIRED") return true;
      if (c.status !== "PUBLISHED") return false;
      return Boolean(c.effectiveTo && toServiceDateKey(c.effectiveTo) < todayKey);
    })
    .sort(
      (a, b) =>
        toServiceDateKey(b.effectiveFrom).localeCompare(
          toServiceDateKey(a.effectiveFrom),
        ) ||
        b.version - a.version ||
        a.label.localeCompare(b.label),
    );

  let currentEffectiveSince: string | null = null;
  for (const c of current) {
    const fromKey = toServiceDateKey(c.effectiveFrom);
    if (!currentEffectiveSince || fromKey < currentEffectiveSince) {
      currentEffectiveSince = fromKey;
    }
  }

  return { current, drafts, scheduled, history, currentEffectiveSince };
}

function daysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function formatTimingSummary(
  draft: Pick<CycleLifecycleRow, "nodeKind" | "startLocal" | "endLocal">,
): string {
  if (draft.nodeKind === "KEY_TIME") return "Key Time";
  if (draft.startLocal && draft.endLocal) return `${draft.startLocal}–${draft.endLocal}`;
  return "timing updated";
}

function roomNames(ids: readonly string[], locationNames?: Readonly<Record<string, string>>): string[] {
  return ids.map((id) => locationNames?.[id] ?? "Room");
}

function summarizeKeyTimeGroups(
  groups: readonly { dueLocal: string; spaceIds: string[] }[],
  locationNames?: Readonly<Record<string, string>>,
): string {
  if (groups.length === 0) return "no due-time groups";
  return groups
    .map((group) => {
      const rooms = roomNames(group.spaceIds, locationNames);
      const roomPart =
        rooms.length === 0
          ? "no rooms"
          : rooms.length <= 2
            ? rooms.join(", ")
            : `${rooms.length} rooms`;
      return `${group.dueLocal}: ${roomPart}`;
    })
    .join("; ");
}

function keyTimeGroupsEqual(
  a: readonly { dueLocal: string; spaceIds: string[] }[],
  b: readonly { dueLocal: string; spaceIds: string[] }[],
): boolean {
  if (a.length !== b.length) return false;
  const normalize = (groups: readonly { dueLocal: string; spaceIds: string[] }[]) =>
    [...groups]
      .map((g) => ({ dueLocal: g.dueLocal, spaceIds: [...g.spaceIds].sort() }))
      .sort((x, y) => x.dueLocal.localeCompare(y.dueLocal) || x.spaceIds.join(",").localeCompare(y.spaceIds.join(",")));
  const na = normalize(a);
  const nb = normalize(b);
  return na.every(
    (group, index) =>
      group.dueLocal === nb[index]?.dueLocal && listEqual(group.spaceIds, nb[index]?.spaceIds ?? []),
  );
}

function listEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function labelForParent(
  parentStableKey: string | null | undefined,
  drafts: readonly CycleLifecycleRow[],
  current: readonly CycleLifecycleRow[],
): string | null {
  if (!parentStableKey) return null;
  return (
    drafts.find((d) => d.stableKey === parentStableKey)?.label ??
    current.find((c) => c.stableKey === parentStableKey)?.label ??
    null
  );
}

/**
 * Minimal review: draft set vs currently effective published config (by stableKey).
 */
export function reviewDraftChangesAgainstCurrent(input: {
  drafts: readonly CycleLifecycleRow[];
  current: readonly CycleLifecycleRow[];
  locationNames?: Readonly<Record<string, string>>;
  unitNames?: Readonly<Record<string, string>>;
}): CycleDraftChange[] {
  const currentByKey = new Map(input.current.map((c) => [c.stableKey, c]));
  const draftKeys = new Set(input.drafts.map((d) => d.stableKey));
  const changes: CycleDraftChange[] = [];
  const orderingTouched: CycleLifecycleRow[] = [];

  for (const draft of input.drafts) {
    const prior = currentByKey.get(draft.stableKey);
    if (!prior) {
      const parentLabel = input.drafts.find((d) => d.stableKey === draft.parentStableKey)?.label
        ?? input.current.find((c) => c.stableKey === draft.parentStableKey)?.label
        ?? null;
      changes.push({
        kind: "added",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: parentLabel
          ? `Added “${draft.label}” under “${parentLabel}” (${formatTimingSummary(draft)})`
          : `Added “${draft.label}” (${formatTimingSummary(draft)})`,
      });
      continue;
    }

    if ((draft.parentStableKey ?? null) !== (prior.parentStableKey ?? null)) {
      const fromLabel =
        labelForParent(prior.parentStableKey, input.drafts, input.current) ?? "top level";
      const toLabel =
        labelForParent(draft.parentStableKey, input.drafts, input.current) ?? "top level";
      changes.push({
        kind: "parent",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” moved from ${fromLabel === "top level" ? "top level" : `“${fromLabel}”`} to ${toLabel === "top level" ? "top level" : `“${toLabel}”`}`,
      });
    }

    if (draft.label !== prior.label) {
      changes.push({
        kind: "label",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${prior.label}” renamed to “${draft.label}”`,
      });
    }
    if (
      draft.startLocal !== prior.startLocal ||
      draft.endLocal !== prior.endLocal ||
      draft.overnight !== prior.overnight ||
      draft.nodeKind !== prior.nodeKind
    ) {
      changes.push({
        kind: "timing",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” timing ${formatTimingSummary(prior)} → ${formatTimingSummary(draft)}`,
      });
    }
    if (draft.displaySequence !== prior.displaySequence) {
      // Collected below into parent-scoped summaries (avoid raw order-number noise).
      orderingTouched.push(draft);
    }
    if (!daysEqual(draft.applicableDaysOfWeek, prior.applicableDaysOfWeek)) {
      changes.push({
        kind: "applicable_days",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” applicable days changed`,
      });
    }
    if (draft.locationInheritFromParent !== prior.locationInheritFromParent) {
      changes.push({
        kind: "location_inherit",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: draft.locationInheritFromParent
          ? `“${draft.label}” now inherits locations from its parent phase`
          : `“${draft.label}” no longer inherits locations from its parent phase`,
      });
    }
    if (
      !draft.locationInheritFromParent &&
      (draft.locationMode !== prior.locationMode ||
        !listEqual(draft.applicableUnitTypes, prior.applicableUnitTypes) ||
        !listEqual(draft.unitIds, prior.unitIds) ||
        !listEqual(draft.spaceIds, prior.spaceIds) ||
        (draft.roomTypeKey ?? "") !== (prior.roomTypeKey ?? ""))
    ) {
      const addedSpaces = draft.spaceIds.filter((id) => !prior.spaceIds.includes(id));
      const removedSpaces = prior.spaceIds.filter((id) => !draft.spaceIds.includes(id));
      if (addedSpaces.length > 0 || removedSpaces.length > 0) {
        const added = roomNames(addedSpaces, input.locationNames);
        const removed = roomNames(removedSpaces, input.locationNames);
        const parts: string[] = [];
        if (added.length > 0) {
          parts.push(
            added.length <= 3 ? `added ${added.join(", ")}` : `added ${added.length} rooms`,
          );
        }
        if (removed.length > 0) {
          parts.push(
            removed.length <= 3 ? `removed ${removed.join(", ")}` : `removed ${removed.length} rooms`,
          );
        }
        changes.push({
          kind: "location",
          stableKey: draft.stableKey,
          label: draft.label,
          summary: `“${draft.label}” rooms: ${parts.join("; ")}`,
        });
      } else {
        const detail =
          summarizeScopeChange({
            from: {
              locationMode: prior.locationMode,
              roomTypeKey: prior.roomTypeKey,
              unitIds: prior.unitIds,
              spaceIds: prior.spaceIds,
            },
            to: {
              locationMode: draft.locationMode,
              roomTypeKey: draft.roomTypeKey,
              unitIds: draft.unitIds,
              spaceIds: draft.spaceIds,
            },
            locationNames: input.locationNames,
          }) ?? "location scope changed";
        changes.push({
          kind: "location",
          stableKey: draft.stableKey,
          label: draft.label,
          summary: `“${draft.label}” scope: ${detail}`,
        });
      }
    }
    if (!keyTimeGroupsEqual(draft.keyTimeGroups, prior.keyTimeGroups)) {
      changes.push({
        kind: "key_times",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” Key Times: ${summarizeKeyTimeGroups(prior.keyTimeGroups, input.locationNames)} → ${summarizeKeyTimeGroups(draft.keyTimeGroups, input.locationNames)}`,
      });
    }
    if (draft.cycleType !== prior.cycleType) {
      changes.push({
        kind: "type",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” type ${prior.cycleType} → ${draft.cycleType}`,
      });
    }
    if (draft.mealType !== prior.mealType) {
      changes.push({
        kind: "meal",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” meal association changed`,
      });
    }
    if (!listEqual(draft.expectedMilestones, prior.expectedMilestones)) {
      changes.push({
        kind: "milestones",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” expected milestones changed`,
      });
    }
    if ((draft.description ?? "") !== (prior.description ?? "")) {
      changes.push({
        kind: "description",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” description changed`,
      });
    }
    const timeDiff = diffMilestoneTimes({
      prior: prior.milestoneTimes,
      next: draft.milestoneTimes,
      unitNames: input.unitNames ?? input.locationNames,
    });
    if (timeDiff.changedCount + timeDiff.addedCount + timeDiff.removedCount > 0) {
      const compact =
        timeDiff.changedCount > 0 && timeDiff.addedCount === 0 && timeDiff.removedCount === 0
          ? timeDiff.summaries.join("; ")
          : timeDiff.addedCount > 0 && timeDiff.changedCount === 0 && timeDiff.removedCount === 0
            ? `${timeDiff.addedCount} Neighborhood service time${timeDiff.addedCount === 1 ? "" : "s"} configured`
            : timeDiff.summaries.slice(0, 6).join("; ");
      changes.push({
        kind: "service_times",
        stableKey: draft.stableKey,
        label: draft.label,
        summary: `“${draft.label}” Meal Service Start: ${compact}`,
      });
    }
  }

  for (const current of input.current) {
    if (draftKeys.has(current.stableKey)) continue;
    void current;
  }

  // Collapse sibling displaySequence churn into one human line per parent group.
  // Skip cycles that already have an explicit parent move (that is the user intent).
  const movedKeys = new Set(
    changes.filter((c) => c.kind === "parent").map((c) => c.stableKey),
  );
  const orderGroups = new Map<string, string>();
  for (const draft of orderingTouched) {
    if (movedKeys.has(draft.stableKey)) continue;
    const parentKey = draft.parentStableKey ?? "";
    const parentLabel =
      labelForParent(draft.parentStableKey, input.drafts, input.current) ?? "top level";
    if (!orderGroups.has(parentKey)) {
      orderGroups.set(
        parentKey,
        parentKey
          ? `Reordered phases in “${parentLabel}”`
          : "Reordered top-level cycles",
      );
    }
  }
  for (const [parentKey, summary] of orderGroups) {
    changes.push({
      kind: "ordering",
      stableKey: parentKey || "__roots__",
      label: summary,
      summary,
    });
  }

  return changes;
}

/** Keep the highest version per stableKey so duplicate draft copies do not stack. */
export function latestDraftsByStableKey<T extends { stableKey: string; version: number }>(
  drafts: readonly T[],
): T[] {
  const latest = new Map<string, T>();
  for (const draft of drafts) {
    const prior = latest.get(draft.stableKey);
    if (!prior || draft.version > prior.version) {
      latest.set(draft.stableKey, draft);
    }
  }
  return [...latest.values()];
}

export function latestDraftEditedAt(drafts: readonly CycleLifecycleRow[]): Date | null {
  let latest: Date | null = null;
  for (const d of drafts) {
    if (!latest || d.updatedAt > latest) latest = d.updatedAt;
  }
  return latest;
}
