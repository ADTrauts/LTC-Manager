/**
 * Batch load Work Requirements for Job Flow / Supervisor Board (Phase 11A).
 */

import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { isDietaryWorkPlansEnabled } from "@/lib/feature-flags";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { isPlanFrontlineVisible } from "@/lib/scheduling/operational-assignments/assignment-plan";

import {
  resolveWorkRequirements,
  type AssetScopeForWorkResolve,
  type SpaceScopeForWorkResolve,
} from "./resolve-requirements";
import type {
  AcceptedEvidenceForWorkResolve,
  ConfirmedAssignmentForWorkResolve,
  ExistingWorkOccurrenceForResolve,
  PublishedWorkPlanForResolve,
  WorkRequirement,
} from "./types";

export async function loadPublishedWorkPlansForResolve(
  facilityId: string,
  departmentId: string,
): Promise<PublishedWorkPlanForResolve[]> {
  const rows = await prisma.departmentWorkPlan.findMany({
    where: { facilityId, departmentId, status: "PUBLISHED" },
    include: {
      items: { orderBy: { displaySequence: "asc" } },
      applicabilities: true,
    },
  });

  return rows.map((plan) => ({
    id: plan.id,
    stableKey: plan.stableKey,
    version: plan.version,
    name: plan.name,
    status: plan.status,
    effectiveStartDate: plan.effectiveStartDate,
    effectiveEndDate: plan.effectiveEndDate,
    weekdays: plan.weekdays,
    applicabilities: plan.applicabilities.map((a) => ({
      kind: a.kind,
      unitId: a.unitId,
      spaceId: a.spaceId,
      spaceType: a.spaceType,
      assetId: a.assetId,
      assetType: a.assetType,
    })),
    items: plan.items.map((item) => ({
      id: item.id,
      itemKey: item.itemKey,
      label: item.label,
      instructions: item.instructions,
      displaySequence: item.displaySequence,
      priority: item.priority,
      completionMode: item.completionMode,
      responsibilityMode: item.responsibilityMode,
      scheduleKind: item.scheduleKind,
      cycleStableKeys: item.cycleStableKeys,
      windowStartLocal: item.windowStartLocal,
      windowEndLocal: item.windowEndLocal,
      dueOffsetKind: item.dueOffsetKind,
      dueOffsetMinutes: item.dueOffsetMinutes,
      roleKeys: item.roleKeys,
      unitId: item.unitId,
      spaceId: item.spaceId,
      assetId: item.assetId,
      knowledgeArticleId: item.knowledgeArticleId,
      procedureTitleSnapshot: item.procedureTitleSnapshot,
      linkedTemplateStableKey: item.linkedTemplateStableKey,
      linkedTemplateId: item.linkedTemplateId,
      supervisorVisible: item.supervisorVisible,
    })),
  }));
}

export async function loadWorkScopeForUnit(input: {
  facilityId: string;
  unitId: string;
}): Promise<{ assets: AssetScopeForWorkResolve[]; spaces: SpaceScopeForWorkResolve[] }> {
  const [assets, spaces] = await Promise.all([
    prisma.asset.findMany({
      where: {
        unitId: input.unitId,
        unit: { facilityId: input.facilityId },
        status: { not: "RETIRED" },
      },
      select: { id: true, equipmentType: true, unitId: true },
    }),
    prisma.unitSpace.findMany({
      where: { unitId: input.unitId, facilityId: input.facilityId, isActive: true },
      select: { id: true, spaceType: true, unitId: true },
    }),
  ]);
  return {
    assets: assets.map((a) => ({
      id: a.id,
      equipmentType: a.equipmentType,
      unitId: a.unitId,
    })),
    spaces: spaces.map((s) => ({
      id: s.id,
      spaceType: s.spaceType,
      unitId: s.unitId,
    })),
  };
}

export async function loadExistingWorkOccurrencesForDate(input: {
  facilityId: string;
  departmentId: string;
  operationalDate: Date;
  unitId?: string | null;
}): Promise<ExistingWorkOccurrenceForResolve[]> {
  const rows = await prisma.departmentWorkOccurrence.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDate: input.operationalDate,
      ...(input.unitId ? { unitId: input.unitId } : {}),
    },
  });

  return rows.map((r) => ({
    id: r.id,
    occurrenceKey: r.occurrenceKey,
    status: r.status,
    assignedEmployeeId: r.assignedEmployeeId,
    completedByLabel: r.completedByLabel,
    completedAt: r.completedAt,
    evidenceRecordId: r.evidenceRecordId,
    sourceKind: r.sourceKind,
    workItemLabelSnapshot: r.workItemLabelSnapshot,
    instructionsSnapshot: r.instructionsSnapshot,
    priority: r.priority,
    unitId: r.unitId,
    spaceId: r.spaceId,
    assetId: r.assetId,
    dueAt: r.dueAt,
    windowStartLocal: r.windowStartLocal,
    windowEndLocal: r.windowEndLocal,
    cycleStableKey: r.cycleStableKey,
    knowledgeArticleId: r.knowledgeArticleId,
    procedureTitleSnapshot: r.procedureTitleSnapshot,
    workPlanId: r.workPlanId,
    workPlanStableKey: r.workPlanStableKey,
    workPlanVersion: r.workPlanVersion,
    workItemId: r.workItemId,
    workItemKey: r.workItemKey,
  }));
}

