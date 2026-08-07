/**
 * Derived Work Requirements for an operational date (Phase 11A).
 * Draft plans never appear. Retired plans are not prospective.
 * PAST_DUE_NOT_CONFIRMED is neutral — not proof work did not occur.
 */

import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";

import { buildOccurrenceKey } from "./occurrence-key";
import type {
  AcceptedEvidenceForWorkResolve,
  ConfirmedAssignmentForWorkResolve,
  ExistingWorkOccurrenceForResolve,
  PublishedCycleWindowForWorkResolve,
  PublishedWorkPlanForResolve,
  WorkRequirement,
  WorkRequirementState,
} from "./types";

export type AssetScopeForWorkResolve = {
  id: string;
  equipmentType: string | null;
  unitId?: string | null;
};

export type SpaceScopeForWorkResolve = {
  id: string;
  spaceType: string;
  unitId?: string | null;
};

export type ResolveWorkRequirementsInput = {
  facilityId: string;
  departmentId: string;
  operationalDateKey: string;
  now: Date;
  facilityTimezone?: string | null;
  unitId?: string | null;
  assets?: readonly AssetScopeForWorkResolve[];
  spaces?: readonly SpaceScopeForWorkResolve[];
  confirmedAssignments: readonly ConfirmedAssignmentForWorkResolve[];
  publishedPlans: readonly PublishedWorkPlanForResolve[];
  publishedCycles: readonly PublishedCycleWindowForWorkResolve[];
  existingOccurrences: readonly ExistingWorkOccurrenceForResolve[];
  acceptedEvidence?: readonly AcceptedEvidenceForWorkResolve[];
  unitNames?: ReadonlyMap<string, string>;
  pendingOfflineKeys?: readonly string[];
  synchronizingKeys?: readonly string[];
  conflictKeys?: readonly string[];
  pendingEvidenceKeys?: readonly string[];
};

function planAppliesToUnit(plan: PublishedWorkPlanForResolve, unitId: string | null): boolean {
  if (!plan.applicabilities.length) return true;
  return plan.applicabilities.some(
    (a) =>
      a.kind === "DEPARTMENT_UNIT" ||
      (a.kind === "SPECIFIC_UNIT" && unitId && a.unitId === unitId),
  );
}

function deriveState(input: {
  now: Date;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  occurrence: ExistingWorkOccurrenceForResolve | null;
  occurrenceKey: string;
  pendingOfflineKeys: readonly string[];
  synchronizingKeys: readonly string[];
  conflictKeys: readonly string[];
  completionMode: PublishedWorkPlanForResolve["items"][number]["completionMode"];
  acceptedEvidence: AcceptedEvidenceForWorkResolve | null;
  evidencePending: boolean;
}): { state: WorkRequirementState; evidenceRecordId: string | null } {
  const key = input.occurrenceKey;
  if (input.conflictKeys.includes(key)) {
    return { state: "CONFLICT_REVIEW", evidenceRecordId: null };
  }
  if (input.synchronizingKeys.includes(key)) {
    return { state: "SYNCHRONIZING", evidenceRecordId: null };
  }
  if (input.pendingOfflineKeys.includes(key) || input.evidencePending) {
    return { state: "SAVED_ON_THIS_TABLET", evidenceRecordId: null };
  }

  if (input.occurrence) {
    if (input.occurrence.status === "COMPLETED") {
      return {
        state: "COMPLETED",
        evidenceRecordId: input.occurrence.evidenceRecordId,
      };
    }
    if (input.occurrence.status === "COMPLETED_WITH_EVIDENCE") {
      return {
        state: "COMPLETED_WITH_EVIDENCE",
        evidenceRecordId: input.occurrence.evidenceRecordId,
      };
    }
    if (input.occurrence.status === "NOT_REQUIRED") {
      return { state: "NOT_REQUIRED", evidenceRecordId: null };
    }
    if (input.occurrence.status === "CANCELLED") {
      return { state: "NOT_APPLICABLE", evidenceRecordId: null };
    }
  }

  if (input.completionMode === "LINKED_EVIDENCE" && input.acceptedEvidence) {
    return {
      state: "COMPLETED_WITH_EVIDENCE",
      evidenceRecordId: input.acceptedEvidence.id,
    };
  }

  const starts = input.windowStartsAt;
  const ends = input.windowEndsAt;
  if (starts && input.now < starts) {
    return { state: "UPCOMING", evidenceRecordId: null };
  }
  if (starts && ends && input.now >= starts && input.now <= ends) {
    return { state: "CURRENT", evidenceRecordId: null };
  }
  if (ends && input.now > ends) {
    return { state: "PAST_DUE_NOT_CONFIRMED", evidenceRecordId: null };
  }
  if (starts && !ends && input.now >= starts) {
    return { state: "DUE", evidenceRecordId: null };
  }
  // ONCE_PER_OPERATIONAL_DATE with no window: due all day; past date => past due
  if (!starts && !ends) {
    const dateKey = key; // operational date is in key; use now vs date via windowEndsAt null
    void dateKey;
    return { state: "DUE", evidenceRecordId: null };
  }
  return { state: "DUE", evidenceRecordId: null };
}

