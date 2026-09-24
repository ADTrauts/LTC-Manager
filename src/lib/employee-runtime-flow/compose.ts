/**
 * Pure EmployeeRuntimeFlow composer.
 * Filters / groups / labels / orders. Does not query or resolve domain truth.
 */

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { WorkRequirement } from "@/lib/department-work/types";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import type {
  RuntimeLocationSpaceRef,
  RuntimeLocationState,
} from "@/lib/runtime-location-state";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";

import { assignmentScopeKind, assignedSpaceIdSet, filterWorkToAssignedSpaces } from "./assigned-spaces";
import {
  collectHarborEvidence,
  filterTemplateEvidenceToAssignedSpaces,
} from "./evidence";
import { resolveEmployeeNextAction } from "./next-action";
import { aggregateAssignedOperation } from "./operation";
import type {
  EmployeeRuntimeEvidenceMode,
  EmployeeRuntimeFlow,
  EmployeeRuntimeIssue,
  EmployeeRuntimeLocation,
  EmployeeRuntimeLocationNext,
  EmployeeRuntimeMilestone,
} from "./types";

export type ComposeEmployeeRuntimeFlowInput = {
  operationalAssignmentsEnabled: boolean;
  canonicalLogsEnabled: boolean;
  currentAssignment: JobFlowAssignmentSnapshot | null;
  upcomingAssignment: JobFlowAssignmentSnapshot | null;
  previousAssignment?: JobFlowAssignmentSnapshot | null;
  dayAssignments?: readonly JobFlowAssignmentSnapshot[];
  assignmentLocations: readonly ResolvedAssignmentLocation[];
  spaceRefs: readonly RuntimeLocationSpaceRef[];
  states: readonly RuntimeLocationState[];
  templateEvidence: readonly EvidenceRequirement[];
  workRequirements: readonly WorkRequirement[];
  deviceBoundUnitId?: string | null;
  offline?: {
    bundleRevision?: string | null;
    lastSyncedAt?: string | null;
    stale?: boolean;
  };
};

const IMPACTING = new Set(["SERVICE_AT_RISK", "EQUIPMENT_UNAVAILABLE", "WORKAROUND_AVAILABLE"]);

function emptyFlow(
  input: ComposeEmployeeRuntimeFlowInput,
  availability: EmployeeRuntimeFlow["assignmentAvailability"],
  mismatch: boolean,
): EmployeeRuntimeFlow {
  const assignment = input.currentAssignment ?? input.upcomingAssignment;
  return {
    assignmentAvailability: availability,
    currentAssignment: availability === "evaluated" ? input.currentAssignment : null,
    upcomingAssignment: availability === "evaluated" ? input.upcomingAssignment : null,
    previousAssignment: availability === "evaluated" ? (input.previousAssignment ?? null) : null,
    dayAssignments: availability === "evaluated" ? [...(input.dayAssignments ?? [])] : [],
    responsibility: {
      roleKey: availability === "evaluated" ? (assignment?.roleKey ?? null) : null,
      roleLabel: availability === "evaluated" ? (assignment?.roleLabel ?? null) : null,
      unitId: availability === "evaluated" ? (assignment?.unitId ?? null) : null,
      unitName: availability === "evaluated" ? (assignment?.unitName ?? null) : null,
      scopeKind: "NONE",
      assignedSpaceIds: [],
    },
    locations: [],
    operation: { kind: "none" },
    evidenceMode: "none",
    evidence: [],
    templateEvidence: [],
    work: [],
    milestones: [],
    issues: [],
    next: { kind: "none", label: "", spaceId: null, sourceId: "" },
    locationNext: null,
    device: {
      boundUnitId: input.deviceBoundUnitId ?? null,
      assignmentUnitId: assignment?.unitId ?? null,
      mismatch,
    },
    offline: {
      bundleRevision: input.offline?.bundleRevision ?? null,
      lastSyncedAt: input.offline?.lastSyncedAt ?? null,
      stale: input.offline?.stale ?? false,
    },
  };
}

function presentLocations(
  states: readonly RuntimeLocationState[],
  refs: readonly RuntimeLocationSpaceRef[],
): EmployeeRuntimeLocation[] {
  const byId = new Map(states.map((state) => [state.identity.location.spaceId, state]));
  const seen = new Set<string>();
  const rows: EmployeeRuntimeLocation[] = [];
  for (const ref of refs) {
    if (seen.has(ref.spaceId)) continue;
    seen.add(ref.spaceId);
    const state = byId.get(ref.spaceId);
    rows.push({
      spaceId: ref.spaceId,
      displayName: state?.identity.displayName ?? ref.displayName ?? ref.spaceId,
      unitId: state?.identity.location.unitId ?? ref.unitId ?? null,
      unitName: state?.identity.hierarchy.unitName ?? null,
      floorName: state?.identity.hierarchy.floorName ?? ref.floorName ?? null,
      neighborhoodName: state?.identity.hierarchy.neighborhoodName ?? ref.neighborhoodName ?? null,
      operationalTypeKey: state?.program.operationalType.key ?? null,
      operationalTypeName: state?.program.operationalType.name ?? null,
      operationLabel:
        state?.operation.state === "ACTIVE"
          ? (state.operation.current?.hierarchyLabel ?? state.operation.current?.label ?? null)
          : null,
      operationState: state?.operation.state ?? "NONE",
    });
  }
  return rows;
}

