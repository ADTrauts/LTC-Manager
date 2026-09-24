/**
 * EmployeeRuntimeFlow → existing JobFlowContext.
 * Offline bundle / serialization compatibility only.
 */

import type { OperationalCycleContext, ResolvedCycleOccurrence } from "@/lib/operational-cycles/types";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import type { RuntimeLocationState } from "@/lib/runtime-location-state";
import {
  resolveJobFlow,
  type JobFlowOfflineQueueSummary,
} from "@/lib/dietary-job-flow/resolve-job-flow";
import type { JobFlowAttentionItem, JobFlowContext } from "@/lib/dietary-job-flow/types";

import { mapProductStateToTemplateState } from "./evidence";
import { operationSummaryLabel } from "./operation";
import type { EmployeeRuntimeEvidenceItem, EmployeeRuntimeFlow } from "./types";
import { EMPLOYEE_ASSIGNMENT_UNAVAILABLE_LABEL } from "./types";

export type AdaptEmployeeRuntimeFlowToJobFlowInput = {
  flow: EmployeeRuntimeFlow;
  now: Date;
  facilityTimezone: string;
  operationalDateKey: string;
  states: readonly RuntimeLocationState[];
  mealTargetTime?: string | null;
  planStatus?: string | null;
  offlineQueue?: JobFlowOfflineQueueSummary | null;
  reauthenticationRequired?: boolean;
  offlineStale?: boolean;
  assignmentUpdated?: boolean;
};

function syntheticOccurrence(
  flow: EmployeeRuntimeFlow,
  states: readonly RuntimeLocationState[],
  now: Date,
): ResolvedCycleOccurrence | null {
  if (flow.operation.kind !== "shared") return null;
  const shared = flow.operation;
  const match =
    states.find(
      (state) =>
        state.operation.state === "ACTIVE" &&
        state.operation.current?.cycleStableKey === shared.cycleStableKey,
    ) ?? states[0];
  const current = match?.operation.current;
  const upcoming = match?.operation.upcoming;
  const startsAt = current?.window.start
    ? new Date(`${match?.asOf.operationalDateKey ?? "2026-01-01"}T${current.window.start}:00`)
    : now;
  const endsAt = current?.window.end
    ? new Date(`${match?.asOf.operationalDateKey ?? "2026-01-01"}T${current.window.end}:00`)
    : now;
  return {
    id: shared.cycleStableKey,
    stableKey: shared.cycleStableKey,
    version: current ? 1 : 1,
    label: current?.hierarchyLabel ?? current?.label ?? shared.label,
    cycleType: "CUSTOM",
    displaySequence: 10,
    startLocal: current?.window.start ?? upcoming?.startsAt ?? "",
    endLocal: current?.window.end ?? "",
    overnight: false,
    mealType: null,
    expectedMilestones: [],
    startsAt,
    endsAt,
    parentStableKey: null,
    depth: 0,
    displayPath: current?.hierarchyLabel ?? current?.label ?? shared.label,
    ancestorLabels: [],
    hasChildren: false,
  };
}

function cycleContextFromFlow(
  flow: EmployeeRuntimeFlow,
  states: readonly RuntimeLocationState[],
  now: Date,
): OperationalCycleContext {
  if (flow.assignmentAvailability !== "evaluated") {
    return { state: "NOT_APPLICABLE" };
  }
  const occ = syntheticOccurrence(flow, states, now);
  if (flow.operation.kind === "shared" && occ) {
    const upcoming = states.find((state) => state.operation.upcoming)?.operation.upcoming ?? null;
    return {
      state: "ACTIVE",
      primary: occ,
      activeCycles: [occ],
      next: upcoming
        ? {
            ...occ,
            id: upcoming.cycleStableKey,
            stableKey: upcoming.cycleStableKey,
            label: upcoming.label,
            displayPath: upcoming.label,
            startLocal: upcoming.startsAt ?? occ.startLocal,
          }
        : null,
      minutesUntilNext: upcoming?.minutesUntil ?? null,
      mealTargetTime: null,
    };
  }
  if (flow.operation.kind === "mixed") {
    const label = operationSummaryLabel(flow.operation);
    const occ: ResolvedCycleOccurrence = {
      id: "mixed-operations",
      stableKey: "mixed-operations",
      version: 1,
      label,
      cycleType: "CUSTOM",
      displaySequence: 10,
      startLocal: "",
      endLocal: "",
      overnight: false,
      mealType: null,
      expectedMilestones: [],
      startsAt: now,
      endsAt: now,
      parentStableKey: null,
      depth: 0,
      displayPath: label,
      ancestorLabels: [],
      hasChildren: false,
    };
    return {
      state: "ACTIVE",
      primary: occ,
      activeCycles: [occ],
      next: null,
      minutesUntilNext: null,
      mealTargetTime: null,
    };
  }
  const upcoming = states.find((state) => state.operation.upcoming)?.operation.upcoming;
  if (upcoming) {
    const occUpcoming: ResolvedCycleOccurrence = {
      id: upcoming.cycleStableKey,
      stableKey: upcoming.cycleStableKey,
      version: 1,
      label: upcoming.label,
      cycleType: "CUSTOM",
      displaySequence: 10,
      startLocal: upcoming.startsAt ?? "",
      endLocal: "",
      overnight: false,
      mealType: null,
      expectedMilestones: [],
      startsAt: now,
      endsAt: now,
      parentStableKey: null,
      depth: 0,
      displayPath: upcoming.label,
      ancestorLabels: [],
      hasChildren: false,
    };
    return {
      state: "UPCOMING",
      next: occUpcoming,
      minutesUntilNext: upcoming.minutesUntil ?? 0,
      mealTargetTime: null,
    };
  }
  return { state: "NOT_APPLICABLE" };
}

