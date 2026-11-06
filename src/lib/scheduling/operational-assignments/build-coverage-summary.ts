/**
 * Canonical Dietary coverage engine (Phase 5B).
 *
 * Consumes published/effective coverage expectations (adapted assignment
 * templates) and OperationalAssignment actuals. Never falls back to
 * ScheduleEntry. Team membership is not demand and does not fill a slot.
 *
 * OPERATIONAL_ASSIGNMENTS_ENABLED:
 * - When false, this function still evaluates OA actuals passed in by the
 *   caller. It does not read ScheduleEntry and never labels schedule presence
 *   as COVERED. Pages that used to mix schedule heuristics stay on their
 *   legacy engines. This function is the one migrated Dietary consumer.
 * - When true, callers already load OA rows; those are the only actuals.
 *
 * Coverage state is derived. Do not persist isCovered.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import {
  evaluateCoverageSlotState,
  evaluateCoverageSlots,
  flattenCoverageTemplateItems,
  planLifecycleFromStatus,
  resolveCoverageExpectationsForLocation,
  selectRuntimeCoverageTemplates,
  type CoverageAssignmentActual,
  type CoverageCycleRef,
  type CoverageExpectationItemInput,
  type CoverageTemplateVersionRow,
} from "@/lib/scheduling/coverage-expectations";

export type CoverageState =
  | "COVERED"
  | "AT_RISK"
  | "UNCOVERED"
  | "NOT_YET_ASSIGNED"
  | "NOT_APPLICABLE"
  | "NOT_CONFIRMED";

export type UnitCoverageRow = {
  unitId: string | null;
  unitName: string;
  spaceId?: string | null;
  spaceName?: string | null;
  cycleStableKey?: string | null;
  cycleLabel?: string | null;
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  filledCount: number;
  state: CoverageState;
  templateItemId: string | null;
};

export type CoverageSummary = {
  planStatus: string | null;
  covered: number;
  atRisk: number;
  uncovered: number;
  notYetAssigned: number;
  notConfirmed: number;
  notApplicable: number;
  rows: UnitCoverageRow[];
  unassignedScheduledCount: number;
  callOffAffectedCount: number;
  /**
   * canonical-oa: expectation vs OperationalAssignment only.
   * Never schedule-derived. When OPERATIONAL_ASSIGNMENTS_ENABLED is false,
   * callers should not present this as schedule coverage.
   */
  engine: "canonical-oa";
};

type DbClient = PrismaClient | Prisma.TransactionClient;

export type DietaryCoverageAssignmentInput = {
  id?: string;
  unitId: string | null;
  unitName: string | null;
  roleKey: string;
  status: string;
  hasCallDown?: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  coveredSpaceIds?: string[];
};

/**
 * Coverage from published/effective expectations vs eligible OperationalAssignments.
 * A coverage gap is operational risk, not proof that service failed.
 */
