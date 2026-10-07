/**
 * Batch load Work Requirements for Job Flow / Supervisor Board (Phase 11A).
 * Candidate locations come from department responsibility + cycle participation,
 * not from confirmed Operational Assignments.
 */

import { isDepartmentEngineEnabledForFacility } from "@/lib/department-operations";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import {
  cycleUsesOperationalTypeParticipation,
  resolveWorkCycleRoomParticipation,
} from "@/lib/operational-cycles/cycle-applicability";
import {
  buildCyclesByStableKey,
  effectiveCycleSpaceIds,
} from "@/lib/operational-cycles/effective-cycle-spaces";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { loadSpaceOperationalTypeAssignments } from "@/lib/operational-cycles/load-operational-type-targets";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { assetNotRetiredWhere } from "@/lib/asset-operations/ownership";
import { isPlanFrontlineVisible } from "@/lib/scheduling/operational-assignments/assignment-plan";

import {
  isWorkPlanEffectiveOnDate,
  resolveWorkRequirements,
  type AssetScopeForWorkResolve,
  type SpaceScopeForWorkResolve,
} from "./resolve-requirements";
import type {
  AcceptedEvidenceForWorkResolve,
  ConfirmedAssignmentForWorkResolve,
  ExistingWorkOccurrenceForResolve,
  PublishedCycleWindowForWorkResolve,
  PublishedWorkPlanForResolve,
  WorkRequirement,
} from "./types";

function toPublishedWorkPlanForResolve(plan: {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  status: PublishedWorkPlanForResolve["status"];
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
  weekdays: number[];
  applicabilities: PublishedWorkPlanForResolve["applicabilities"];
  items: PublishedWorkPlanForResolve["items"];
}): PublishedWorkPlanForResolve {
  return {
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
      operationalTypeKey: a.operationalTypeKey ?? null,
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
  };
}

export async function loadPublishedWorkPlansForResolve(
  facilityId: string,
  departmentId: string,
  operationalDateKey?: string,
): Promise<PublishedWorkPlanForResolve[]> {
  const rows = await prisma.departmentWorkPlan.findMany({
    where: { facilityId, departmentId, status: "PUBLISHED" },
    include: {
      items: { orderBy: { displaySequence: "asc" } },
      applicabilities: true,
    },
  });

  const mapped = rows.map((plan) => toPublishedWorkPlanForResolve(plan));
  if (!operationalDateKey) return mapped;
  return mapped.filter((plan) => isWorkPlanEffectiveOnDate(plan, operationalDateKey));
}

function inheritedCycle(
  cycle: OperationalCycleDefinition,
  byKey: ReadonlyMap<string, OperationalCycleDefinition>,
): OperationalCycleDefinition | null {
  if (!cycle.locationInheritFromParent || !cycle.parentStableKey) return null;
  return byKey.get(cycle.parentStableKey) ?? null;
}

function cycleLocationMode(
  cycle: OperationalCycleDefinition,
  byKey: ReadonlyMap<string, OperationalCycleDefinition>,
): OperationalCycleDefinition["locationMode"] {
  const parent = inheritedCycle(cycle, byKey);
  if (parent) return cycleLocationMode(parent, byKey);
  return cycle.locationMode;
}

function cycleExplicitUnitIds(
  cycle: OperationalCycleDefinition,
  byKey: ReadonlyMap<string, OperationalCycleDefinition>,
): string[] {
  const parent = inheritedCycle(cycle, byKey);
  if (parent) return cycleExplicitUnitIds(parent, byKey);
  return [...cycle.unitIds];
}

async function attachRuntimeOperationalTypeKeys(input: {
  facilityId: string;
  departmentId: string;
  spaces: Array<{ id: string; spaceType: string; unitId: string | null }>;
}): Promise<SpaceScopeForWorkResolve[]> {
  if (!input.spaces.length) {
    return [];
  }
  const assignments = await loadSpaceOperationalTypeAssignments({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    spaceIds: input.spaces.map((space) => space.id),
    perspective: "runtime",
  });
  return input.spaces.map((space) => ({
    id: space.id,
    spaceType: space.spaceType,
    unitId: space.unitId,
    operationalTypeKey: assignments.get(space.id)?.key ?? null,
  }));
}

export async function loadWorkScopeForUnit(input: {
  facilityId: string;
  unitId: string;
  departmentId?: string;
}): Promise<{ assets: AssetScopeForWorkResolve[]; spaces: SpaceScopeForWorkResolve[] }> {
  const [assets, spaces] = await Promise.all([
    prisma.asset.findMany({
      where: {
        unitId: input.unitId,
        unit: { facilityId: input.facilityId },
        ...assetNotRetiredWhere(),
      },
      select: { id: true, equipmentType: true, unitId: true },
    }),
    prisma.unitSpace.findMany({
      where: { unitId: input.unitId, facilityId: input.facilityId, isActive: true },
      select: { id: true, spaceType: true, unitId: true },
    }),
  ]);
  const scopedSpaces = input.departmentId
    ? await attachRuntimeOperationalTypeKeys({
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        spaces,
      })
    : spaces.map((s) => ({
        id: s.id,
        spaceType: s.spaceType,
        unitId: s.unitId,
        operationalTypeKey: null,
      }));
  return {
    assets: assets.map((a) => ({
      id: a.id,
      equipmentType: a.equipmentType,
      unitId: a.unitId,
    })),
    spaces: scopedSpaces,
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

async function departmentWorkPlansEnabledFor(
  facilityId: string,
  departmentId: string,
): Promise<boolean> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId },
    select: { key: true },
  });
  return isDepartmentEngineEnabledForFacility(
    facilityId,
    "workPlans",
    department?.key,
  );
}

