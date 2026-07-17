/**
 * Wave 15J — intersect live OC engine outputs with Projection eligibility.
 *
 * Never broadens. Documents remaining broad queries via diagnostics counts.
 */

import { summarizeCallDowns } from "@/lib/todays-work/call-down";
import type { CallDownData } from "@/lib/todays-work/call-down";

import { computeSitePulse } from "../compute-site-pulse";
import type { DashboardQueryResult } from "../load-dashboard-queries";
import type {
  OperationsCenterDashboardData,
  OperationsCenterUnitCard,
} from "../types";

import type { ProjectedOperationsCenterScope } from "./types";

function countDomainRows(queries: DashboardQueryResult): number {
  return (
    queries.units.length +
    queries.assignments.length +
    queries.submissionsToday.length +
    queries.scheduleEntriesToday.length +
    queries.overridesToday.length +
    queries.openRepairs.length +
    queries.serveryMealServiceEventsToday.length +
    (queries.roomAreaStatusesToday?.length ?? 0) +
    (queries.outOfServiceAssets?.length ?? 0) +
    (queries.pmSchedulesDueThroughToday?.length ?? 0)
  );
}

/**
 * Intersect dashboard query rows with projected Unit ids.
 * Used when loaders still fetch facility-wide (documented remaining broad query)
 * or as a safety net after early-scoped loads.
 */
export function intersectDashboardQueriesToProjectedUnits(
  queries: DashboardQueryResult,
  projectedUnitIds: readonly string[],
): DashboardQueryResult {
  const allowed = new Set(projectedUnitIds);

  const units = queries.units.filter((u) => allowed.has(u.id));
  const assignments = queries.assignments.filter((a) => allowed.has(a.unitId));
  const submissionsToday = queries.submissionsToday.filter((s) =>
    allowed.has(s.unitId),
  );
  const scheduleEntriesToday = queries.scheduleEntriesToday.filter((e) =>
    allowed.has(e.unitId),
  );
  const overridesToday = queries.overridesToday.filter(
    (o) =>
      allowed.has(o.newUnitId) ||
      (o.oldUnitId != null && allowed.has(o.oldUnitId)),
  );
  const openRepairs = queries.openRepairs.filter((r) => allowed.has(r.unitId));
  const serveryMealServiceEventsToday =
    queries.serveryMealServiceEventsToday.filter((e) => allowed.has(e.unitId));
  const roomAreaStatusesToday = (queries.roomAreaStatusesToday ?? []).filter(
    (r) => allowed.has(r.unitId),
  );
  const outOfServiceAssets = (queries.outOfServiceAssets ?? []).filter((a) =>
    allowed.has(a.unitId),
  );
  const pmSchedulesDueThroughToday = (
    queries.pmSchedulesDueThroughToday ?? []
  ).filter((s) => {
    const unitId = s.asset?.unitId;
    return unitId != null && allowed.has(unitId);
  });

  return {
    ...queries,
    units,
    assignments,
    submissionsToday,
    scheduleEntriesToday,
    overridesToday,
    openRepairs,
    serveryMealServiceEventsToday,
    roomAreaStatusesToday,
    outOfServiceAssets,
    pmSchedulesDueThroughToday,
  };
}

export function filterCallDownsToProjectedUnits(
  data: CallDownData,
  projectedUnitIds: readonly string[],
): CallDownData {
  const allowed = new Set(projectedUnitIds);
  const items = data.items.filter(
    (item) =>
      allowed.has(item.newUnitId) ||
      (item.oldUnitId != null && allowed.has(item.oldUnitId)),
  );
  return {
    ...data,
    items,
    summary: summarizeCallDowns(items),
  };
}

function filterUnitCards(
  cards: OperationsCenterUnitCard[],
  allowed: Set<string>,
): OperationsCenterUnitCard[] {
  return cards.filter((c) => allowed.has(c.id));
}

/**
 * Apply Projection scope to composed OC dashboard aggregates.
 * Recomputes exception lists / totals / Site Pulse from projected Units only.
 */
export function applyProjectedScopeToDashboard(
  data: OperationsCenterDashboardData,
  scope: ProjectedOperationsCenterScope,
): OperationsCenterDashboardData {
  const allowed = new Set(scope.projectedUnitIds);
  const unitCards = filterUnitCards(data.unitCards, allowed);

  const totals = unitCards.reduce(
    (acc, unit) => {
      acc.expected += unit.expected;
      acc.completed += unit.completed;
      acc.failed += unit.failed;
      acc.missed += unit.missed;
      acc.pending += unit.pending;
      return acc;
    },
    { expected: 0, completed: 0, failed: 0, missed: 0, pending: 0 },
  );

  const unitsWithExceptions = unitCards
    .filter(
      (unit) =>
        unit.failed > 0 ||
        unit.pending > 0 ||
        unit.missed > 0 ||
        unit.staffingCount === 0 ||
        unit.openRepairCount > 0,
    )
    .sort(
      (a, b) =>
        b.failed + b.pending + b.missed - (a.failed + a.pending + a.missed),
    );

  const unitsMissingStaffing = unitCards.filter(
    (unit) => unit.staffingCount === 0,
  );

  const mealBoards = data.mealBoards.map((board) => ({
    ...board,
    rows: board.rows.filter((row) => allowed.has(row.unitId)),
  }));

  const openRepairCount = unitCards.reduce(
    (sum, u) => sum + u.openRepairCount,
    0,
  );

  const callDowns = data.callDowns
    ? filterCallDownsToProjectedUnits(
        {
          items: data.callDowns.items,
          summary: data.callDowns.summary,
          dateIso: data.callDowns.dateIso,
        },
        scope.projectedUnitIds,
      )
    : undefined;

  const sitePulse = computeSitePulse(unitCards);

  return {
    ...data,
    unitCount: unitCards.length,
    unitCards,
    totals,
    unitsWithExceptions,
    unitsMissingStaffing,
    mealBoards,
    openRepairCount,
    // urgentRepairCount already from scoped queries when early-scoped;
    // clamp by not exceeding openRepairCount when cards lost units.
    urgentRepairCount: Math.min(data.urgentRepairCount, openRepairCount),
    sitePulse,
    callDowns: callDowns
      ? {
          items: callDowns.items,
          summary: callDowns.summary,
          dateIso: callDowns.dateIso,
        }
      : data.callDowns,
  };
}

export function measureDomainRowIntersection(
  before: DashboardQueryResult,
  after: DashboardQueryResult,
): { before: number; after: number } {
  return {
    before: countDomainRows(before),
    after: countDomainRows(after),
  };
}
