/**
 * Present canonical WorkRequirements for Today's Work.
 * Uses existing requirement state and run-presentation cycle keys.
 * Does not recalculate currentness, invent grouping persistence, or require assignment.
 */

import type { WorkRequirement, WorkRequirementState } from "@/lib/department-work/types";
import type { RunDepartmentOperationPresentation } from "@/lib/operational-cycles/present-run-operation";

import type {
  TodaysExpectedWorkItemView,
  TodaysExpectedWorkLocationView,
  TodaysExpectedWorkPlanView,
  TodaysExpectedWorkView,
} from "./types";

const CURRENT_VISIBLE_STATES = new Set<WorkRequirementState>([
  "CURRENT",
  "DUE",
  "COMPLETED",
  "COMPLETED_WITH_EVIDENCE",
  "SAVED_ON_THIS_TABLET",
  "SYNCHRONIZING",
  "CONFLICT_REVIEW",
]);

const OMIT_STATES = new Set<WorkRequirementState>([
  "NOT_REQUIRED",
  "NOT_APPLICABLE",
  "NOT_CONFIGURED",
  "REASSIGNED",
]);

export type AssignmentDisplayForTodayWork = {
  unitId: string;
  employeeDisplayName: string;
};

export type PresentExpectedWorkInput = {
  facilityId: string;
  departmentId: string;
  requirements: readonly WorkRequirement[];
  runPresentation: Pick<
    RunDepartmentOperationPresentation,
    "currentOperations" | "nextOperation"
  > | null;
  locationOrder?: ReadonlyMap<string, number>;
  assignments?: readonly AssignmentDisplayForTodayWork[];
  workCapabilityEnabled: boolean;
  hasPublishedWorkPlans: boolean;
  canConfirmWork: boolean;
  canManageWorkPlans: boolean;
  workPlansHref?: string | null;
};

function isCompleted(state: WorkRequirementState): boolean {
  return state === "COMPLETED" || state === "COMPLETED_WITH_EVIDENCE";
}

function itemStatusLabel(requirement: WorkRequirement): string | null {
  if (requirement.completionMode === "LINKED_EVIDENCE" && !isCompleted(requirement.state)) {
    return "Needs linked evidence";
  }
  if (requirement.state === "SAVED_ON_THIS_TABLET") return "Saved on this tablet";
  if (requirement.state === "SYNCHRONIZING") return "Synchronizing";
  if (requirement.state === "CONFLICT_REVIEW") return "Needs review";
  return null;
}