async function loadConfirmedAssignmentsForDate(input: {
  facilityId: string;
  departmentId: string;
  serviceDate: Date;
  unitId?: string | null;
}): Promise<ConfirmedAssignmentForWorkResolve[]> {
  const rows = await prisma.operationalAssignment.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.serviceDate,
      status: { in: ["PLANNED", "ACTIVE", "COMPLETED"] },
      ...(input.unitId ? { unitId: input.unitId } : {}),
    },
    select: {
      employeeId: true,
      unitId: true,
      roleKey: true,
      plan: { select: { status: true } },
    },
  });

  return rows
    .filter((r) => isPlanFrontlineVisible(r.plan?.status ?? null))
    .map((r) => ({
      employeeId: r.employeeId,
      unitId: r.unitId,
      roleKey: r.roleKey,
    }));
}

async function loadAcceptedEvidenceForDate(input: {
  facilityId: string;
  departmentId: string;
  operationalDate: Date;
  unitId?: string | null;
}): Promise<AcceptedEvidenceForWorkResolve[]> {
  const rows = await prisma.operationalEvidenceRecord.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDate: input.operationalDate,
      status: { in: ["COMPLETED", "COMPLETED_WITH_CORRECTIVE_ACTION"] },
      ...(input.unitId ? { unitId: input.unitId } : {}),
    },
    select: {
      id: true,
      templateStableKey: true,
      templateId: true,
      unitId: true,
      status: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    templateStableKey: r.templateStableKey,
    templateId: r.templateId,
    unitId: r.unitId,
    status: r.status,
  }));
}

export type ResolveUnitWorkRequirementsInput = {
  facilityId: string;
  departmentId: string;
  operationalDate: Date;
  operationalDateKey: string;
  now: Date;
  facilityTimezone?: string | null;
  unitId?: string;
  pendingOfflineKeys?: readonly string[];
  synchronizingKeys?: readonly string[];
  conflictKeys?: readonly string[];
};

export async function resolveUnitWorkRequirements(
  input: ResolveUnitWorkRequirementsInput,
): Promise<WorkRequirement[]> {
  if (!isDietaryWorkPlansEnabled()) return [];

  const serviceDate = facilityLocalDateToServiceDate(input.operationalDateKey);

  const [publishedPlans, scope, occurrences, assignments, evidence, cycles, units] =
    await Promise.all([
      loadPublishedWorkPlansForResolve(input.facilityId, input.departmentId),
      input.unitId
        ? loadWorkScopeForUnit({ facilityId: input.facilityId, unitId: input.unitId })
        : Promise.resolve({ assets: [], spaces: [] }),
      loadExistingWorkOccurrencesForDate({
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        operationalDate: input.operationalDate,
        unitId: input.unitId,
      }),
      loadConfirmedAssignmentsForDate({
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate,
        unitId: input.unitId,
      }),
      loadAcceptedEvidenceForDate({
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        operationalDate: input.operationalDate,
        unitId: input.unitId,
      }),
      loadPublishedCyclesForDate(
        input.facilityId,
        input.departmentId,
        input.operationalDateKey,
      ),
      prisma.unit.findMany({
        where: { facilityId: input.facilityId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

  const cycleWindows = cycles.flatMap((c) => {
    const window = resolveCycleWindowInstants({
      startLocal: c.startLocal,
      endLocal: c.endLocal,
      overnight: c.overnight,
      operationalDateKey: input.operationalDateKey,
      facilityTimezone: input.facilityTimezone,
    });
    if (!window) return [];
    return [
      {
        stableKey: c.stableKey,
        label: c.label,
        startLocal: c.startLocal,
        endLocal: c.endLocal,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
    ];
  });

  const unitNames = new Map(units.map((u) => [u.id, u.name]));

  return resolveWorkRequirements({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    operationalDateKey: input.operationalDateKey,
    now: input.now,
    facilityTimezone: input.facilityTimezone,
    unitId: input.unitId,
    assets: scope.assets,
    spaces: scope.spaces,
    publishedPlans,
    publishedCycles: cycleWindows,
    confirmedAssignments: assignments,
    existingOccurrences: occurrences,
    acceptedEvidence: evidence,
    unitNames,
    pendingOfflineKeys: input.pendingOfflineKeys,
    synchronizingKeys: input.synchronizingKeys,
    conflictKeys: input.conflictKeys,
  });
}

export type SupervisorWorkExceptionItem = {
  id: string;
  occurrenceKey: string;
  label: string;
  unitId: string | null;
  unitName: string | null;
  state: WorkRequirement["state"];
  priority: WorkRequirement["priority"];
  sourceKind: WorkRequirement["sourceKind"];
  assignedEmployeeId: string | null;
  dueAt: Date | null;
};

export async function loadSupervisorWorkExceptions(input: {
  facilityId: string;
  departmentId: string;
  operationalDate: Date;
  operationalDateKey: string;
  now: Date;
  facilityTimezone?: string | null;
}): Promise<SupervisorWorkExceptionItem[]> {
  if (!isDietaryWorkPlansEnabled()) return [];

  const requirements = await resolveUnitWorkRequirements(input);
  return requirements
    .filter(
      (r) =>
        r.state === "PAST_DUE_NOT_CONFIRMED" ||
        r.state === "CONFLICT_REVIEW" ||
        r.state === "CURRENT" ||
        r.state === "DUE" ||
        r.priority === "URGENT",
    )
    .map((r) => ({
      id: r.occurrenceId ?? r.occurrenceKey,
      occurrenceKey: r.occurrenceKey,
      label: r.label,
      unitId: r.unitId,
      unitName: r.unitName,
      state: r.state,
      priority: r.priority,
      sourceKind: r.sourceKind,
      assignedEmployeeId: r.assignedEmployeeId,
      dueAt: r.dueAt,
    }));
}
