import type { UnitType } from "@prisma/client";

import type { LocationsTreeNode } from "@/lib/locations";
import {
  type LocationPulseBucket,
  type OperationContext,
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
  spaceId?: string | null;
  typeLabel?: string | null;
  parentContext?: string | null;
};

export function walkListItemKey(item: Pick<WalkListItem, "unitId" | "spaceId">): string {
  return item.spaceId ? `${item.unitId}:${item.spaceId}` : item.unitId;
}

export function walkListWorkspaceCta(item: Pick<WalkListItem, "spaceId">): string {
  return item.spaceId ? "Open room workspace" : "Open unit workspace";
}

export type RoomKeyTimeAttention = {
  unitId: string;
  spaceId: string;
  spaceName: string;
  facilityRoomTypeName: string | null;
  unitName: string | null;
  unitType: UnitType;
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

function roomKeyTimeWalkItem(room: RoomKeyTimeAttention, template?: WalkListItem): WalkListItem {
  return {
    unitId: room.unitId,
    unitName: room.spaceName,
    unitType: template?.unitType ?? room.unitType,
    status: "blocked",
    reason: "Key Time overdue",
    href: `/unit/${room.unitId}?space=${encodeURIComponent(room.spaceId)}`,
    failed: template?.failed ?? 0,
    missed: template?.missed ?? 0,
    pending: template?.pending ?? 0,
    openRepairCount: template?.openRepairCount ?? 0,
    staffingCount: template?.staffingCount ?? 0,
    attentionScore: (template?.attentionScore ?? 0) + 50,
    spaceId: room.spaceId,
    typeLabel: room.facilityRoomTypeName,
    parentContext: room.unitName,
  };
}

export function applyRoomKeyTimeAttention(
  items: WalkListItem[],
  rooms: readonly RoomKeyTimeAttention[],
): WalkListItem[] {
  if (rooms.length === 0) return items;
  const roomsByUnit = new Map<string, RoomKeyTimeAttention[]>();
  for (const room of rooms) {
    const list = roomsByUnit.get(room.unitId) ?? [];
    list.push(room);
    roomsByUnit.set(room.unitId, list);
  }

  const next: WalkListItem[] = [];
  const consumedUnits = new Set<string>();
  for (const item of items) {
    if (item.spaceId) {
      next.push(item);
      continue;
    }
    const unitRooms = roomsByUnit.get(item.unitId) ?? [];
    if (unitRooms.length === 0) {
      next.push(item);
      continue;
    }
    consumedUnits.add(item.unitId);
    const roomItems = unitRooms.map((room) => roomKeyTimeWalkItem(room, item));
    if (item.status === "ready") {
      next.push(...roomItems);
    } else {
      next.push(item, ...roomItems);
    }
  }

  for (const [unitId, unitRooms] of roomsByUnit) {
    if (consumedUnits.has(unitId)) continue;
    next.push(...unitRooms.map((room) => roomKeyTimeWalkItem(room)));
  }

  return next.sort((a, b) => {
    const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (statusDiff !== 0) return statusDiff;
    if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
    return a.unitName.localeCompare(b.unitName);
  });
}

export type ActionableWalkRoom = {
  spaceId: string;
  unitId: string;
  name: string;
  href: string;
  roomTypeLabel: string | null;
  parentContext: string | null;
};

function parentContextFromAncestors(
  ancestors: readonly { kind: LocationsTreeNode["kind"]; label: string }[],
): string | null {
  const neighborhood = [...ancestors]
    .reverse()
    .find((node) => node.kind === "NEIGHBORHOOD" || node.kind === "LEGACY");
  const floor = [...ancestors].reverse().find((node) => node.kind === "FLOOR");
  const parts = [neighborhood?.label, floor?.label].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function collectActionableWalkRooms(
  roots: readonly LocationsTreeNode[],
): ActionableWalkRoom[] {
  const rooms: ActionableWalkRoom[] = [];
  const visit = (
    nodes: readonly LocationsTreeNode[],
    ancestors: { kind: LocationsTreeNode["kind"]; label: string }[],
  ) => {
    for (const node of nodes) {
      if (
        node.kind === "ROOM" &&
        node.presentation === "ACTIONABLE" &&
        node.href &&
        node.unitId
      ) {
        rooms.push({
          spaceId: node.physicalId,
          unitId: node.unitId,
          name: node.label,
          href: node.href,
          roomTypeLabel: null,
          parentContext: parentContextFromAncestors(ancestors),
        });
      }
      const nextAncestors =
        node.kind === "FACILITY" || node.kind === "ROOM"
          ? ancestors
          : [...ancestors, { kind: node.kind, label: node.label }];
      visit(node.children, nextAncestors);
    }
  };
  visit(roots, []);
  return rooms;
}

function unitIssueIsStaffingOnly(unit: WalkListItem | undefined): boolean {
  if (!unit) return false;
  const hasOperationalIssue =
    unit.failed > 0 || unit.missed > 0 || unit.pending > 0 || unit.openRepairCount > 0;
  if (hasOperationalIssue) return false;
  return /staff/i.test(unit.reason) || unit.staffingCount === 0;
}

export type RoomKeyTimeWalkSignal = {
  spaceId: string;
  overdueLabel: string | null;
  roomTypeLabel: string | null;
};

/**
 * Today's Work triage set for new-model Dietary: actionable Rooms only.
 * Floors and structural Neighborhoods are context, not ranked items.
 * Staffing is Unit-grain and is not inferred as a Room having no staff.
 */
export function buildActionableRoomWalkList(input: {
  rooms: readonly ActionableWalkRoom[];
  unitItems: readonly WalkListItem[];
  keyTimes: readonly RoomKeyTimeWalkSignal[];
}): WalkListItem[] {
  const unitById = new Map(
    input.unitItems.filter((item) => !item.spaceId).map((item) => [item.unitId, item]),
  );
  const keyTimeBySpace = new Map(input.keyTimes.map((row) => [row.spaceId, row]));

  const items = input.rooms.map((room) => {
    const unit = unitById.get(room.unitId);
    const keyTime = keyTimeBySpace.get(room.spaceId);
    const staffingOnly = unitIssueIsStaffingOnly(unit);
    const overdueLabel = keyTime?.overdueLabel ?? null;

    let status: WalkListStatus = "ready";
    let reason = "No immediate exceptions";
    let attentionScoreValue = 0;

    if (unit && !staffingOnly && unit.failed > 0) {
      status = "blocked";
      reason = unit.reason;
      attentionScoreValue = unit.attentionScore;
    } else if (overdueLabel) {
      status = "blocked";
      reason = overdueLabel;
      attentionScoreValue = (unit?.attentionScore ?? 0) + 50;
    } else if (unit && !staffingOnly && unit.status !== "ready") {
      status = unit.status;
      reason = unit.reason;
      attentionScoreValue = unit.attentionScore;
    }

    return {
      unitId: room.unitId,
      unitName: room.name,
      unitType: unit?.unitType ?? "OTHER",
      status,
      reason,
      href: room.href,
      failed: unit?.failed ?? 0,
      missed: unit?.missed ?? 0,
      pending: unit?.pending ?? 0,
      openRepairCount: unit?.openRepairCount ?? 0,
      staffingCount: unit?.staffingCount ?? 0,
      attentionScore: attentionScoreValue,
      spaceId: room.spaceId,
      typeLabel: room.roomTypeLabel ?? keyTime?.roomTypeLabel ?? null,
      parentContext: room.parentContext,
    } satisfies WalkListItem;
  });

  return items.sort((a, b) => {
    const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (statusDiff !== 0) return statusDiff;
    if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
    return a.unitName.localeCompare(b.unitName);
  });
}
