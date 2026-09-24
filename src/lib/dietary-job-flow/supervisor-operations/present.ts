/**
 * Phase 6O — compatibility presenter.
 * SupervisorOperationsViewModel → existing SupervisorOperationsBoard.
 * Visible IA stays on the current page contract.
 */

import type { SupervisorOperationsBoard, SupervisorExceptionItem } from "../types";
import type { SupervisorOperationsViewModel } from "./types";

function exceptionRank(group: SupervisorExceptionItem["group"], temporal: SupervisorExceptionItem["temporal"]): number {
  const groupBase: Record<SupervisorExceptionItem["group"], number> = {
    Staffing: 100,
    Coverage: 200,
    Readiness: 300,
    ServiceTiming: 400,
    Evidence: 450,
    Work: 460,
    Asset: 470,
    Equipment: 475,
    OfflineSync: 500,
    Configuration: 600,
  };
  const temporalBoost: Record<SupervisorExceptionItem["temporal"], number> = {
    Late: 0,
    Current: 10,
    DueSoon: 20,
    NotConfirmed: 30,
    Upcoming: 40,
    Confirmed: 90,
  };
  return groupBase[group] + temporalBoost[temporal];
}

function push(
  exceptions: SupervisorExceptionItem[],
  group: SupervisorExceptionItem["group"],
  item: {
    status: string;
    temporal: SupervisorExceptionItem["temporal"];
    unitId?: string | null;
    unitName?: string | null;
    locationLabel?: string | null;
    employeeId?: string | null;
    employeeName?: string | null;
    cycleLabel?: string | null;
    time?: string | null;
    sourceHref: string;
    availableActions: string[];
  },
  extraRank = 0,
) {
  exceptions.push({
    group,
    status: item.status,
    temporal: item.temporal,
    unitId: item.unitId,
    unitName: item.unitName,
    locationLabel: item.locationLabel,
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    cycleLabel: item.cycleLabel,
    time: item.time,
    sourceHref: item.sourceHref,
    availableActions: item.availableActions,
    sortRank: exceptionRank(group, item.temporal) + extraRank,
  });
}

function milestoneVisibleGroup(status: string): "Readiness" | "ServiceTiming" {
  const lower = status.toLowerCase();
  if (lower.includes("ready") && !lower.includes("started")) return "Readiness";
  return "ServiceTiming";
}

export function presentSupervisorOperationsBoard(
  view: SupervisorOperationsViewModel,
): SupervisorOperationsBoard {
  const exceptions: SupervisorExceptionItem[] = [];

  for (const item of view.needsAttention.people) {
    push(exceptions, "Staffing", item);
  }
  for (const item of view.needsAttention.coverage) {
    push(exceptions, "Coverage", item);
  }
  for (const item of view.needsAttention.milestones) {
    push(exceptions, milestoneVisibleGroup(item.status), item);
  }
  for (const item of view.needsAttention.evidence) {
    push(exceptions, "Evidence", item);
  }
  for (const item of view.historicalAttention) {
    push(exceptions, "Evidence", item, 5);
  }
  for (const item of view.needsAttention.assets) {
    push(exceptions, "Asset", item);
  }
  for (const item of view.needsAttention.work) {
    push(exceptions, "Work", item);
  }
  for (const item of view.needsAttention.sync) {
    push(exceptions, "OfflineSync", item);
  }
  for (const item of view.needsAttention.configuration) {
    push(exceptions, "Configuration", item);
  }

  exceptions.sort(
    (a, b) => a.sortRank - b.sortRank || (a.unitName ?? "").localeCompare(b.unitName ?? ""),
  );

  const dietary = view.overlay.dietary;
  const evs = view.overlay.evs;

  return {
    header: {
      facilityId: view.identity.facilityId,
      facilityName: view.identity.facilityName,
      departmentId: view.identity.departmentId,
      departmentName: view.identity.departmentName,
      departmentKey: view.identity.departmentKey,
      operationalDateKey: view.identity.operationalDateKey,
      currentCycleLabel: view.operation.currentLabel,
      activePhaseLabels: view.operation.activeLabels,
      nextCycleLabel: view.operation.nextLabel,
      planStatus: view.plan.status,
      lastUpdated: view.identity.lastUpdated,
    },
    summary: {
      scheduled: view.presence.scheduledCount,
      assigned: view.assignments.availability === "available" ? view.assignments.assignedCount : 0,
      // Schedule-minus-OA is presence context, not an operational exception.
      unassigned: 0,
      callOffs: view.presence.callOffCount,
      covered: view.coverage.covered,
      atRisk: view.coverage.atRisk,
      uncovered: view.coverage.uncovered,
      readyConfirmed: dietary?.readyConfirmed ?? 0,
      readyNotConfirmed: dietary?.readyNotConfirmed ?? 0,
      started: dietary?.started ?? 0,
      startedLate: dietary?.startedLate ?? 0,
      startedNotConfirmed: dietary?.startedNotConfirmed ?? 0,
      conflicts: view.sync.pendingConflicts,
      locationCovered: evs?.locationCovered ?? null,
      locationAtRisk: evs?.locationAtRisk ?? null,
      locationUncovered: evs?.locationUncovered ?? null,
      locationOverlapping: evs?.locationOverlapping ?? null,
      locationRequired: evs?.locationRequired ?? null,
    },
    exceptions,
    viewAllUnits: view.units,
    locationCoverage: evs?.locationCoverage ?? null,
    filters: evs?.filters ?? null,
    plantOperations: view.overlay.plant,
  };
}
