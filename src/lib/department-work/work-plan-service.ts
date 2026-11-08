/**
 * Department Work Plan service.
 * Phase 2B: plan authoring/publish writers are retired (`GENERIC_WORK_AUTHORING_RETIRED`).
 * Readers (`loadPublishedWorkPlansForDate`, builder loads) remain for Job Flow until Phase 2C.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { operationPeriodWhere, withOperatorPeriod } from "@/lib/department-authority/operator-period";
import { prisma } from "@/lib/prisma";

import { resolveWorkAuthority } from "./authority";
import type { DepartmentWorkPresetKey } from "./work-presets";
import type { WorkPlanDraftInput } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Generic Department Work Plan authoring is retired (Phase 2B / ARR-002, ARR-015).
 * Job Flow may still read published plans until Phase 2C. Occurrence completion stays.
 */
export const GENERIC_WORK_AUTHORING_RETIRED =
  "Generic Work Plan authoring is retired. Configure Operating Rhythm, Records, Coverage, and Plant Work Orders or Preventive Maintenance instead.";

export type WorkActor = {
  userId: string | null;
  label?: string | null;
};

const planDetailInclude = {
  items: { orderBy: { displaySequence: "asc" as const } },
  applicabilities: true,
} as const;

export async function createDraft(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    draft: WorkPlanDraftInput;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

export async function updateDraft(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    draft: WorkPlanDraftInput;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

export async function duplicateWorkPlan(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

export async function publishWorkPlan(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

export async function createSuccessorDraft(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

export async function retireWorkPlan(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

export async function createDraftFromPreset(
  _session: FacilitySession,
  _input: {
    facilityId: string;
    departmentId: string;
    presetKey: DepartmentWorkPresetKey | string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  throw new Error(GENERIC_WORK_AUTHORING_RETIRED);
}

/**
 * Published Work Plans effective on an operational date (facility-local YYYY-MM-DD).
 * Drafts never appear. Retired plans are excluded. Weekday empty = all days.
 */
export async function loadPublishedWorkPlansForDate(input: {
  facilityId: string;
  departmentId: string;
  operationalDate: string;
}) {
  const dateKey = input.operationalDate.slice(0, 10);
  const operationalDate = new Date(`${dateKey}T00:00:00.000Z`);
  const weekday = operationalDate.getUTCDay();

  const publishedWhere: Prisma.DepartmentWorkPlanWhereInput = {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    status: "PUBLISHED",
    AND: [
      {
        OR: [{ effectiveStartDate: null }, { effectiveStartDate: { lte: operationalDate } }],
      },
      {
        OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: operationalDate } }],
      },
    ],
  };
  const rows = await prisma.departmentWorkPlan.findMany({
    where: withOperatorPeriod(
      publishedWhere,
      await operationPeriodWhere(prisma, { facilityId: input.facilityId, departmentId: input.departmentId }),
    ),
    include: planDetailInclude,
    orderBy: [{ name: "asc" }, { stableKey: "asc" }, { version: "desc" }],
  });

  return rows.filter((plan) => {
    if (!plan.weekdays.length) return true;
    return plan.weekdays.includes(weekday);
  });
}

export async function loadBuilderWorkPlans(input: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
}) {
  const authority = await resolveWorkAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canManage) {
    throw new Error(authority.reason ?? "Insufficient Department Work authority.");
  }

  const builderWhere: Prisma.DepartmentWorkPlanWhereInput = {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  };
  const rows = await prisma.departmentWorkPlan.findMany({
    where: withOperatorPeriod(
      builderWhere,
      await operationPeriodWhere(prisma, { facilityId: input.facilityId, departmentId: input.departmentId }),
    ),
    include: {
      ...planDetailInclude,
      _count: { select: { items: true } },
    },
    orderBy: [{ name: "asc" }, { stableKey: "asc" }, { version: "desc" }],
  });

  return {
    plans: rows,
    canManage: authority.canManage,
    canPublish: authority.canPublish,
  };
}

export async function loadWorkPlanDetail(input: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
  workPlanId: string;
}) {
  const authority = await resolveWorkAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canManage) {
    throw new Error(authority.reason ?? "Insufficient Department Work authority.");
  }

  const plan = await prisma.departmentWorkPlan.findFirst({
    where: {
      id: input.workPlanId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      ...planDetailInclude,
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!plan) throw new Error("Work Plan not found.");

  return {
    plan,
    canManage: authority.canManage,
    canPublish: authority.canPublish,
  };
}

/**
 * Preview derived requirements for a draft or published plan without publishing.
 * Uses the same resolve path as Runtime when a published snapshot is provided.
 */
export async function previewWorkPlanRequirements(input: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
  workPlanId: string;
  operationalDate: string;
  unitId?: string | null;
}) {
  const detail = await loadWorkPlanDetail({
    session: input.session,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    workPlanId: input.workPlanId,
  });

  const { resolveWorkRequirements } = await import("./resolve-requirements");
  const plan = detail.plan;

  const publishedShape = {
    id: plan.id,
    stableKey: plan.stableKey,
    version: plan.version,
    name: plan.name,
    status: plan.status === "DRAFT" ? ("PUBLISHED" as const) : plan.status,
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
      operationalTypeKey: a.operationalTypeKey,
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

  const requirements = resolveWorkRequirements({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    operationalDateKey: input.operationalDate.slice(0, 10),
    now: new Date(),
    unitId: input.unitId ?? null,
    publishedPlans: [
      {
        id: publishedShape.id,
        stableKey: publishedShape.stableKey,
        version: publishedShape.version,
        name: publishedShape.name,
        status: "PUBLISHED" as const,
        effectiveStartDate: null,
        effectiveEndDate: null,
        weekdays: [],
        applicabilities: publishedShape.applicabilities,
        items: publishedShape.items,
      },
    ],
    publishedCycles: [],
    candidateUnitIds: input.unitId ? [input.unitId] : ["preview-unit"],
    confirmedAssignments: [],
    existingOccurrences: [],
    unitNames: input.unitId
      ? new Map([[input.unitId, "Preview unit"]])
      : new Map([["preview-unit", "Preview unit"]]),
  });

  return { plan: detail.plan, requirements, canManage: detail.canManage };
}
