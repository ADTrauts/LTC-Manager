/**
 * Phase 6O — pure Supervisor Operations composer.
 * Builds SupervisorOperationsViewModel from already-loaded facts.
 * Does not query Prisma, resolve logs, or recalculate due/coverage state.
 */

import type { RuntimeLocationState } from "@/lib/runtime-location-state";

import { presentSupervisorEvidenceAttention } from "../supervisor-evidence-attention";
import type { SupervisorExceptionTemporal } from "../types";
import type {
  SupervisorAssignmentFact,
  SupervisorAttentionItem,
  SupervisorCoverageGap,
  SupervisorOperationsViewModel,
  SupervisorPresenceEmployee,
  SupervisorSyncItem,
  SupervisorWorkFact,
} from "./types";
import type { SupervisorOperationsFacts } from "./facts";

export const SUPERVISOR_SHARED_OPERATION_SUFFIX = " · Active";
export const SUPERVISOR_MIXED_OPERATION_LABEL = "Multiple operations active";
export const SUPERVISOR_NO_ACTIVE_OPERATION_LABEL = "No active operation";
export const SUPERVISOR_ASSIGNMENT_UNAVAILABLE = "Assignment unavailable";
export const SUPERVISOR_COVERAGE_UNAVAILABLE = "Coverage unavailable";

const AFFECTING_IMPACTS = new Set(["SERVICE_AT_RISK", "EQUIPMENT_UNAVAILABLE"]);
const ASSIGNMENT_HREF = (departmentId: string) =>
  `/staffing/assignments?departmentId=${departmentId}`;

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function spaceHref(unitId: string | null, spaceId: string, section?: string): string {
  if (!unitId) return `/unit/${spaceId}${section ? `#${section}` : ""}`;
  const base = `/unit/${unitId}?space=${encodeURIComponent(spaceId)}`;
  return section ? `${base}#${section}` : base;
}

export function aggregateSupervisorOperation(
  states: readonly RuntimeLocationState[],
): SupervisorOperationsViewModel["operation"] {
  const active = states.filter(
    (state) => state.operation.state === "ACTIVE" && state.operation.current,
  );
  const keys = unique(active.map((state) => state.operation.current?.cycleStableKey));
  const labels = unique(
    active.map(
      (state) => state.operation.current?.hierarchyLabel ?? state.operation.current?.label,
    ),
  );

  const upcoming = states
    .map((state) => state.operation.upcoming)
    .filter((row): row is NonNullable<typeof row> => Boolean(row?.label))
    .sort((a, b) => {
      if (!a.startsAt) return 1;
      if (!b.startsAt) return -1;
      return a.startsAt.localeCompare(b.startsAt);
    });
  const nextLabel = upcoming[0]?.label ?? null;

  if (keys.length === 1 && labels.length === 1) {
    const currentLabel = `${labels[0]}${SUPERVISOR_SHARED_OPERATION_SUFFIX}`;
    return {
      kind: "shared",
      label: currentLabel,
      currentLabel,
      nextLabel,
      activeLabels: labels,
    };
  }
  if (keys.length > 1 || labels.length > 1) {
    return {
      kind: "mixed",
      label: SUPERVISOR_MIXED_OPERATION_LABEL,
      currentLabel: SUPERVISOR_MIXED_OPERATION_LABEL,
      nextLabel: null,
      activeLabels: labels,
    };
  }
  return {
    kind: "none",
    label: SUPERVISOR_NO_ACTIVE_OPERATION_LABEL,
    currentLabel: null,
    nextLabel,
    activeLabels: [],
  };
}