function harborToTemplateEvidence(
  items: readonly EmployeeRuntimeEvidenceItem[],
  operationalDateKey: string,
): EvidenceRequirement[] {
  return items.map((item) => {
    const mapped = mapProductStateToTemplateState(item.productState);
    return {
      requirementKey: item.requirementKey,
      state: mapped.state,
      stateLabel: mapped.stateLabel,
      operationalDateKey,
      templateId: item.attachmentId,
      templateStableKey: item.catalogStableKey ?? item.attachmentId,
      templateVersion: 1,
      templateName: item.displayName,
      purposeType: "LOG",
      scheduleKind: "OPERATIONAL_CYCLE",
      cycleStableKey: null,
      cycleLabel: null,
      windowStartLocal: item.window.start,
      windowEndLocal: item.window.end,
      windowStartsAt: null,
      windowEndsAt: null,
      unitId: null,
      spaceId: item.spaceId,
      assetId: null,
      assetType: null,
      spaceType: null,
      recordId: item.recordId,
      recordStatus: null,
      fields: [],
      instructions: null,
    };
  });
}

function evidenceAttention(flow: EmployeeRuntimeFlow): JobFlowAttentionItem[] {
  const items: JobFlowAttentionItem[] = [];
  if (
    flow.evidence.some((row) => row.category === "due_now") ||
    flow.templateEvidence.some((row) => row.state === "DUE")
  ) {
    items.push({ kind: "evidence_due", message: "Evidence requirement is due now." });
  }
  if (
    flow.evidence.some((row) => row.category === "needs_attention") ||
    flow.templateEvidence.some(
      (row) =>
        row.state === "COMPLETED_WITH_CORRECTIVE_ACTION" || row.state === "NEEDS_REVIEW",
    )
  ) {
    items.push({
      kind: "evidence_corrective",
      message: "Evidence recorded with corrective action or needs review.",
    });
  }
  if (flow.work.some((row) => row.state === "DUE" || row.state === "CURRENT")) {
    items.push({ kind: "work_due", message: "Department Work is due now." });
  }
  if (flow.work.some((row) => row.state === "PAST_DUE_NOT_CONFIRMED")) {
    items.push({
      kind: "work_past_due",
      message: "Work is past due and not confirmed.",
    });
  }
  return items;
}

export function adaptEmployeeRuntimeFlowToJobFlow(
  input: AdaptEmployeeRuntimeFlowToJobFlowInput,
): JobFlowContext {
  const { flow } = input;
  const cycleContext = cycleContextFromFlow(flow, input.states, input.now);
  const base = resolveJobFlow({
    now: input.now,
    facilityTimezone: input.facilityTimezone,
    operationalDateKey: input.operationalDateKey,
    currentAssignment: flow.currentAssignment,
    upcomingAssignment: flow.upcomingAssignment,
    previousAssignment: flow.previousAssignment,
    dayAssignments: flow.dayAssignments,
    cycleContext,
    mealTargetTime: input.mealTargetTime ?? null,
    milestoneEvent: null,
    offlineQueue: input.offlineQueue ?? null,
    planStatus: input.planStatus ?? (flow.assignmentAvailability === "unavailable" ? null : "CONFIRMED"),
    reauthenticationRequired: input.reauthenticationRequired,
    offlineStale: input.offlineStale ?? flow.offline.stale,
    assignmentUpdated: input.assignmentUpdated,
    unit: flow.responsibility.unitId
      ? { id: flow.responsibility.unitId, name: flow.responsibility.unitName ?? flow.responsibility.unitId }
      : null,
  });

  if (
    flow.assignmentAvailability === "unavailable" ||
    flow.assignmentAvailability === "no_confirmed_assignment"
  ) {
    return {
      ...base,
      state: "NO_CONFIRMED_ASSIGNMENT",
      cycle: null,
      current: {
        ...base.current,
        expectation:
          flow.assignmentAvailability === "unavailable"
            ? EMPLOYEE_ASSIGNMENT_UNAVAILABLE_LABEL
            : "No confirmed Assignment for today.",
        assignment: null,
        cycle: null,
      },
      evidenceRequirements: [],
      workRequirements: [],
      spaceWorkSummaries: [],
    };
  }

  const evidenceRequirements =
    flow.evidenceMode === "harbor"
      ? harborToTemplateEvidence(flow.evidence, input.operationalDateKey)
      : flow.templateEvidence;

  const nextLabel = flow.next.kind !== "none" ? flow.next.label : base.next.milestoneExpectation;

  return {
    ...base,
    current: {
      ...base.current,
      cycle:
        flow.operation.kind === "shared" && base.current.cycle
          ? { ...base.current.cycle, label: operationSummaryLabel(flow.operation) }
          : base.current.cycle,
    },
    next: {
      ...base.next,
      milestoneExpectation: nextLabel ?? null,
    },
    evidenceRequirements,
    workRequirements: flow.work,
    attention: [...base.attention, ...evidenceAttention(flow)].filter(
      (item, idx, arr) =>
        arr.findIndex((row) => row.kind === item.kind && row.message === item.message) === idx,
    ),
  };
}