export async function buildDietaryCoverageSummary(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDateKey: string;
    planStatus: string | null;
    assignments: DietaryCoverageAssignmentInput[];
    scheduledEmployeeIds: string[];
    assignedEmployeeIds: string[];
    callOffEmployeeIds: string[];
    asOf?: Date;
    facilityTimezone?: string | null;
  },
): Promise<CoverageSummary> {
  const assigned = new Set(input.assignedEmployeeIds);
  const unassignedScheduledCount = input.scheduledEmployeeIds.filter((id) => !assigned.has(id)).length;
  const callOffAffectedCount = input.callOffEmployeeIds.length;

  const [templateRows, cycles, spaces] = await Promise.all([
    client.operationalAssignmentTemplate.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
      },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { unit: { select: { id: true, name: true } } },
        },
      },
    }),
    loadPublishedCyclesForDate(input.facilityId, input.departmentId, input.serviceDateKey, client),
    client.unitSpace.findMany({
      where: {
        facilityId: input.facilityId,
        isActive: true,
        responsibilities: { some: { departmentId: input.departmentId } },
      },
      select: { id: true, name: true, unitId: true, unit: { select: { name: true } } },
    }),
  ]);

  const runtimeTemplates = selectRuntimeCoverageTemplates(
    templateRows.map((row) => ({
      id: row.id,
      stableKey: row.stableKey,
      version: row.version,
      status: row.status,
      isActive: row.isActive,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      items: row.items.map((item) => ({
        id: item.id,
        roleKey: item.roleKey,
        roleLabel: item.roleLabel,
        requiredCount: item.requiredCount,
        unitId: item.unitId,
        applicableOperationalTypeKeys: item.applicableOperationalTypeKeys,
        applicableOperationalCycleStableKeys: item.applicableOperationalCycleStableKeys,
      })),
    })) as CoverageTemplateVersionRow[],
    input.serviceDateKey,
  );
  const items: CoverageExpectationItemInput[] = flattenCoverageTemplateItems(runtimeTemplates);
  const otItems = items.filter((item) => item.applicableOperationalTypeKeys.length > 0);
  const legacyItems = items.filter((item) => item.applicableOperationalTypeKeys.length === 0);

  const cycleRefs: CoverageCycleRef[] = cycles
    .filter((cycle) => cycle.nodeKind === "PERIOD")
    .map((cycle) => ({ stableKey: cycle.stableKey, label: cycle.label }));

  const cycleWindows = new Map<string, { startsAt: Date | null; endsAt: Date | null }>();
  for (const cycle of cycles) {
    if (cycle.nodeKind !== "PERIOD" || !cycle.startLocal || !cycle.endLocal) continue;
    const window = resolveCycleWindowInstants({
      operationalDateKey: input.serviceDateKey,
      startLocal: cycle.startLocal,
      endLocal: cycle.endLocal,
      overnight: cycle.overnight,
      facilityTimezone: input.facilityTimezone,
    });
    cycleWindows.set(cycle.stableKey, window ?? { startsAt: null, endsAt: null });
  }

  const actuals: CoverageAssignmentActual[] = input.assignments.map((assignment, index) => ({
    id: assignment.id ?? `oa-${index}-${assignment.roleKey}-${assignment.unitId ?? "none"}`,
    roleKey: assignment.roleKey,
    status: assignment.status,
    unitId: assignment.unitId,
    coveredSpaceIds: assignment.coveredSpaceIds ?? [],
    startsAt: toDate(assignment.startsAt),
    endsAt: toDate(assignment.endsAt),
    hasCallDown: assignment.hasCallDown,
  }));

  const plan = planLifecycleFromStatus(input.planStatus);
  const rows: UnitCoverageRow[] = [];
  let covered = 0;
  let atRisk = 0;
  let uncovered = 0;
  let notYetAssigned = 0;
  let notConfirmed = 0;
  let notApplicable = 0;

  if (items.length === 0) {
    notApplicable = 1;
    return {
      planStatus: input.planStatus,
      covered,
      atRisk,
      uncovered,
      notYetAssigned,
      notConfirmed,
      notApplicable,
      rows,
      unassignedScheduledCount,
      callOffAffectedCount,
      engine: "canonical-oa",
    };
  }

  const asOf = input.asOf ?? null;
  const activeCycleKeysAtAsOf = new Set<string>();
  if (asOf) {
    for (const [stableKey, window] of cycleWindows) {
      if (!window.startsAt || !window.endsAt) continue;
      if (asOf.getTime() >= window.startsAt.getTime() && asOf.getTime() < window.endsAt.getTime()) {
        activeCycleKeysAtAsOf.add(stableKey);
      }
    }
  }

  for (const space of spaces) {
    const locationCycles = asOf
      ? cycleRefs.filter((cycle) => activeCycleKeysAtAsOf.has(cycle.stableKey))
      : cycleRefs;
    const expectations = resolveCoverageExpectationsForLocation({
      items: otItems,
      context: {
        departmentId: input.departmentId,
        spaceId: space.id,
        unitId: space.unitId,
        operationalTypeKey: null,
        operationalTypeName: null,
      },
      cycles: locationCycles,
    });

    if (asOf && locationCycles.length === 0) {
      const wouldApply = resolveCoverageExpectationsForLocation({
        items: otItems,
        context: {
          departmentId: input.departmentId,
          spaceId: space.id,
          unitId: space.unitId,
          operationalTypeKey: null,
          operationalTypeName: null,
        },
        cycles: cycleRefs,
      });
      if (wouldApply.length > 0) {
        notApplicable += 1;
        rows.push({
          unitId: space.unitId,
          unitName: space.unit?.name ?? "Unit",
          spaceId: space.id,
          spaceName: space.name,
          cycleStableKey: null,
          cycleLabel: null,
          roleKey: "",
          roleLabel: "No applicable Operational Cycle",
          requiredCount: 0,
          filledCount: 0,
          state: "NOT_APPLICABLE",
          templateItemId: null,
        });
      }
      continue;
    }

    const evaluated = evaluateCoverageSlots({
      expectations,
      assignments: actuals,
      spaceId: space.id,
      unitId: space.unitId,
      plan,
      cycleWindows,
    });

    for (const slot of evaluated) {
      incrementState(slot.state);
      rows.push({
        unitId: space.unitId,
        unitName: space.unit?.name ?? (slot.expectation.unitId ? "Unit" : "Any unit"),
        spaceId: space.id,
        spaceName: space.name,
        cycleStableKey: slot.expectation.cycleStableKey,
        cycleLabel: slot.expectation.cycleLabel,
        roleKey: slot.expectation.roleKey,
        roleLabel: slot.expectation.roleLabel,
        requiredCount: slot.expectation.requiredCount,
        filledCount: slot.filledCount,
        state: slot.state,
        templateItemId: slot.expectation.id,
      });
    }
  }

  for (const item of legacyItems) {
    const seen = new Set<string>();
    const filled: CoverageAssignmentActual[] = [];
    for (const assignment of actuals) {
      if (seen.has(assignment.id)) continue;
      if (assignment.status !== "PLANNED" && assignment.status !== "ACTIVE") continue;
      if (assignment.roleKey !== item.roleKey) continue;
      if (item.unitId != null && assignment.unitId !== item.unitId) continue;
      seen.add(assignment.id);
      filled.push(assignment);
    }
    const filledCount = filled.length;
    const state = evaluateCoverageSlotState({
      plan,
      requiredCount: item.requiredCount,
      filledCount,
      hasCallDownRisk: filled.some((row) => row.hasCallDown === true),
    });
    incrementState(state);
    const unitName =
      item.unitId
        ? spaces.find((space) => space.unitId === item.unitId)?.unit?.name ?? "Unit"
        : "Any unit";
    rows.push({
      unitId: item.unitId,
      unitName,
      spaceId: null,
      spaceName: null,
      cycleStableKey: null,
      cycleLabel: null,
      roleKey: item.roleKey,
      roleLabel: item.roleLabel,
      requiredCount: item.requiredCount,
      filledCount,
      state,
      templateItemId: item.id,
    });
  }

  if (rows.length === 0 && items.length > 0) {
    notApplicable = 1;
  }

  return {
    planStatus: input.planStatus,
    covered,
    atRisk,
    uncovered,
    notYetAssigned,
    notConfirmed,
    notApplicable,
    rows,
    unassignedScheduledCount,
    callOffAffectedCount,
    engine: "canonical-oa",
  };

  function incrementState(state: CoverageState) {
    if (state === "COVERED") covered += 1;
    else if (state === "AT_RISK") atRisk += 1;
    else if (state === "UNCOVERED") uncovered += 1;
    else if (state === "NOT_YET_ASSIGNED") notYetAssigned += 1;
    else if (state === "NOT_CONFIRMED") notConfirmed += 1;
    else notApplicable += 1;
  }
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
