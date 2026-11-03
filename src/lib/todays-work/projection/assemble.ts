/**
 * Wave 15I — filter / assemble engine outputs within Projection eligibility.
 */

import type { CallDownData, CallDownItem } from "../call-down";
import type { CoverageData, CoverageItem } from "../coverage-list";
import type { HandoffData, HandoffItem, HandoffSection } from "../handoffs";
import type { WalkListData, WalkListItem } from "../walk-list";
import { summarizeWalkList } from "../walk-list";
import { summarizeCoverage } from "../coverage-list";
import { summarizeCallDowns } from "../call-down";
import { summarizeHandoffs } from "../handoffs";

export function filterWalkListToProjectedUnits(
  walk: WalkListData,
  projectedUnitIds: readonly string[],
): WalkListData {
  const allowed = new Set(projectedUnitIds);
  const items = walk.items.filter((item) => allowed.has(item.unitId));
  return {
    ...walk,
    items,
    summary: summarizeWalkList(items),
    lookFirst: items.find((item) => item.status !== "ready") ?? items[0] ?? null,
  };
}

export function filterCoverageToProjectedUnits(
  coverage: CoverageData,
  projectedUnitIds: readonly string[],
): CoverageData {
  const allowed = new Set(projectedUnitIds);
  const items = coverage.items.filter((item: CoverageItem) =>
    allowed.has(item.unitId),
  );
  return {
    ...coverage,
    items,
    summary: summarizeCoverage(items),
  };
}

export function filterCallDownsToProjectedUnits(
  data: CallDownData,
  projectedUnitIds: readonly string[],
): CallDownData {
  const allowed = new Set(projectedUnitIds);
  const items = data.items.filter(
    (item: CallDownItem) =>
      allowed.has(item.newUnitId) ||
      (item.oldUnitId != null && allowed.has(item.oldUnitId)),
  );
  return {
    ...data,
    items,
    summary: summarizeCallDowns(items),
  };
}

export function filterHandoffsToProjectedUnits(
  data: HandoffData,
  projectedUnitIds: readonly string[],
): HandoffData {
  const allowed = new Set(projectedUnitIds);
  const keep = (item: HandoffItem) =>
    item.unitId == null || allowed.has(item.unitId);

  const sections: HandoffSection[] = data.sections
    .map((section) => ({
      ...section,
      items: section.items.filter(keep),
    }))
    .filter((section) => section.items.length > 0);

  const allItems = sections.flatMap((s) => s.items);
  return {
    ...data,
    sections,
    summary: summarizeHandoffs(sections),
    isClear: allItems.length === 0,
  };
}
