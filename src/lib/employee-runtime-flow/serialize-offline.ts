/**
 * Serialize EmployeeRuntimeFlow into existing offline bundle slices.
 * Reshapes only. Does not recompute due state, operation, or next.
 */

import type { OfflineRuntimeBundle } from "@/lib/offline/types";

import { operationSummaryLabel } from "./operation";
import type { EmployeeRuntimeFlow } from "./types";

export function serializeEmployeeRuntimeJobFlowContext(
  flow: EmployeeRuntimeFlow,
  input: {
    state: string;
    unitId: string;
    unitName: string;
    bundleRevision: string;
    lastSyncedAt: string;
  },
): NonNullable<OfflineRuntimeBundle["jobFlowContext"]> {
  const assignment = flow.currentAssignment ?? flow.upcomingAssignment;
  const startsIso = assignment?.startsAt?.toISOString() ?? null;
  return {
    state: input.state,
    assignmentId: assignment?.id ?? null,
    assignmentRevision:
      assignment?.id != null ? `${assignment.id}:${startsIso ?? ""}` : null,
    unitId: flow.responsibility.unitId ?? assignment?.unitId ?? input.unitId,
    unitName: flow.responsibility.unitName ?? assignment?.unitName ?? input.unitName,
    duty: flow.responsibility.roleLabel ?? assignment?.roleLabel ?? null,
    windowStart: startsIso,
    windowEnd: assignment?.endsAt?.toISOString() ?? null,
    cycleId: flow.operation.kind === "shared" ? flow.operation.cycleStableKey : null,
    cycleLabel: flow.operation.kind === "none" ? null : operationSummaryLabel(flow.operation),
    cycleType: flow.operation.kind === "shared" ? "CUSTOM" : null,
    expectation:
      flow.assignmentAvailability === "unavailable"
        ? "Assignment unavailable"
        : flow.next.kind !== "none"
          ? flow.next.label
          : flow.responsibility.roleLabel
            ? `Assigned: ${flow.responsibility.roleLabel}.`
            : "No confirmed Assignment for today.",
    mealTargetTime: null,
    nextCycleLabel: flow.locationNext?.label ?? null,
    expectedMilestones: [],
    milestoneStates: flow.milestones.slice(0, 4).map((row) => ({
      key: row.statusKey,
      label: row.label,
    })),
    progressPhases: [],
    attentionKinds: flow.device.mismatch ? ["assignment_updated"] : [],
    evidenceRequirementKeys:
      flow.evidenceMode === "harbor"
        ? flow.evidence.map((row) => row.requirementKey)
        : flow.templateEvidence.map((row) => row.requirementKey),
    bundleRevision: input.bundleRevision,
    lastSyncedAt: input.lastSyncedAt,
    stale: flow.offline.stale,
  };
}

export function serializeEmployeeRuntimeEvidenceContext(
  flow: EmployeeRuntimeFlow,
  lastSyncedAt: string,
): NonNullable<OfflineRuntimeBundle["evidenceContext"]> | null {
  if (flow.device.mismatch) return null;
  if (flow.evidenceMode === "harbor") {
    const scoped = flow.evidence.filter(
      (row) =>
        row.category === "needs_attention" ||
        row.category === "due_now" ||
        row.category === "upcoming",
    );
    if (scoped.length === 0) {
      return { requirements: [], lastSyncedAt };
    }
    return {
      requirements: scoped.map((row) => ({
        requirementKey: row.requirementKey,
        templateId: "",
        templateVersion: 1,
        templateName: row.displayName,
        purposeType: "LOG",
        state: row.productState,
        scheduleKind: "OPERATIONAL_CYCLE",
        cycleStableKey: null,
        cycleLabel: null,
        windowStartLocal: row.window.start,
        windowEndLocal: row.window.end,
        assetId: null,
        spaceId: row.spaceId,
        logAttachmentId: row.attachmentId,
        instructions: null,
        fields: [],
      })),
      lastSyncedAt,
    };
  }

  if (flow.evidenceMode === "template") {
    const scoped = flow.templateEvidence.filter((row) =>
      ["DUE", "UPCOMING", "NOT_CONFIRMED", "NEEDS_REVIEW"].includes(row.state),
    );
    return {
      requirements: scoped.map((row) => ({
        requirementKey: row.requirementKey,
        templateId: row.templateId,
        templateVersion: row.templateVersion,
        templateName: row.templateName,
        purposeType: row.purposeType,
        state: row.state,
        scheduleKind: row.scheduleKind,
        cycleStableKey: row.cycleStableKey,
        cycleLabel: row.cycleLabel,
        windowStartLocal: row.windowStartLocal,
        windowEndLocal: row.windowEndLocal,
        assetId: row.assetId,
        spaceId: row.spaceId,
        logAttachmentId: null,
        instructions: row.instructions,
        fields: row.fields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          displaySequence: field.displaySequence,
          helpText: field.helpText,
          unitLabel: field.unitLabel,
          minNumber: field.minNumber,
          maxNumber: field.maxNumber,
          allowedSelections: field.allowedSelections,
          correctiveActionTrigger: field.correctiveActionTrigger,
          correctiveActionRequired: field.correctiveActionRequired,
        })),
      })),
      lastSyncedAt,
    };
  }

  return null;
}

export function serializeEmployeeRuntimeWorkContext(
  flow: EmployeeRuntimeFlow,
  lastSyncedAt: string,
): NonNullable<OfflineRuntimeBundle["workContext"]> | null {
  if (flow.device.mismatch) return null;
  const scoped = flow.work.filter((row) =>
    ["DUE", "CURRENT", "UPCOMING", "PAST_DUE_NOT_CONFIRMED", "SAVED_ON_THIS_TABLET"].includes(
      row.state,
    ),
  );
  return {
    requirements: scoped.map((row) => ({
      occurrenceKey: row.occurrenceKey,
      label: row.label,
      state: row.state,
      priority: row.priority,
      completionMode: row.completionMode,
      workPlanStableKey: row.workPlanStableKey,
      workPlanVersion: row.workPlanVersion,
      workItemKey: row.workItemKey,
      workPlanId: row.workPlanId,
      workItemId: row.workItemId,
      instructions: row.instructions,
      knowledgeArticleId: row.knowledgeArticleId,
      procedureTitle: row.procedureTitle,
      dueAt: row.dueAt?.toISOString() ?? null,
      cycleStableKey: row.cycleStableKey,
      windowStartLocal: row.windowStartLocal,
      windowEndLocal: row.windowEndLocal,
      assignedEmployeeId: row.assignedEmployeeId,
    })),
    lastSyncedAt,
  };
}
