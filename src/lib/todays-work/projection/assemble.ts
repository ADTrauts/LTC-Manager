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

import type {
  TodaysWorkExperienceContributor,
  TodaysWorkProjectionView,
} from "./types";

export type ExperienceWalkContribution = {
  experienceKey: string;
  label: string;
  areaKey: string;
  areaLabel: string;
  order: number;
  tools: TodaysWorkExperienceContributor["tools"];
  actions: TodaysWorkExperienceContributor["actions"];
  /** Walk items for this Experience's unit scope, ranked by engine priority. */
  items: WalkListItem[];
};

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

/**
 * Attach walk items to Experience contributors without reordering Experiences.
 * Priority within each Experience comes from the already-ranked walk list order.
 */
export function assembleExperienceWalkContributions(
  projection: TodaysWorkProjectionView,
  walkItems: readonly WalkListItem[],
): ExperienceWalkContribution[] {
  const byUnit = new Map(walkItems.map((item) => [item.unitId, item]));
  const contributions: ExperienceWalkContribution[] = [];

  for (const section of projection.sections) {
    for (const area of section.areas) {
      for (const experience of area.experiences) {
        const unitPool =
          experience.unitIds.length > 0
            ? experience.unitIds
            : projection.actionableUnitIds;
        const items = unitPool
          .map((unitId) => byUnit.get(unitId))
          .filter((item): item is WalkListItem => item != null);
        // Preserve walk ranking (already sorted by engine priority).
        const ranked = [...items].sort((a, b) => {
          const ai = walkItems.findIndex((w) => w.unitId === a.unitId);
          const bi = walkItems.findIndex((w) => w.unitId === b.unitId);
          return ai - bi;
        });
        contributions.push({
          experienceKey: experience.experienceKey,
          label: experience.label,
          areaKey: area.areaKey,
          areaLabel: area.label,
          order: experience.order,
          tools: experience.tools,
          actions: experience.actions,
          items: ranked,
        });
      }
    }
  }

  // Stable Experience order as emitted (Area order already applied in adapter).
  return contributions;
}