export function resolveWorkRequirements(
  input: ResolveWorkRequirementsInput,
): WorkRequirement[] {
  const results: WorkRequirement[] = [];
  const occurrenceByKey = new Map(
    input.existingOccurrences.map((o) => [o.occurrenceKey, o]),
  );
  const pending = input.pendingOfflineKeys ?? [];
  const syncing = input.synchronizingKeys ?? [];
  const conflicts = input.conflictKeys ?? [];
  const pendingEvidence = new Set(input.pendingEvidenceKeys ?? []);
  const accepted = input.acceptedEvidence ?? [];

  const unitsWithConfirmed = new Set(
    input.confirmedAssignments
      .map((a) => a.unitId)
      .filter((id): id is string => Boolean(id)),
  );

  const targetUnitIds = input.unitId
    ? unitsWithConfirmed.has(input.unitId)
      ? [input.unitId]
      : []
    : [...unitsWithConfirmed];

  const dayStart = resolveCycleWindowInstants({
    operationalDateKey: input.operationalDateKey,
    startLocal: "00:00",
    endLocal: "23:59",
    facilityTimezone: input.facilityTimezone,
  });

  for (const plan of input.publishedPlans) {
    if (plan.status && plan.status !== "PUBLISHED") continue;

    for (const unitId of targetUnitIds) {
      if (!planAppliesToUnit(plan, unitId)) continue;
      const assignmentsHere = input.confirmedAssignments.filter((a) => a.unitId === unitId);

      for (const item of plan.items) {
        if (item.responsibilityMode === "EACH_ASSIGNED_EMPLOYEE") continue;

        if (item.roleKeys.length) {
          const roleMatch = assignmentsHere.some(
            (a) => a.roleKey && item.roleKeys.includes(a.roleKey),
          );
          if (!roleMatch) continue;
        }
        if (item.unitId && item.unitId !== unitId) continue;

        const scheduleTargets: {
          cycleStableKey: string | null;
          windowStartLocal: string | null;
          windowEndLocal: string | null;
          windowStartsAt: Date | null;
          windowEndsAt: Date | null;
        }[] = [];

        if (item.scheduleKind === "OPERATIONAL_CYCLE") {
          const keys = item.cycleStableKeys.length
            ? item.cycleStableKeys
            : input.publishedCycles.map((c) => c.stableKey);
          for (const cycleKey of keys) {
            const cycle = input.publishedCycles.find((c) => c.stableKey === cycleKey);
            if (!cycle) continue;
            scheduleTargets.push({
              cycleStableKey: cycle.stableKey,
              windowStartLocal: cycle.startLocal,
              windowEndLocal: cycle.endLocal,
              windowStartsAt: cycle.startsAt,
              windowEndsAt: cycle.endsAt,
            });
          }
        } else if (item.scheduleKind === "FIXED_DAILY_WINDOW") {
          const instants = resolveCycleWindowInstants({
            operationalDateKey: input.operationalDateKey,
            startLocal: item.windowStartLocal ?? "00:00",
            endLocal: item.windowEndLocal ?? "23:59",
            facilityTimezone: input.facilityTimezone,
          });
          if (!instants) continue;
          scheduleTargets.push({
            cycleStableKey: null,
            windowStartLocal: item.windowStartLocal,
            windowEndLocal: item.windowEndLocal,
            windowStartsAt: instants.startsAt,
            windowEndsAt: instants.endsAt,
          });
        } else {
          // ONCE_PER_OPERATIONAL_DATE — treat as full facility-local day
          scheduleTargets.push({
            cycleStableKey: null,
            windowStartLocal: null,
            windowEndLocal: null,
            windowStartsAt: dayStart?.startsAt ?? null,
            windowEndsAt: dayStart?.endsAt ?? null,
          });
        }

        for (const target of scheduleTargets) {
          const occurrenceKey = buildOccurrenceKey({
            sourceKind: "WORK_PLAN",
            workPlanStableKey: plan.stableKey,
            workPlanVersion: plan.version,
            workItemKey: item.itemKey,
            operationalDate: input.operationalDateKey,
            unitId,
            spaceId: item.spaceId,
            cycleStableKey: target.cycleStableKey,
            windowStartLocal: target.windowStartLocal,
            windowEndLocal: target.windowEndLocal,
          });

          const occurrence = occurrenceByKey.get(occurrenceKey) ?? null;
          const matchedEvidence =
            item.completionMode === "LINKED_EVIDENCE" && item.linkedTemplateStableKey
              ? accepted.find(
                  (e) =>
                    e.templateStableKey === item.linkedTemplateStableKey &&
                    (e.unitId == null || e.unitId === unitId),
                ) ?? null
              : null;

          const { state, evidenceRecordId } = deriveState({
            now: input.now,
            windowStartsAt: target.windowStartsAt,
            windowEndsAt: target.windowEndsAt,
            occurrence,
            occurrenceKey,
            pendingOfflineKeys: pending,
            synchronizingKeys: syncing,
            conflictKeys: conflicts,
            completionMode: item.completionMode,
            acceptedEvidence: matchedEvidence,
            evidencePending: pendingEvidence.has(occurrenceKey),
          });

          results.push({
            occurrenceKey,
            workPlanId: plan.id,
            workPlanStableKey: plan.stableKey,
            workPlanVersion: plan.version,
            workPlanName: plan.name,
            workItemId: item.id,
            workItemKey: item.itemKey,
            label: item.label,
            instructions: item.instructions,
            priority: item.priority,
            completionMode: item.completionMode,
            responsibilityMode: item.responsibilityMode,
            scheduleKind: item.scheduleKind,
            cycleStableKey: target.cycleStableKey,
            windowStartLocal: target.windowStartLocal,
            windowEndLocal: target.windowEndLocal,
            dueAt: target.windowEndsAt ?? target.windowStartsAt,
            windowStartsAt: target.windowStartsAt,
            windowEndsAt: target.windowEndsAt,
            unitId,
            unitName: input.unitNames?.get(unitId) ?? null,
            spaceId: item.spaceId,
            assetId: item.assetId,
            roleKeys: item.roleKeys,
            knowledgeArticleId: item.knowledgeArticleId,
            procedureTitle: item.procedureTitleSnapshot,
            linkedTemplateStableKey: item.linkedTemplateStableKey,
            linkedTemplateId: item.linkedTemplateId,
            state,
            occurrenceId: occurrence?.id ?? null,
            occurrenceStatus: occurrence?.status ?? null,
            assignedEmployeeId: occurrence?.assignedEmployeeId ?? null,
            completedByLabel: occurrence?.completedByLabel ?? null,
            completedAt: occurrence?.completedAt ?? null,
            evidenceRecordId: evidenceRecordId ?? occurrence?.evidenceRecordId ?? null,
            sourceKind: "WORK_PLAN",
            sourceHref: `/staffing/work-plans`,
          });
        }
      }
    }
  }

  for (const occ of input.existingOccurrences) {
    if (occ.sourceKind !== "ONE_OFF") continue;
    if (occ.status === "CANCELLED") continue;
    if (input.unitId && occ.unitId !== input.unitId) continue;

    let state: WorkRequirementState = "DUE";
    if (occ.status === "COMPLETED") state = "COMPLETED";
    else if (occ.status === "COMPLETED_WITH_EVIDENCE") state = "COMPLETED_WITH_EVIDENCE";
    else if (occ.status === "NOT_REQUIRED") state = "NOT_REQUIRED";
    else if (occ.dueAt && input.now > occ.dueAt) state = "PAST_DUE_NOT_CONFIRMED";
    else if (pending.includes(occ.occurrenceKey)) state = "SAVED_ON_THIS_TABLET";

    results.push({
      occurrenceKey: occ.occurrenceKey,
      workPlanId: occ.workPlanId ?? "",
      workPlanStableKey: occ.workPlanStableKey ?? "one_off",
      workPlanVersion: occ.workPlanVersion ?? 0,
      workPlanName: "One-off Work",
      workItemId: occ.workItemId ?? occ.id,
      workItemKey: occ.workItemKey ?? occ.occurrenceKey,
      label: occ.workItemLabelSnapshot,
      instructions: occ.instructionsSnapshot,
      priority: occ.priority,
      completionMode: "EXPLICIT_CONFIRMATION",
      responsibilityMode: "UNIT_SHARED",
      scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
      cycleStableKey: occ.cycleStableKey,
      windowStartLocal: occ.windowStartLocal,
      windowEndLocal: occ.windowEndLocal,
      dueAt: occ.dueAt,
      windowStartsAt: null,
      windowEndsAt: occ.dueAt,
      unitId: occ.unitId,
      unitName: occ.unitId ? input.unitNames?.get(occ.unitId) ?? null : null,
      spaceId: occ.spaceId,
      assetId: occ.assetId,
      roleKeys: [],
      knowledgeArticleId: occ.knowledgeArticleId,
      procedureTitle: occ.procedureTitleSnapshot,
      linkedTemplateStableKey: null,
      linkedTemplateId: null,
      state,
      occurrenceId: occ.id,
      occurrenceStatus: occ.status,
      assignedEmployeeId: occ.assignedEmployeeId,
      completedByLabel: occ.completedByLabel,
      completedAt: occ.completedAt,
      evidenceRecordId: occ.evidenceRecordId,
      sourceKind: "ONE_OFF",
      sourceHref: `/staffing/operations?work=${encodeURIComponent(occ.occurrenceKey)}`,
    });
  }

  return results;
}
