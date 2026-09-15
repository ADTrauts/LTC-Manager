/**
 * Assemble supervisor operating-location status from Room truth.
 * Reuses presentLocationRunOperation / describeKeyTimeStatus — does not reinterpret Key Times.
 */

import type { RunLocationOperationPresentation } from "@/lib/operational-cycles";
import type { RunLocationKeyTimeView } from "@/lib/operational-cycles/present-run-operation";

import type { WalkListItem, WalkListStatus } from "../walk-list";
import { summarizeWalkList, type WalkListData } from "../walk-list";
import type { OperationContext } from "@/lib/operations-center";

import type {
  OperatingLocationBoard,
  OperatingLocationBoardSummary,
  OperatingLocationCurrentOperation,
  OperatingLocationIssue,
  OperatingLocationIssueFacts,
  OperatingLocationKeyTime,
  OperatingLocationStaffing,
  OperatingLocationStatus,
  OperatingLocationStatusKey,
  SupervisorOperatingLocation,
} from "./types";

export type RoomOperationView = {
  spaceId: string;
  presentation: RunLocationOperationPresentation;
};

export type OperatingLocationStaffingInput = {
  assignedCount: number | null;
  expectedCount: number | null;
};

const STATUS_RANK: Record<OperatingLocationStatusKey, number> = {
  needs_attention: 0,
  in_progress: 1,
  on_track: 2,
};

export function presentStaffingFact(input: OperatingLocationStaffingInput): OperatingLocationStaffing {
  const { assignedCount, expectedCount } = input;
  if (assignedCount == null) {
    return {
      kind: "unknown",
      label: "Staffing not assigned",
      assignedCount: null,
      expectedCount,
    };
  }
  if (expectedCount == null) {
    if (assignedCount === 0) {
      return {
        kind: "unknown",
        label: "Staffing not assigned",
        assignedCount: 0,
        expectedCount: null,
      };
    }
    return {
      kind: "assigned_only",
      label: `${assignedCount} assigned`,
      assignedCount,
      expectedCount: null,
    };
  }
  if (assignedCount === 0 && expectedCount > 0) {
    return {
      kind: "uncovered",
      label: "Uncovered",
      assignedCount,
      expectedCount,
    };
  }
  if (assignedCount < expectedCount) {
    return {
      kind: "short",
      label: `Short ${expectedCount - assignedCount}`,
      assignedCount,
      expectedCount,
    };
  }
  return {
    kind: "covered",
    label: `Covered · ${assignedCount} assigned`,
    assignedCount,
    expectedCount,
  };
}