function namesForUnit(
  unitId: string,
  assignments: readonly AssignmentDisplayForTodayWork[],
): string | null {
  const names = [
    ...new Set(
      assignments
        .filter((row) => row.unitId === unitId)
        .map((row) => row.employeeDisplayName.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  return names.length ? names.join(", ") : null;
}

function toItemView(
  requirement: WorkRequirement,
  input: PresentExpectedWorkInput,
): TodaysExpectedWorkItemView {
  const completed = isCompleted(requirement.state);
  const open = requirement.state === "CURRENT" || requirement.state === "DUE";
  const evidenceRequired =
    requirement.completionMode === "LINKED_EVIDENCE" && !completed;
  return {
    occurrenceKey: requirement.occurrenceKey,
    workItemKey: requirement.workItemKey,
    label: requirement.label,
    state: requirement.state,
    completed,
    statusLabel: itemStatusLabel(requirement),
    evidenceRequired,
    canConfirm:
      input.canConfirmWork &&
      requirement.completionMode === "EXPLICIT_CONFIRMATION" &&
      open &&
      Boolean(requirement.unitId),
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId: requirement.unitId,
  };
}

function compareLocations(
  a: TodaysExpectedWorkLocationView,
  b: TodaysExpectedWorkLocationView,
  locationOrder: ReadonlyMap<string, number> | undefined,
): number {
  const orderA = locationOrder?.get(a.unitId) ?? Number.MAX_SAFE_INTEGER;
  const orderB = locationOrder?.get(b.unitId) ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  const name = a.locationName.localeCompare(b.locationName);
  if (name !== 0) return name;
  return a.unitId.localeCompare(b.unitId);
}

function groupByLocation(
  requirements: readonly WorkRequirement[],
  input: PresentExpectedWorkInput,
): TodaysExpectedWorkLocationView[] {
  const byUnit = new Map<string, WorkRequirement[]>();
  for (const requirement of requirements) {
    const unitId = requirement.unitId ?? "";
    const list = byUnit.get(unitId) ?? [];
    list.push(requirement);
    byUnit.set(unitId, list);
  }

  const locations: TodaysExpectedWorkLocationView[] = [];
  for (const [unitId, unitRequirements] of byUnit) {
    const planOrder: string[] = [];
    const byPlan = new Map<string, WorkRequirement[]>();
    for (const requirement of unitRequirements) {
      const planKey = requirement.workPlanId;
      if (!byPlan.has(planKey)) {
        planOrder.push(planKey);
        byPlan.set(planKey, []);
      }
      byPlan.get(planKey)!.push(requirement);
    }

    const plans: TodaysExpectedWorkPlanView[] = planOrder.map((planId) => {
      const items = byPlan.get(planId)!;
      const first = items[0]!;
      return {
        workPlanId: planId,
        workPlanName: first.workPlanName,
        assignmentLabel: unitId ? namesForUnit(unitId, input.assignments ?? []) : null,
        items: items.map((item) => toItemView(item, input)),
      };
    });

    locations.push({
      unitId,
      locationName: unitRequirements[0]?.unitName?.trim() || "Location",
      plans,
    });
  }

  return locations.sort((a, b) => compareLocations(a, b, input.locationOrder));
}

function uniqueByOccurrenceKey(requirements: readonly WorkRequirement[]): WorkRequirement[] {
  const seen = new Set<string>();
  const unique: WorkRequirement[] = [];
  for (const requirement of requirements) {
    if (seen.has(requirement.occurrenceKey)) continue;
    seen.add(requirement.occurrenceKey);
    unique.push(requirement);
  }
  return unique;
}

export function presentExpectedWorkFromRequirements(
  input: PresentExpectedWorkInput,
): TodaysExpectedWorkView {
  const configureHref =
    input.workCapabilityEnabled &&
    !input.hasPublishedWorkPlans &&
    input.canManageWorkPlans &&
    input.workPlansHref
      ? input.workPlansHref
      : null;

  if (!input.workCapabilityEnabled) {
    return {
      workCapabilityEnabled: false,
      hasPublishedWorkPlans: false,
      currentGroups: [],
      otherWork: [],
      upcoming: null,
      configureHref: null,
      configureLabel: null,
    };
  }

  const requirements = uniqueByOccurrenceKey(
    input.requirements.filter((requirement) => !OMIT_STATES.has(requirement.state)),
  );
  const currentOperations = input.runPresentation?.currentOperations ?? [];
  const currentKeyToGroup = new Map<string, (typeof currentOperations)[number]>();
  for (const operation of currentOperations) {
    for (const key of operation.cycleStableKeys) {
      if (!currentKeyToGroup.has(key)) currentKeyToGroup.set(key, operation);
    }
  }
  const currentKeys = new Set(currentKeyToGroup.keys());

  const currentByOperation = new Map<string, WorkRequirement[]>();
  const other: WorkRequirement[] = [];
  const upcomingReqs: WorkRequirement[] = [];
  const nextKey = input.runPresentation?.nextOperation?.cycleStableKey ?? null;

  for (const requirement of requirements) {
    if (!requirement.cycleStableKey) {
      if (CURRENT_VISIBLE_STATES.has(requirement.state)) other.push(requirement);
      continue;
    }

    if (currentKeys.has(requirement.cycleStableKey) && CURRENT_VISIBLE_STATES.has(requirement.state)) {
      const operation = currentKeyToGroup.get(requirement.cycleStableKey);
      const groupKey = operation?.parentLabel ?? requirement.cycleStableKey;
      const list = currentByOperation.get(groupKey) ?? [];
      list.push(requirement);
      currentByOperation.set(groupKey, list);
      continue;
    }

    if (nextKey && requirement.cycleStableKey === nextKey && requirement.state === "UPCOMING") {
      upcomingReqs.push(requirement);
    }
  }

  const currentGroups = currentOperations
    .map((operation) => {
      const rows = currentByOperation.get(operation.parentLabel) ?? [];
      if (!rows.length) return null;
      return {
        operationLabel: operation.parentLabel,
        windowLabel: operation.windowLabel,
        cycleStableKeys: operation.cycleStableKeys,
        locations: groupByLocation(rows, input),
      };
    })
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  for (const [label, rows] of currentByOperation) {
    if (currentGroups.some((group) => group.operationLabel === label)) continue;
    if (!rows.length) continue;
    currentGroups.push({
      operationLabel: label,
      windowLabel: null,
      cycleStableKeys: [
        ...new Set(rows.map((row) => row.cycleStableKey).filter((key): key is string => Boolean(key))),
      ],
      locations: groupByLocation(rows, input),
    });
  }

  const next = input.runPresentation?.nextOperation ?? null;
  const upcoming =
    next && upcomingReqs.length
      ? {
          operationLabel: next.label,
          windowLabel: next.windowLabel,
          locations: groupByLocation(upcomingReqs, input),
        }
      : null;

  return {
    workCapabilityEnabled: true,
    hasPublishedWorkPlans: input.hasPublishedWorkPlans,
    currentGroups,
    otherWork: groupByLocation(other, input),
    upcoming,
    configureHref,
    configureLabel: configureHref ? "Configure recurring work" : null,
  };
}

export function todaysExpectedWorkHasVisibleWork(view: TodaysExpectedWorkView): boolean {
  return (
    view.currentGroups.some((group) => group.locations.length > 0) ||
    view.otherWork.length > 0 ||
    Boolean(view.upcoming?.locations.length)
  );
}
