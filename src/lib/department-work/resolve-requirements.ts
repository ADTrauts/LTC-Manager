/**
 * Derived Work Requirements for an operational date (Phase 11A / 11B).
 * Draft plans never appear. Retired plans are not prospective.
 * PAST_DUE_NOT_CONFIRMED is neutral — not proof work did not occur.
 *
 * Expected Work is derived from published plans + service date + applicability +
 * cycle participation when cycle-bound. Confirmed assignments do not enumerate
 * locations. EACH_ASSIGNED_EMPLOYEE remains skipped.
 *
 * Phase 11B: SPECIFIC_SPACE / SPACE_TYPE applicabilities expand one requirement
 * per matching UnitSpace in the unit. Room = UnitSpace.
 *
 * OPERATIONAL_TYPE matches DepartmentRoomArchetype.key on spaces (department
 * operational classification). It does not use physical SpaceType, department
 * key special cases, or location-name inference. No match → no Work (no
 * fallback to every responsible unit).
 *
 * OPERATIONAL_CYCLE with no cycleStableKeys is not configured: it matches no
 * Cycle and produces no WorkRequirement. It does not mean every published Cycle.
 * A closed function room set (roomSetClosed) matches only those rooms.
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
  /** Department operational type (DepartmentRoomArchetype.key). Distinct from spaceType. */
  operationalTypeKey?: string | null;
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
  /**
   * Department-responsible units (or an explicit caller scope).
   * When omitted, candidates are inferred from requested unitId, SPECIFIC_UNIT
   * applicability, cycle participation, and space.unitId — never from assignments.
   */
  candidateUnitIds?: readonly string[];
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

function spacesForUnit(
  spaces: readonly SpaceScopeForWorkResolve[] | undefined,
  unitId: string,
): SpaceScopeForWorkResolve[] {
  return (spaces ?? []).filter((s) => !s.unitId || s.unitId === unitId);
}

function dateOnlyKey(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 10) : null;
}

/** Published plan is live on this facility-local service date (weekdays empty = all days). */
export function isWorkPlanEffectiveOnDate(
  plan: Pick<PublishedWorkPlanForResolve, "effectiveStartDate" | "effectiveEndDate" | "weekdays">,
  operationalDateKey: string,
): boolean {
  const dateKey = operationalDateKey.slice(0, 10);
  const start = dateOnlyKey(plan.effectiveStartDate);
  const end = dateOnlyKey(plan.effectiveEndDate);
  if (start && dateKey < start) return false;
  if (end && dateKey > end) return false;
  if (!plan.weekdays.length) return true;
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return plan.weekdays.includes(weekday);
}

function cycleIncludesUnit(
  cycle: PublishedCycleWindowForWorkResolve,
  unitId: string,
  spaces?: readonly SpaceScopeForWorkResolve[],
): boolean {
  if (cycle.departmentWide) return true;
  const unitIds = cycle.participatingUnitIds ?? [];
  if (unitIds.includes(unitId)) return true;
  const spaceIds = cycle.participatingSpaceIds ?? [];
  if (!spaceIds.length) return false;
  return spacesForUnit(spaces, unitId).some((space) => spaceIds.includes(space.id));
}

function cycleIncludesSpace(
  cycle: PublishedCycleWindowForWorkResolve,
  spaceId: string | null,
): boolean {
  if (cycle.departmentWide) return true;
  const spaceIds = cycle.participatingSpaceIds ?? [];
  if (cycle.roomSetClosed) {
    if (!spaceId) return false;
    return spaceIds.includes(spaceId);
  }
  if (!spaceId) return true;
  if (!spaceIds.length) return true;
  return spaceIds.includes(spaceId);
}

/**
 * Function-targeted cycles participate only through their bound rooms.
 * A unit-level Work item expands onto those rooms. An empty closed set expands to none.
 */
function spaceIdsForCycleTarget(
  baseSpaceIds: readonly (string | null)[],
  cycle: PublishedCycleWindowForWorkResolve | undefined,
  unitId: string,
  spaces: readonly SpaceScopeForWorkResolve[] | undefined,
): Array<string | null> {
  if (!cycle?.roomSetClosed || cycle.departmentWide) return [...baseSpaceIds];
  const allowed = new Set(cycle.participatingSpaceIds ?? []);
  if (allowed.size === 0) return [];
  if (baseSpaceIds.length === 1 && baseSpaceIds[0] == null) {
    return spacesForUnit(spaces, unitId)
      .map((space) => space.id)
      .filter((id) => allowed.has(id));
  }
  return baseSpaceIds.filter((id): id is string => id != null && allowed.has(id));
}

function collectFallbackCandidateUnitIds(input: ResolveWorkRequirementsInput): string[] {
  const ids = new Set<string>();
  if (input.unitId) ids.add(input.unitId);
  for (const plan of input.publishedPlans) {
    for (const app of plan.applicabilities) {
      if (app.kind === "SPECIFIC_UNIT" && app.unitId) ids.add(app.unitId);
    }
    for (const item of plan.items) {
      if (item.unitId) ids.add(item.unitId);
    }
  }
  for (const cycle of input.publishedCycles) {
    for (const unitId of cycle.participatingUnitIds ?? []) ids.add(unitId);
  }
  for (const space of input.spaces ?? []) {
    if (space.unitId) ids.add(space.unitId);
  }
  return [...ids];
}

function resolveTargetUnitIds(input: ResolveWorkRequirementsInput): string[] {
  if (input.candidateUnitIds) {
    const scoped = input.candidateUnitIds.filter(Boolean);
    return input.unitId ? scoped.filter((id) => id === input.unitId) : scoped;
  }
  return collectFallbackCandidateUnitIds(input);
}