function milestoneAttention(
  states: readonly RuntimeLocationState[],
): SupervisorAttentionItem[] {
  const items: SupervisorAttentionItem[] = [];
  for (const state of states) {
    const unitId = state.identity.location.unitId;
    const unitName = state.identity.hierarchy.unitName;
    const locationLabel = state.identity.displayName;
    const spaceId = state.identity.location.spaceId;
    for (const milestone of state.milestones.items) {
      if (!milestone.canonical) continue;
      const overdue = milestone.statusKey === "overdue";
      const late = milestone.statusKey === "completed_late";
      const notRecorded =
        milestone.kind === "SERVERY_READY" && milestone.statusKey === "not_recorded";
      if (!overdue && !late && !notRecorded) continue;

      let status: string;
      let temporal: SupervisorExceptionTemporal;
      if (overdue) {
        status = `${milestone.label} overdue`;
        temporal = "Late";
      } else if (late) {
        status = `${milestone.label} completed late`;
        temporal = "Late";
      } else {
        status = `${milestone.label} not recorded`;
        temporal = "NotConfirmed";
      }

      items.push({
        status,
        temporal,
        unitId,
        unitName,
        locationLabel,
        cycleLabel: milestone.cycleStableKey,
        sourceHref: spaceHref(unitId, spaceId, "milestones"),
        availableActions: ["Open SPACE milestones"],
      });
    }
  }
  return items;
}

function dietaryMilestoneChips(
  states: readonly RuntimeLocationState[],
): NonNullable<SupervisorOperationsViewModel["overlay"]["dietary"]> {
  const unitsReady = new Set<string>();
  const unitsReadyMissing = new Set<string>();
  const unitsStarted = new Set<string>();
  const unitsStartedLate = new Set<string>();
  const unitsStartedMissing = new Set<string>();

  for (const state of states) {
    const unitKey = state.identity.location.unitId ?? state.identity.location.spaceId;
    for (const milestone of state.milestones.items) {
      if (milestone.kind === "SERVERY_READY") {
        if (milestone.statusKey === "completed_on_time" || milestone.statusKey === "adjusted") {
          unitsReady.add(unitKey);
        } else if (
          milestone.statusKey === "not_recorded" ||
          milestone.statusKey === "overdue" ||
          milestone.statusKey === "due"
        ) {
          unitsReadyMissing.add(unitKey);
        }
      }
      if (milestone.kind === "MEAL_SERVICE_STARTED") {
        if (milestone.statusKey === "completed_on_time" || milestone.statusKey === "adjusted") {
          unitsStarted.add(unitKey);
        } else if (milestone.statusKey === "completed_late") {
          unitsStartedLate.add(unitKey);
        } else if (milestone.statusKey === "not_recorded" || milestone.statusKey === "overdue") {
          unitsStartedMissing.add(unitKey);
        }
      }
    }
  }

  return {
    readyConfirmed: unitsReady.size,
    readyNotConfirmed: unitsReadyMissing.size,
    started: unitsStarted.size,
    startedLate: unitsStartedLate.size,
    startedNotConfirmed: unitsStartedMissing.size,
  };
}

function assetAttention(states: readonly RuntimeLocationState[]): SupervisorAttentionItem[] {
  const items: SupervisorAttentionItem[] = [];
  for (const state of states) {
    const unitId = state.identity.location.unitId;
    const unitName = state.identity.hierarchy.unitName;
    const locationLabel = state.identity.displayName;
    for (const issue of state.assets.issuesAffectingOperation) {
      if (!AFFECTING_IMPACTS.has(issue.impact)) continue;
      items.push({
        status:
          issue.impact === "EQUIPMENT_UNAVAILABLE"
            ? `${issue.summary} — unavailable`
            : `${issue.summary} — service at risk`,
        temporal: issue.impact === "EQUIPMENT_UNAVAILABLE" ? "Late" : "Current",
        unitId,
        unitName,
        locationLabel,
        sourceHref: issue.href ?? spaceHref(unitId, state.identity.location.spaceId, "assets"),
        availableActions: ["Open asset"],
      });
    }
  }
  return items;
}

