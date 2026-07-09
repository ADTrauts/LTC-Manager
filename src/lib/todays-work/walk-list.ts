import type { UnitType } from "@prisma/client";

import {
  type LocationPulseBucket,
  type OperationsCenterUnitCard,
} from "@/lib/operations-center";
import type { UnitReadiness } from "@/lib/readiness/types";

export type WalkListStatus = LocationPulseBucket;

export type WalkListItem = {
  unitId: string;
  unitName: string;
  unitType: UnitType;
  status: WalkListStatus;
  reason: string;
  href: string;
  failed: number;
  missed: number;
  pending: number;
  openRepairCount: number;
  staffingCount: number;
  attentionScore: number;
};

export type WalkListSummary = {
  total: number;
  blocked: number;
  inProgress: number;
  ready: number;
};

export type WalkListData = {
  items: WalkListItem[];
  summary: WalkListSummary;
  operationContext: OperationContext;
  lookFirst: WalkListItem | null;
};

const STATUS_RANK: Record<WalkListStatus, number> = {
  blocked: 0,
  in_progress: 1,
  ready: 2,
};

export function resolveWalkListReason(unit: OperationsCenterUnitCard, status: WalkListStatus): string {
  if (status === "ready") {
    return "No immediate exceptions";
  }

  if (unit.failed > 0) {
    return `${unit.failed} failed log${unit.failed === 1 ? "" : "s"} today`;
  }
  if (unit.missed > 0) {
    return `${unit.missed} missed log${unit.missed === 1 ? "" : "s"} today`;
  }
  if (unit.unitType === "SERVERY" && unit.staffingCount === 0) {
    return "Servery has no staff coverage";
  }
  if (unit.pending > 0) {
    return `${unit.pending} log${unit.pending === 1 ? "" : "s"} still due`;
  }
  if (unit.openRepairCount > 0) {
    return `${unit.openRepairCount} open repair${unit.openRepairCount === 1 ? "" : "s"}`;
  }
  if (unit.staffingCount === 0) {
    return "No staff scheduled today";
  }
  if (unit.expected > 0 && unit.completed < unit.expected) {
    return "Log completion behind expected";
  }
  return "Needs a closer look";
}

function attentionScore(unit: OperationsCenterUnitCard): number {
  return (
    unit.failed * 100 +
    unit.missed * 80 +
    unit.pending * 10 +
    unit.openRepairCount * 8 +
    (unit.staffingCount === 0 ? 40 : 0)
  );
}

export function buildWalkListItems(
  unitCards: OperationsCenterUnitCard[],
  readinessByUnitId: Map<string, UnitReadiness>,
): WalkListItem[] {
  return unitCards
    .map((unit) => {
      const readiness = readinessByUnitId.get(unit.id);
      const status: WalkListStatus = readiness?.state ?? "ready";
      const reason =
        status === "ready" ? "No immediate exceptions" : (readiness?.reason ?? "Needs a closer look");
      return {
        unitId: unit.id,
        unitName: unit.name,
        unitType: unit.unitType,
        status,
        reason,
        href: `/unit/${unit.id}`,
        failed: unit.failed,
        missed: unit.missed,
        pending: unit.pending,
        openRepairCount: unit.openRepairCount,
        staffingCount: unit.staffingCount,
        attentionScore: attentionScore(unit),
      };
    })
    .sort((a, b) => {
      const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (statusDiff !== 0) return statusDiff;
      if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
      return a.unitName.localeCompare(b.unitName);
    });
}

export function summarizeWalkList(items: WalkListItem[]): WalkListSummary {
  let blocked = 0;
  let inProgress = 0;
  let ready = 0;
  for (const item of items) {
    if (item.status === "blocked") blocked += 1;
    else if (item.status === "in_progress") inProgress += 1;
    else ready += 1;
  }
  return { total: items.length, blocked, inProgress, ready };
}