function planAppliesToUnit(
  plan: PublishedWorkPlanForResolve,
  unitId: string | null,
  spaces?: readonly SpaceScopeForWorkResolve[],
): boolean {
  if (!plan.applicabilities.length) return true;
  return plan.applicabilities.some((a) => {
    if (a.kind === "DEPARTMENT_UNIT") return true;
    if (a.kind === "SPECIFIC_UNIT" && unitId && a.unitId === unitId) return true;
    if (!unitId) return false;
    if (a.kind === "SPECIFIC_SPACE" && a.spaceId) {
      return spacesForUnit(spaces, unitId).some((s) => s.id === a.spaceId);
    }
    if (a.kind === "SPACE_TYPE" && a.spaceType) {
      return spacesForUnit(spaces, unitId).some((s) => s.spaceType === a.spaceType);
    }
    if (a.kind === "OPERATIONAL_TYPE" && a.operationalTypeKey) {
      return spacesForUnit(spaces, unitId).some(
        (s) => s.operationalTypeKey === a.operationalTypeKey,
      );
    }
    return false;
  });
}

/**
 * Resolve which spaceId values to emit for an item under a plan.
 * - item.spaceId set → that single space (must belong to unit when spaces provided)
 * - plan has SPECIFIC_SPACE / SPACE_TYPE / OPERATIONAL_TYPE → one per matching unit space
 * - else → unit-level (null spaceId)
 */
function resolveSpaceIdsForItem(input: {
  plan: PublishedWorkPlanForResolve;
  itemSpaceId: string | null;
  unitId: string;
  spaces?: readonly SpaceScopeForWorkResolve[];
}): Array<string | null> {
  const unitSpaces = spacesForUnit(input.spaces, input.unitId);

  if (input.itemSpaceId) {
    if (input.spaces !== undefined && input.spaces !== null) {
      const belongs = unitSpaces.some((s) => s.id === input.itemSpaceId);
      if (!belongs) return [];
    }
    return [input.itemSpaceId];
  }

  const spaceApps = input.plan.applicabilities.filter(
    (a) =>
      a.kind === "SPECIFIC_SPACE" ||
      a.kind === "SPACE_TYPE" ||
      a.kind === "OPERATIONAL_TYPE",
  );
  if (!spaceApps.length) {
    return [null];
  }

  const matched = new Map<string, SpaceScopeForWorkResolve>();
  for (const space of unitSpaces) {
    for (const app of spaceApps) {
      if (app.kind === "SPECIFIC_SPACE" && app.spaceId === space.id) {
        matched.set(space.id, space);
      } else if (app.kind === "SPACE_TYPE" && app.spaceType === space.spaceType) {
        matched.set(space.id, space);
      } else if (
        app.kind === "OPERATIONAL_TYPE" &&
        app.operationalTypeKey &&
        space.operationalTypeKey === app.operationalTypeKey
      ) {
        matched.set(space.id, space);
      }
    }
  }
  return [...matched.keys()];
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

  const targetUnitIds = resolveTargetUnitIds(input);

  const dayStart = resolveCycleWindowInstants({
    operationalDateKey: input.operationalDateKey,
    startLocal: "00:00",
    endLocal: "23:59",
    facilityTimezone: input.facilityTimezone,
  });

  for (const plan of input.publishedPlans) {
    if (plan.status && plan.status !== "PUBLISHED") continue;
    if (!isWorkPlanEffectiveOnDate(plan, input.operationalDateKey)) continue;

    for (const unitId of targetUnitIds) {
      if (!planAppliesToUnit(plan, unitId, input.spaces)) continue;

      for (const item of plan.items) {
        if (item.responsibilityMode === "EACH_ASSIGNED_EMPLOYEE") continue;
        if (item.unitId && item.unitId !== unitId) continue;

        const spaceIds = resolveSpaceIdsForItem({
          plan,
          itemSpaceId: item.spaceId,
          unitId,
          spaces: input.spaces,
        });
        if (!spaceIds.length) continue;

        const scheduleTargets: {
          cycleStableKey: string | null;
          windowStartLocal: string | null;
          windowEndLocal: string | null;
          windowStartsAt: Date | null;
          windowEndsAt: Date | null;
        }[] = [];

        if (item.scheduleKind === "OPERATIONAL_CYCLE") {
          const keys = item.cycleStableKeys;
          for (const cycleKey of keys) {
            const cycle = input.publishedCycles.find((c) => c.stableKey === cycleKey);
            if (!cycle || cycle.nodeKind === "KEY_TIME") continue;
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
          const cycle = target.cycleStableKey
            ? input.publishedCycles.find((c) => c.stableKey === target.cycleStableKey)
            : undefined;
          if (target.cycleStableKey) {
            if (!cycle) continue;
            if (!cycleIncludesUnit(cycle, unitId, input.spaces)) continue;
          }
          const targetSpaceIds = spaceIdsForCycleTarget(spaceIds, cycle, unitId, input.spaces);
          for (const spaceId of targetSpaceIds) {
            if (cycle && !cycleIncludesSpace(cycle, spaceId)) continue;

            const occurrenceKey = buildOccurrenceKey({
              sourceKind: "WORK_PLAN",
              workPlanStableKey: plan.stableKey,
              workPlanVersion: plan.version,
              workItemKey: item.itemKey,
              operationalDate: input.operationalDateKey,
              unitId,
              spaceId,
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
              spaceId,
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