function unitsFromStates(
  states: readonly RuntimeLocationState[],
  gaps: readonly SupervisorCoverageGap[],
): SupervisorOperationsViewModel["units"] {
  const byUnit = new Map<string, SupervisorOperationsViewModel["units"][number]>();
  for (const state of states) {
    const unitId = state.identity.location.unitId;
    if (!unitId || byUnit.has(unitId)) continue;
    const current = state.operation.current;
    const overdueMilestone = state.milestones.items.find(
      (item) => item.canonical && (item.statusKey === "overdue" || item.statusKey === "not_recorded"),
    );
    const coverage = gaps.find((gap) => gap.unitId === unitId);
    byUnit.set(unitId, {
      unitId,
      unitName: state.identity.hierarchy.unitName ?? unitId,
      unitType: "",
      cycleLabel:
        state.operation.state === "ACTIVE" && current
          ? (current.hierarchyLabel ?? current.label)
          : null,
      cycleState: state.operation.state,
      mealTargetTime: current?.window.start ?? null,
      milestoneLabel: overdueMilestone?.label ?? null,
      coverageState: coverage?.state ?? null,
      workspaceHref: `/unit/${unitId}`,
    });
  }
  return [...byUnit.values()].sort((a, b) => a.unitName.localeCompare(b.unitName));
}

function workAttention(rows: readonly SupervisorWorkFact[]): SupervisorAttentionItem[] {
  return rows.map((row) => {
    const temporal: SupervisorExceptionTemporal =
      row.state === "PAST_DUE_NOT_CONFIRMED"
        ? "NotConfirmed"
        : row.state === "DUE" || row.state === "CURRENT" || row.state === "CONFLICT_REVIEW"
          ? "Current"
          : "Upcoming";
    return {
      status:
        row.state === "PAST_DUE_NOT_CONFIRMED"
          ? `${row.label} — past due not confirmed`
          : `${row.label} — ${row.state.replaceAll("_", " ").toLowerCase()}`,
      temporal,
      unitId: row.unitId,
      unitName: row.unitName,
      sourceHref: row.unitId
        ? `/staffing/operations?work=${encodeURIComponent(row.occurrenceKey)}&unit=${row.unitId}`
        : `/staffing/operations?work=${encodeURIComponent(row.occurrenceKey)}`,
      availableActions: ["Open Work", "Create one-off"],
    };
  });
}

function syncAttention(items: readonly SupervisorSyncItem[]): SupervisorAttentionItem[] {
  return items.map((item) => ({
    status: item.kind === "retry_required" ? "Pending offline sync" : "Conflict review required",
    temporal: "Current" as const,
    unitId: item.unitId,
    unitName: item.unitName,
    sourceHref: `/unit/${item.unitId}`,
    availableActions:
      item.kind === "retry_required" ? ["Open Unit Workspace"] : ["Resolve offline conflict"],
  }));
}