function contextLabelFor(
  location: SupervisorOperatingLocation,
  lensMode: "DEPARTMENT" | "FACILITY",
): string | null {
  const parts: string[] = [];
  if (lensMode === "FACILITY" && location.departmentLabel) {
    parts.push(location.departmentLabel);
  }
  if (location.kind === "NEIGHBORHOOD") {
    if (location.rooms.length === 1) {
      const room = location.rooms[0]!;
      parts.push(...[room.name, room.roomTypeLabel].filter((value): value is string => Boolean(value)));
    } else if (location.rooms.length > 1) {
      parts.push(`${location.rooms.length} rooms`);
    } else if (location.floorLabel) {
      parts.push(location.floorLabel);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  const room = location.rooms[0];
  if (room?.roomTypeLabel) parts.push(room.roomTypeLabel);
  else if (location.floorLabel) parts.push(location.floorLabel);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function hrefFor(location: SupervisorOperatingLocation): string {
  if (location.rooms.length === 1) return location.rooms[0]!.href;
  if (location.rooms.length > 1) return `/unit/${location.unitId}`;
  return `/unit/${location.unitId}`;
}

export function aggregateCurrentOperation(
  views: readonly RoomOperationView[],
): OperatingLocationCurrentOperation {
  const active = views.filter((view) => view.presentation.currentOperation.state === "ACTIVE");
  const labels = [
    ...new Set(
      active
        .map((view) => view.presentation.currentOperation.hierarchyLabel)
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  if (labels.length === 0) {
    return { label: null, detail: null, phaseCount: 0 };
  }
  if (labels.length === 1) {
    return { label: labels[0]!, detail: null, phaseCount: 1 };
  }
  return {
    label: `${labels.length} active phases`,
    detail: labels.join(" · "),
    phaseCount: labels.length,
  };
}

function formatSingleKeyTime(row: RunLocationKeyTimeView): string {
  if (row.statusKey === "overdue") return `${row.label} · ${row.statusLabel}`;
  if (row.statusKey === "due") return `${row.label} · Due now`;
  if (row.statusKey === "completed_on_time" || row.statusKey === "completed_late") {
    return `${row.label} · Complete ${row.actualLabel ?? row.dueLabel}`;
  }
  return `${row.label} · ${row.dueLabel}`;
}

function formatGroupKeyTime(
  label: string,
  completed: number,
  total: number,
  overdue: number,
  representative: RunLocationKeyTimeView,
): string {
  if (total <= 1) return formatSingleKeyTime(representative);
  const parts = [`${completed} / ${total} complete`];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  return `${label} · ${parts.join(" · ")}`;
}

type KeyTimeGroup = {
  label: string;
  dueLabel: string;
  rows: RunLocationKeyTimeView[];
};

function groupKeyTimes(views: readonly RoomOperationView[]): KeyTimeGroup[] {
  const groups = new Map<string, KeyTimeGroup>();
  for (const view of views) {
    for (const row of view.presentation.keyTimes) {
      const key = `${row.label}::${row.dueLabel}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.set(key, { label: row.label, dueLabel: row.dueLabel, rows: [row] });
      }
    }
  }
  return [...groups.values()];
}

function groupPriority(group: KeyTimeGroup): number {
  const incomplete = group.rows.filter((row) => !row.actualLabel);
  if (incomplete.some((row) => row.statusKey === "overdue")) return 0;
  if (incomplete.some((row) => row.statusKey === "due")) return 1;
  if (incomplete.some((row) => row.statusKey === "upcoming" || row.statusKey === "adjusted")) {
    return 2;
  }
  return 3;
}

function soonestUpcomingMinutes(group: KeyTimeGroup): string {
  const upcoming = group.rows
    .filter((row) => !row.actualLabel)
    .map((row) => row.dueLabel)
    .sort();
  return upcoming[0] ?? group.dueLabel;
}

function latestActual(group: KeyTimeGroup): string {
  const actuals = group.rows
    .map((row) => row.actualLabel)
    .filter((value): value is string => Boolean(value))
    .sort();
  return actuals[actuals.length - 1] ?? "";
}

export function selectPrimaryKeyTime(
  views: readonly RoomOperationView[],
): OperatingLocationKeyTime | null {
  const groups = groupKeyTimes(views);
  if (groups.length === 0) return null;

  groups.sort((a, b) => {
    const priorityDiff = groupPriority(a) - groupPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    const aPriority = groupPriority(a);
    if (aPriority === 2) {
      return soonestUpcomingMinutes(a).localeCompare(soonestUpcomingMinutes(b));
    }
    if (aPriority === 3) {
      return latestActual(b).localeCompare(latestActual(a));
    }
    return a.label.localeCompare(b.label);
  });

  const chosen = groups[0]!;
  const completed = chosen.rows.filter((row) => Boolean(row.actualLabel)).length;
  const overdue = chosen.rows.filter(
    (row) => !row.actualLabel && row.statusKey === "overdue",
  ).length;
  const representative =
    chosen.rows.find((row) => !row.actualLabel && row.statusKey === "overdue") ??
    chosen.rows.find((row) => !row.actualLabel && row.statusKey === "due") ??
    chosen.rows.find((row) => !row.actualLabel) ??
    chosen.rows[0]!;
  const mixed = new Set(chosen.rows.map((row) => row.statusKey)).size > 1;

  return {
    label: chosen.label,
    summary: formatGroupKeyTime(
      chosen.label,
      completed,
      chosen.rows.length,
      overdue,
      representative,
    ),
    statusKey: mixed ? "mixed" : representative.statusKey,
    overdueCount: overdue,
    completedCount: completed,
    total: chosen.rows.length,
  };
}

function collectIssues(input: {
  location: SupervisorOperatingLocation;
  views: readonly RoomOperationView[];
  keyTime: OperatingLocationKeyTime | null;
  staffing: OperatingLocationStaffing;
  facts: OperatingLocationIssueFacts;
}): OperatingLocationIssue[] {
  const issues: OperatingLocationIssue[] = [];
  if (input.keyTime && input.keyTime.overdueCount > 0) {
    const overdueRooms = input.views.flatMap((view) =>
      view.presentation.keyTimes
        .filter((row) => !row.actualLabel && row.statusKey === "overdue")
        .map((row) => ({
          kind: "key_time" as const,
          label: `${row.label} overdue`,
          spaceId: view.spaceId,
          spaceName: view.presentation.location.title,
        })),
    );
    issues.push(...overdueRooms);
    if (overdueRooms.length === 0) {
      issues.push({
        kind: "key_time",
        label: `${input.keyTime.label} overdue`,
        spaceId: input.location.rooms[0]?.spaceId ?? null,
        spaceName: input.location.rooms[0]?.name ?? null,
      });
    }
  }
  if (input.facts.failedLogs > 0) {
    issues.push({
      kind: "log",
      label: `${input.facts.failedLogs} failed log${input.facts.failedLogs === 1 ? "" : "s"}`,
      spaceId: null,
      spaceName: null,
    });
  }
  if (input.facts.missedLogs > 0) {
    issues.push({
      kind: "log",
      label: `${input.facts.missedLogs} missed log${input.facts.missedLogs === 1 ? "" : "s"}`,
      spaceId: null,
      spaceName: null,
    });
  }
  if (input.facts.urgentRepairCount > 0) {
    issues.push({
      kind: "repair",
      label: "Open repair",
      spaceId: input.location.rooms[0]?.spaceId ?? null,
      spaceName: input.location.rooms[0]?.name ?? null,
    });
  } else if (input.facts.openRepairCount > 0) {
    issues.push({
      kind: "repair",
      label:
        input.facts.openRepairCount === 1
          ? "Open repair"
          : `${input.facts.openRepairCount} open repairs`,
      spaceId: input.location.rooms[0]?.spaceId ?? null,
      spaceName: input.location.rooms[0]?.name ?? null,
    });
  }
  if (input.staffing.kind === "short" || input.staffing.kind === "uncovered") {
    issues.push({
      kind: "staffing",
      label: input.staffing.label,
      spaceId: null,
      spaceName: null,
    });
  }
  return issues;
}

export function deriveOperatingStatus(input: {
  keyTime: OperatingLocationKeyTime | null;
  staffing: OperatingLocationStaffing;
  facts: OperatingLocationIssueFacts;
}): OperatingLocationStatusKey {
  const overdueKeyTime = (input.keyTime?.overdueCount ?? 0) > 0;
  const needsAttention =
    overdueKeyTime ||
    input.facts.failedLogs > 0 ||
    input.facts.missedLogs > 0 ||
    input.facts.urgentRepairCount > 0 ||
    input.staffing.kind === "short" ||
    input.staffing.kind === "uncovered";
  if (needsAttention) return "needs_attention";

  const dueNow = input.keyTime?.statusKey === "due";
  const inProgress =
    dueNow ||
    input.facts.pendingLogs > 0 ||
    input.facts.openRepairCount > 0;
  if (inProgress) return "in_progress";

  return "on_track";
}

function riskPriority(input: {
  keyTime: OperatingLocationKeyTime | null;
  staffing: OperatingLocationStaffing;
  facts: OperatingLocationIssueFacts;
}): number {
  return (
    (input.keyTime?.overdueCount ?? 0) * 100 +
    input.facts.failedLogs * 80 +
    input.facts.missedLogs * 70 +
    input.facts.urgentRepairCount * 60 +
    (input.staffing.kind === "uncovered" ? 50 : 0) +
    (input.staffing.kind === "short" ? 40 : 0) +
    input.facts.pendingLogs * 10 +
    input.facts.openRepairCount * 8
  );
}

function issueSummary(issues: readonly OperatingLocationIssue[]): string | null {
  if (issues.length === 0) return null;
  const unique = [...new Set(issues.map((issue) => issue.label))];
  return unique.slice(0, 3).join(" · ");
}

export function buildOperatingLocationStatus(input: {
  location: SupervisorOperatingLocation;
  views: readonly RoomOperationView[];
  staffing: OperatingLocationStaffingInput;
  facts: OperatingLocationIssueFacts;
  lensMode?: "DEPARTMENT" | "FACILITY";
}): OperatingLocationStatus {
  const rooms = input.location.rooms.map((room) => {
    const typeFromView = input.views.find((view) => view.spaceId === room.spaceId)
      ?.presentation.location.roomTypeLabel;
    return typeFromView ? { ...room, roomTypeLabel: typeFromView } : room;
  });
  const location = { ...input.location, rooms };
  const staffing = presentStaffingFact(input.staffing);
  const currentOperation = aggregateCurrentOperation(input.views);
  const keyTime = selectPrimaryKeyTime(input.views);
  const issues = collectIssues({
    location,
    views: input.views,
    keyTime,
    staffing,
    facts: input.facts,
  });
  const derivedStatus = deriveOperatingStatus({
    keyTime,
    staffing,
    facts: input.facts,
  });

  return {
    location,
    displayName: location.displayName,
    contextLabel: contextLabelFor(location, input.lensMode ?? "DEPARTMENT"),
    href: hrefFor(location),
    staffing,
    currentOperation,
    keyTime,
    issues,
    derivedStatus,
    issueSummary: issueSummary(issues),
    facilityOrder: location.facilityOrder,
    riskPriority: riskPriority({ keyTime, staffing, facts: input.facts }),
    floorLabel: location.floorLabel,
  };
}

export function summarizeOperatingLocationBoard(
  locations: readonly OperatingLocationStatus[],
): OperatingLocationBoardSummary {
  let needsAttention = 0;
  let inProgress = 0;
  let onTrack = 0;
  for (const location of locations) {
    if (location.derivedStatus === "needs_attention") needsAttention += 1;
    else if (location.derivedStatus === "in_progress") inProgress += 1;
    else onTrack += 1;
  }
  return {
    total: locations.length,
    needsAttention,
    inProgress,
    onTrack,
  };
}

/** Today's Work board: Needs Attention first, then remaining in facility order. */
export function sortOperatingLocationsForBoard(
  locations: readonly OperatingLocationStatus[],
): OperatingLocationStatus[] {
  return [...locations].sort((a, b) => {
    const aAttention = a.derivedStatus === "needs_attention" ? 0 : 1;
    const bAttention = b.derivedStatus === "needs_attention" ? 0 : 1;
    if (aAttention !== bAttention) return aAttention - bAttention;
    if (aAttention === 0 && b.riskPriority !== a.riskPriority) {
      return b.riskPriority - a.riskPriority;
    }
    return a.facilityOrder - b.facilityOrder;
  });
}

/** Walk List: Needs Attention, then In Progress, then On Track. Facility order within a status. */
export function sortOperatingLocationsForWalk(
  locations: readonly OperatingLocationStatus[],
): OperatingLocationStatus[] {
  return [...locations].sort((a, b) => {
    const statusDiff = STATUS_RANK[a.derivedStatus] - STATUS_RANK[b.derivedStatus];
    if (statusDiff !== 0) return statusDiff;
    if (b.riskPriority !== a.riskPriority) return b.riskPriority - a.riskPriority;
    return a.facilityOrder - b.facilityOrder;
  });
}

export function buildOperatingLocationBoard(input: {
  locations: readonly SupervisorOperatingLocation[];
  viewsBySpaceId: ReadonlyMap<string, RunLocationOperationPresentation>;
  staffingByUnitId: ReadonlyMap<string, OperatingLocationStaffingInput>;
  factsByUnitId: ReadonlyMap<string, OperatingLocationIssueFacts>;
  sort: "board" | "walk";
  lensMode?: "DEPARTMENT" | "FACILITY";
}): OperatingLocationBoard {
  const emptyFacts: OperatingLocationIssueFacts = {
    failedLogs: 0,
    missedLogs: 0,
    pendingLogs: 0,
    openRepairCount: 0,
    urgentRepairCount: 0,
  };
  const rows = input.locations.map((location) => {
    const views: RoomOperationView[] = location.rooms
      .map((room) => {
        const presentation = input.viewsBySpaceId.get(room.spaceId);
        return presentation ? { spaceId: room.spaceId, presentation } : null;
      })
      .filter((view): view is RoomOperationView => view != null);
    const staffing = input.staffingByUnitId.get(location.unitId) ?? {
      assignedCount: null,
      expectedCount: null,
    };
    const unitIds = [
      ...new Set([location.unitId, ...location.rooms.map((room) => room.unitId)]),
    ];
    const facts = unitIds.reduce<OperatingLocationIssueFacts>((acc, unitId) => {
      const next = input.factsByUnitId.get(unitId);
      if (!next) return acc;
      return {
        failedLogs: acc.failedLogs + next.failedLogs,
        missedLogs: acc.missedLogs + next.missedLogs,
        pendingLogs: acc.pendingLogs + next.pendingLogs,
        openRepairCount: acc.openRepairCount + next.openRepairCount,
        urgentRepairCount: acc.urgentRepairCount + next.urgentRepairCount,
      };
    }, emptyFacts);

    return buildOperatingLocationStatus({
      location,
      views,
      staffing,
      facts,
      lensMode: input.lensMode,
    });
  });

  const sorted =
    input.sort === "walk"
      ? sortOperatingLocationsForWalk(rows)
      : sortOperatingLocationsForBoard(rows);

  return {
    locations: sorted,
    summary: summarizeOperatingLocationBoard(sorted),
    lensMode: input.lensMode ?? "DEPARTMENT",
  };
}

function walkStatusFromDerived(status: OperatingLocationStatusKey): WalkListStatus {
  if (status === "needs_attention") return "blocked";
  if (status === "in_progress") return "in_progress";
  return "ready";
}

export function operatingLocationsToWalkItems(
  locations: readonly OperatingLocationStatus[],
): WalkListItem[] {
  return locations.map((row) => {
    const singleRoom = row.location.rooms.length === 1 ? row.location.rooms[0] : null;
    const reason =
      row.issueSummary ??
      (row.keyTime?.summary ??
        (row.derivedStatus === "on_track" ? "On track" : "Needs a closer look"));
    return {
      unitId: row.location.unitId,
      unitName: row.displayName,
      unitType: "OTHER",
      status: walkStatusFromDerived(row.derivedStatus),
      reason,
      href: row.href,
      failed: 0,
      missed: 0,
      pending: 0,
      openRepairCount: row.issues.filter((issue) => issue.kind === "repair").length,
      staffingCount: row.staffing.assignedCount ?? 0,
      attentionScore: row.riskPriority,
      spaceId: singleRoom?.spaceId ?? null,
      typeLabel: singleRoom?.roomTypeLabel ?? (row.location.kind === "NEIGHBORHOOD" ? null : null),
      parentContext: row.contextLabel,
    };
  });
}

export function operatingBoardToWalkList(
  board: OperatingLocationBoard,
  operationContext: OperationContext,
): WalkListData {
  const items = operatingLocationsToWalkItems(board.locations);
  const summary = summarizeWalkList(items);
  return {
    items,
    summary: {
      ...summary,
      ready: board.summary.onTrack,
      blocked: board.summary.needsAttention,
      inProgress: board.summary.inProgress,
      total: board.summary.total,
    },
    operationContext,
    lookFirst: items.find((item) => item.status !== "ready") ?? items[0] ?? null,
  };
}

export function operatingLocationStatusLabel(status: OperatingLocationStatusKey): string {
  if (status === "needs_attention") return "Needs Attention";
  if (status === "in_progress") return "In Progress";
  return "On Track";
}