export async function resolveUnitWorkRequirements(
  input: ResolveUnitWorkRequirementsInput,
): Promise<WorkRequirement[]> {
  if (!(await departmentWorkPlansEnabledFor(input.facilityId, input.departmentId))) {
    return [];
  }

  const serviceDate = facilityLocalDateToServiceDate(input.operationalDateKey);

  const [publishedPlans, occurrences, assignments, evidence, cycles, responsibleUnits] =
    await Promise.all([
      loadPublishedWorkPlansForResolve(
        input.facilityId,
        input.departmentId,
        input.operationalDateKey,
      ),
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
        where: {
          facilityId: input.facilityId,
          isActive: true,
          departmentResponsibilities: { some: { departmentId: input.departmentId } },
        },
        select: { id: true, name: true },
      }),
    ]);

  const candidateUnitIds = responsibleUnits.map((unit) => unit.id);
  const cyclesByKey = buildCyclesByStableKey(cycles);
  const cyclesUseOperationalTypes = cycles.some((cycle) =>
    cycleUsesOperationalTypeParticipation(cycle, cyclesByKey),
  );
  const explicitSpaceIds = new Set<string>();
  for (const cycle of cycles) {
    for (const spaceId of effectiveCycleSpaceIds(cycle, cyclesByKey)) {
      explicitSpaceIds.add(spaceId);
    }
  }

  const needsDepartmentSpaces =
    publishedPlans.some((plan) =>
      plan.applicabilities.some(
        (app) =>
          app.kind === "SPACE_TYPE" ||
          app.kind === "SPECIFIC_SPACE" ||
          app.kind === "OPERATIONAL_TYPE",
      ),
    ) ||
    explicitSpaceIds.size > 0 ||
    cyclesUseOperationalTypes;

  const spaceWhere = input.unitId
    ? { facilityId: input.facilityId, isActive: true, unitId: input.unitId }
    : needsDepartmentSpaces && candidateUnitIds.length
      ? { facilityId: input.facilityId, isActive: true, unitId: { in: candidateUnitIds } }
      : null;

  const [loadedSpaces, assets] = await Promise.all([
    spaceWhere
      ? prisma.unitSpace.findMany({
          where: spaceWhere,
          select: { id: true, spaceType: true, unitId: true },
        })
      : Promise.resolve([]),
    input.unitId
      ? prisma.asset.findMany({
          where: {
            unitId: input.unitId,
            unit: { facilityId: input.facilityId },
            ...assetNotRetiredWhere(),
          },
          select: { id: true, equipmentType: true, unitId: true },
        })
      : Promise.resolve([]),
  ]);
  const spaces = [...loadedSpaces];

  const spaceUnitById = new Map(spaces.map((space) => [space.id, space.unitId]));
  if (explicitSpaceIds.size) {
    const missing = [...explicitSpaceIds].filter((id) => !spaceUnitById.has(id));
    if (missing.length) {
      const extra = await prisma.unitSpace.findMany({
        where: { facilityId: input.facilityId, id: { in: missing } },
        select: { id: true, spaceType: true, unitId: true },
      });
      for (const space of extra) {
        spaceUnitById.set(space.id, space.unitId);
        spaces.push(space);
      }
    }
  }

  const unitNames = new Map(responsibleUnits.map((unit) => [unit.id, unit.name]));

  const needsOperationalTypes = publishedPlans.some((plan) =>
    plan.applicabilities.some((app) => app.kind === "OPERATIONAL_TYPE"),
  );
  const spacesForResolve =
    needsOperationalTypes || cyclesUseOperationalTypes
      ? await attachRuntimeOperationalTypeKeys({
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          spaces,
        })
      : spaces.map((s) => ({
          id: s.id,
          spaceType: s.spaceType,
          unitId: s.unitId,
          operationalTypeKey: null as string | null,
        }));

  const cycleWindows: PublishedCycleWindowForWorkResolve[] = [];
  for (const cycle of cycles) {
    if (!cycle.startLocal || !cycle.endLocal) continue;
    const window = resolveCycleWindowInstants({
      startLocal: cycle.startLocal,
      endLocal: cycle.endLocal,
      overnight: cycle.overnight,
      operationalDateKey: input.operationalDateKey,
      facilityTimezone: input.facilityTimezone,
    });
    if (!window) continue;
    const participation = resolveWorkCycleRoomParticipation(cycle, cyclesByKey, spacesForResolve);
    const participatingSpaceIds = participation.spaceIds;
    const participatingUnitIds = new Set(cycleExplicitUnitIds(cycle, cyclesByKey));
    for (const spaceId of participatingSpaceIds) {
      const unitId = spaceUnitById.get(spaceId);
      if (unitId) participatingUnitIds.add(unitId);
    }
    cycleWindows.push({
      stableKey: cycle.stableKey,
      label: cycle.label,
      startLocal: cycle.startLocal,
      endLocal: cycle.endLocal,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      departmentWide: cycleLocationMode(cycle, cyclesByKey) === "ALL_DEPARTMENT_UNITS",
      participatingUnitIds: [...participatingUnitIds],
      participatingSpaceIds,
      roomSetClosed: participation.roomSetClosed,
    });
  }

  return resolveWorkRequirements({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    operationalDateKey: input.operationalDateKey,
    now: input.now,
    facilityTimezone: input.facilityTimezone,
    unitId: input.unitId,
    assets: assets.map((a) => ({
      id: a.id,
      equipmentType: a.equipmentType,
      unitId: a.unitId,
    })),
    spaces: spacesForResolve,
    publishedPlans,
    publishedCycles: cycleWindows,
    candidateUnitIds,
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