export function composeSupervisorOperations(
  facts: SupervisorOperationsFacts,
): SupervisorOperationsViewModel {
  const operation = aggregateSupervisorOperation(facts.states);
  const assignmentHref = ASSIGNMENT_HREF(facts.department.id);

  const presenceEmployees: SupervisorPresenceEmployee[] = facts.presenceEmployees.map((row) => ({
    id: row.id,
    name: `${row.firstName} ${row.lastName}`.trim(),
    hasCallOff: row.hasCallOff,
  }));

  const assignments: SupervisorAssignmentFact[] = facts.oaEnabled ? facts.assignments : [];
  const assignedEmployeeIds = new Set(
    assignments.map((row) => row.employeeId).filter((id): id is string => Boolean(id)),
  );
  const callOffAffectsAssignment = presenceEmployees.filter(
    (row) => row.hasCallOff && assignedEmployeeIds.has(row.id),
  );

  const people: SupervisorAttentionItem[] = [];
  if (!facts.oaEnabled) {
    people.push({
      status: SUPERVISOR_ASSIGNMENT_UNAVAILABLE,
      temporal: "NotConfirmed",
      sourceHref: assignmentHref,
      availableActions: ["Open Assignment Board"],
    });
  } else {
    for (const row of callOffAffectsAssignment) {
      people.push({
        status: "Call-off",
        temporal: "Current",
        employeeId: row.id,
        employeeName: row.name,
        cycleLabel: operation.currentLabel,
        sourceHref: assignmentHref,
        availableActions: ["Open Assignment Board"],
      });
    }
  }

  const coverageGaps: SupervisorCoverageGap[] = facts.oaEnabled ? facts.coverageGaps : [];
  const coverageAttention: SupervisorAttentionItem[] = [];
  if (!facts.oaEnabled) {
    coverageAttention.push({
      status: SUPERVISOR_COVERAGE_UNAVAILABLE,
      temporal: "NotConfirmed",
      sourceHref: assignmentHref,
      availableActions: ["Open Assignment Board"],
    });
  } else {
    for (const gap of coverageGaps) {
      coverageAttention.push({
        status: gap.state === "AT_RISK" ? `${gap.roleLabel} at risk` : `${gap.roleLabel} uncovered`,
        temporal: gap.state === "UNCOVERED" ? "NotConfirmed" : "Current",
        unitId: gap.unitId,
        unitName: gap.unitName,
        locationLabel: gap.locationLabel,
        cycleLabel: operation.currentLabel,
        sourceHref: assignmentHref,
        availableActions: ["Open Assignment Board"],
      });
    }
  }

  const unitNameById = new Map<string, string>();
  for (const state of facts.states) {
    const unitId = state.identity.location.unitId;
    if (unitId && state.identity.hierarchy.unitName) {
      unitNameById.set(unitId, state.identity.hierarchy.unitName);
    }
  }

  const evidence = presentSupervisorEvidenceAttention({
    canonicalLogsEnabled: facts.harborLogsEnabled,
    states: facts.states,
    historicalRecords: facts.historicalRecords,
    unitNameById,
  });
  const currentEvidence = evidence.filter((row) => row.kind === "current");
  const historicalAttention = evidence.filter((row) => row.kind === "historical");

  return {
    identity: {
      facilityId: facts.facility.id,
      facilityName: facts.facility.displayName,
      departmentId: facts.department.id,
      departmentName: facts.department.name,
      departmentKey: facts.department.key,
      operationalDateKey: facts.operationalDateKey,
      timezone: facts.timezone,
      lastUpdated: facts.now.toISOString(),
    },
    operation,
    plan: { status: facts.oaEnabled ? facts.planStatus : null },
    presence: {
      availability: "available",
      scheduledCount: presenceEmployees.length,
      callOffCount: presenceEmployees.filter((row) => row.hasCallOff).length,
      scheduledEmployees: presenceEmployees,
    },
    assignments: {
      availability: facts.oaEnabled ? "available" : "unavailable",
      assignedCount: assignedEmployeeIds.size,
      assignments,
      callOffAffectsAssignment,
    },
    coverage: {
      availability: facts.oaEnabled ? "available" : "unavailable",
      engine: !facts.oaEnabled
        ? "none"
        : facts.department.key === "EVS"
          ? "evs"
          : facts.department.key === "DIETARY"
            ? "dietary"
            : "none",
      covered: facts.oaEnabled ? facts.coverageCounts.covered : 0,
      atRisk: facts.oaEnabled ? facts.coverageCounts.atRisk : 0,
      uncovered: facts.oaEnabled ? facts.coverageCounts.uncovered : 0,
      gaps: coverageGaps,
    },
    needsAttention: {
      people,
      coverage: coverageAttention,
      milestones: milestoneAttention(facts.states),
      evidence: currentEvidence,
      assets: assetAttention(facts.states),
      work: workAttention(facts.workExceptions),
      sync: syncAttention(facts.sync.items),
      configuration: [],
    },
    historicalAttention,
    people: { callOffsAffectingAssignment: callOffAffectsAssignment },
    sync: facts.sync,
    overlay: {
      dietary: facts.department.key === "DIETARY" ? dietaryMilestoneChips(facts.states) : null,
      evs: facts.oaEnabled ? facts.evsOverlay : null,
      plant: facts.plantOverlay,
    },
    units: filterUnits(unitsFromStates(facts.states, coverageGaps), facts.evsOverlay),
  };
}

function filterUnits(
  units: SupervisorOperationsViewModel["units"],
  evs: SupervisorOperationsFacts["evsOverlay"],
): SupervisorOperationsViewModel["units"] {
  if (!evs?.visibleUnitIds) return units;
  const allowed = new Set(evs.visibleUnitIds);
  return units.filter((row) => allowed.has(row.unitId));
}