function collectMilestones(states: readonly RuntimeLocationState[]): EmployeeRuntimeMilestone[] {
  const rows: EmployeeRuntimeMilestone[] = [];
  for (const state of states) {
    for (const item of state.milestones.items) {
      rows.push({
        spaceId: state.identity.location.spaceId,
        spaceName: state.identity.displayName,
        kind: item.kind,
        label: item.label,
        statusKey: item.statusKey,
      });
    }
  }
  return rows;
}

function collectIssues(states: readonly RuntimeLocationState[]): EmployeeRuntimeIssue[] {
  const rows: EmployeeRuntimeIssue[] = [];
  for (const state of states) {
    for (const issue of state.assets.issuesAffectingOperation) {
      if (!IMPACTING.has(issue.impact)) continue;
      rows.push({
        spaceId: state.identity.location.spaceId,
        spaceName: state.identity.displayName,
        assetId: issue.assetId,
        issueId: issue.issueId,
        summary: issue.summary,
        impact: issue.impact,
        href: issue.href,
      });
    }
  }
  return rows;
}

function earliestLocationNext(
  states: readonly RuntimeLocationState[],
): EmployeeRuntimeLocationNext | null {
  let best: EmployeeRuntimeLocationNext | null = null;
  for (const state of states) {
    if (!state.next) continue;
    if (!best || state.next.at.getTime() < best.at.getTime()) {
      best = {
        spaceId: state.identity.location.spaceId,
        label: state.next.label,
        at: state.next.at,
      };
    }
  }
  return best;
}

function usableStates(
  states: readonly RuntimeLocationState[],
  assignedSpaceIds: ReadonlySet<string>,
  assignmentUnitId: string | null,
  mismatch: boolean,
): RuntimeLocationState[] {
  return states.filter((state) => {
    if (!assignedSpaceIds.has(state.identity.location.spaceId)) return false;
    if (mismatch && assignmentUnitId && state.identity.location.unitId !== assignmentUnitId) {
      return false;
    }
    return true;
  });
}

export function composeEmployeeRuntimeFlow(
  input: ComposeEmployeeRuntimeFlowInput,
): EmployeeRuntimeFlow {
  const assignment = input.currentAssignment ?? input.upcomingAssignment;
  const assignmentUnitId = assignment?.unitId ?? null;
  const deviceBoundUnitId = input.deviceBoundUnitId ?? null;
  const mismatch = Boolean(
    deviceBoundUnitId && assignmentUnitId && deviceBoundUnitId !== assignmentUnitId,
  );

  if (!input.operationalAssignmentsEnabled) {
    return emptyFlow(input, "unavailable", mismatch);
  }

  if (!input.currentAssignment && !input.upcomingAssignment) {
    return emptyFlow(input, "no_confirmed_assignment", mismatch);
  }

  const scopeKind = assignmentScopeKind(assignment, input.assignmentLocations.length);
  const assignedSpaceIds = assignedSpaceIdSet(input.spaceRefs);
  const spaceFilter = scopeKind === "SPACES" ? assignedSpaceIds : assignedSpaceIds.size > 0 ? assignedSpaceIds : null;
  const states = usableStates(input.states, assignedSpaceIds, assignmentUnitId, mismatch);

  const evidenceMode: EmployeeRuntimeEvidenceMode = input.canonicalLogsEnabled
    ? "harbor"
    : input.templateEvidence.length > 0 || !input.canonicalLogsEnabled
      ? "template"
      : "none";

  const harborEvidence = evidenceMode === "harbor" ? collectHarborEvidence(states) : [];
  const templateEvidence =
    evidenceMode === "template"
      ? filterTemplateEvidenceToAssignedSpaces(input.templateEvidence, spaceFilter)
      : [];
  const work = filterWorkToAssignedSpaces(input.workRequirements, spaceFilter);
  const milestones = collectMilestones(states);
  const issues = collectIssues(states);
  const locationNext = earliestLocationNext(states);
  const next = resolveEmployeeNextAction({
    work,
    evidence: harborEvidence,
    milestones,
    currentAssignment: input.currentAssignment,
    upcomingAssignment: input.upcomingAssignment,
    locationNext,
  });

  return {
    assignmentAvailability: "evaluated",
    currentAssignment: input.currentAssignment,
    upcomingAssignment: input.upcomingAssignment,
    previousAssignment: input.previousAssignment ?? null,
    dayAssignments: [...(input.dayAssignments ?? [])],
    responsibility: {
      roleKey: assignment?.roleKey ?? null,
      roleLabel: assignment?.roleLabel ?? null,
      unitId: assignmentUnitId,
      unitName: assignment?.unitName ?? null,
      scopeKind,
      assignedSpaceIds: [...assignedSpaceIds],
    },
    locations: presentLocations(states, input.spaceRefs),
    operation: aggregateAssignedOperation(states),
    evidenceMode,
    evidence: harborEvidence,
    templateEvidence,
    work,
    milestones,
    issues,
    next,
    locationNext,
    device: {
      boundUnitId: deviceBoundUnitId,
      assignmentUnitId,
      mismatch,
    },
    offline: {
      bundleRevision: input.offline?.bundleRevision ?? null,
      lastSyncedAt: input.offline?.lastSyncedAt ?? null,
      stale: input.offline?.stale ?? false,
    },
  };
}
