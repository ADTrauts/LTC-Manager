/**
 * Department Work Plan Builder service — publish/version/retire (Phase 11A).
 * Mirrors operational-evidence/template-service.ts patterns.
 * Published versions are immutable; edits create successor drafts.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  requireWorkManage,
  requireWorkPublish,
  resolveWorkAuthority,
} from "./authority";
import {
  buildWorkPlanPresetDraft,
  isDepartmentWorkPresetKey,
  type DepartmentWorkPresetKey,
} from "./work-presets";
import type { WorkItemDraftInput, WorkPlanDraftInput } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

export type WorkActor = {
  userId: string | null;
  label?: string | null;
};

async function appendPlanEvent(
  client: DbClient,
  input: {
    workPlanId: string;
    facilityId: string;
    departmentId: string;
    eventType: string;
    actor: WorkActor;
    detailJson?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await client.departmentWorkPlanEvent.create({
    data: {
      id: cuidLike(),
      workPlanId: input.workPlanId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: input.eventType,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label ?? null,
      detailJson: input.detailJson ?? undefined,
    },
  });
}

async function assertManage(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
) {
  const authority = await resolveWorkAuthority(session, facilityId, departmentId);
  requireWorkManage(authority);
  return authority;
}

async function nextVersionForStableKey(
  client: DbClient,
  departmentId: string,
  stableKey: string,
): Promise<number> {
  const latest = await client.departmentWorkPlan.findFirst({
    where: { departmentId, stableKey },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

function normalizeItemKey(item: WorkItemDraftInput, index: number): string {
  const raw = item.itemKey?.trim();
  if (raw) return raw;
  const fromLabel = item.label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return fromLabel || `item_${index + 1}`;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const key = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new Error(`Invalid date "${value}". Use YYYY-MM-DD.`);
  }
  return new Date(`${key}T00:00:00.000Z`);
}

function validateDraft(draft: WorkPlanDraftInput): void {
  if (!draft.name?.trim()) {
    throw new Error("Work Plan name is required.");
  }
  if (!draft.items?.length) {
    throw new Error("Work Plan requires at least one Work Item.");
  }
  const keys = new Set<string>();
  for (let i = 0; i < draft.items.length; i++) {
    const item = draft.items[i]!;
    if (!item.label?.trim()) {
      throw new Error(`Work Item ${i + 1} requires a label.`);
    }
    const key = normalizeItemKey(item, i);
    if (keys.has(key)) {
      throw new Error(`Duplicate Work Item key "${key}".`);
    }
    keys.add(key);
    if (item.completionMode === "LINKED_EVIDENCE") {
      if (!item.linkedTemplateStableKey?.trim() && !item.linkedTemplateId?.trim()) {
        throw new Error(
          `Work Item "${item.label}" uses LINKED_EVIDENCE and requires a linked template.`,
        );
      }
    }
    if (item.responsibilityMode === "EACH_ASSIGNED_EMPLOYEE") {
      // Reserved structurally; allow in Builder draft for future EVS but warn via event only.
    }
  }
}

function itemCreateRows(items: WorkItemDraftInput[]) {
  return items.map((item, index) => ({
    id: cuidLike(),
    itemKey: normalizeItemKey(item, index),
    label: item.label.trim(),
    instructions: item.instructions?.trim() || null,
    displaySequence: item.displaySequence,
    priority: item.priority ?? "ROUTINE",
    completionMode: item.completionMode ?? "EXPLICIT_CONFIRMATION",
    responsibilityMode: item.responsibilityMode ?? "UNIT_SHARED",
    scheduleKind: item.scheduleKind ?? "OPERATIONAL_CYCLE",
    cycleStableKeys: item.cycleStableKeys ?? [],
    windowStartLocal: item.windowStartLocal?.trim() || null,
    windowEndLocal: item.windowEndLocal?.trim() || null,
    dueOffsetKind: item.dueOffsetKind ?? null,
    dueOffsetMinutes: item.dueOffsetMinutes ?? null,
    roleKeys: item.roleKeys ?? [],
    unitId: item.unitId?.trim() || null,
    spaceId: item.spaceId?.trim() || null,
    assetId: item.assetId?.trim() || null,
    knowledgeArticleId: item.knowledgeArticleId?.trim() || null,
    linkedTemplateStableKey: item.linkedTemplateStableKey?.trim() || null,
    linkedTemplateId: item.linkedTemplateId?.trim() || null,
    supervisorVisible: item.supervisorVisible ?? true,
  }));
}

function applicabilityCreateRows(draft: WorkPlanDraftInput) {
  return (draft.applicabilities ?? []).map((row) => ({
    id: cuidLike(),
    kind: row.kind,
    unitId: row.unitId?.trim() || null,
    spaceId: row.spaceId?.trim() || null,
    spaceType: row.spaceType ?? null,
    assetId: row.assetId?.trim() || null,
    assetType: row.assetType?.trim() || null,
  }));
}

const planDetailInclude = {
  items: { orderBy: { displaySequence: "asc" as const } },
  applicabilities: true,
} as const;

async function enrichProcedureTitles(
  client: DbClient,
  facilityId: string,
  items: ReturnType<typeof itemCreateRows>,
) {
  const articleIds = [
    ...new Set(
      items
        .map((i) => i.knowledgeArticleId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (articleIds.length === 0) return items;

  const articles = await client.knowledgeArticle.findMany({
    where: {
      id: { in: articleIds },
      facilityId,
      status: "PUBLISHED",
    },
    select: { id: true, title: true },
  });
  const byId = new Map(articles.map((a) => [a.id, a.title]));

  return items.map((item) => {
    if (!item.knowledgeArticleId) {
      return { ...item, procedureTitleSnapshot: null as string | null };
    }
    const title = byId.get(item.knowledgeArticleId);
    if (!title) {
      throw new Error(
        `Procedure "${item.knowledgeArticleId}" is not a published KnowledgeArticle in this facility.`,
      );
    }
    return { ...item, procedureTitleSnapshot: title };
  });
}

export async function createDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    draft: WorkPlanDraftInput;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);
  validateDraft(input.draft);

  const stableKey = input.draft.stableKey?.trim() || `work_${cuidLike()}`;
  const version = await nextVersionForStableKey(client, input.departmentId, stableKey);
  const itemRows = await enrichProcedureTitles(
    client,
    input.facilityId,
    itemCreateRows(input.draft.items),
  );

  const created = await client.departmentWorkPlan.create({
    data: {
      id: cuidLike(),
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey,
      version,
      name: input.draft.name.trim(),
      description: input.draft.description?.trim() || null,
      status: "DRAFT",
      presetKey: input.draft.presetKey?.trim() || null,
      effectiveStartDate: parseDateOnly(input.draft.effectiveStartDate),
      effectiveEndDate: parseDateOnly(input.draft.effectiveEndDate),
      weekdays: input.draft.weekdays ?? [],
      createdByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
      items: { create: itemRows },
      applicabilities: { create: applicabilityCreateRows(input.draft) },
    },
    include: planDetailInclude,
  });

  await appendPlanEvent(client, {
    workPlanId: created.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "CREATED_DRAFT",
    actor: input.actor,
    detailJson: { stableKey, version },
  });

  return created;
}

export async function updateDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    draft: WorkPlanDraftInput;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentWorkPlan.findFirst({
    where: {
      id: input.workPlanId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Work Plan not found.");

  if (existing.status === "PUBLISHED" || existing.status === "RETIRED") {
    return createDraft(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      actor: input.actor,
      client,
      draft: {
        ...input.draft,
        stableKey: existing.stableKey,
        presetKey: input.draft.presetKey ?? existing.presetKey,
      },
    });
  }

  validateDraft(input.draft);
  const itemRows = await enrichProcedureTitles(
    client,
    input.facilityId,
    itemCreateRows(input.draft.items),
  );

  await client.departmentWorkItem.deleteMany({ where: { workPlanId: existing.id } });
  await client.departmentWorkPlanApplicability.deleteMany({
    where: { workPlanId: existing.id },
  });

  const updated = await client.departmentWorkPlan.update({
    where: { id: existing.id },
    data: {
      name: input.draft.name.trim(),
      description: input.draft.description?.trim() || null,
      presetKey: input.draft.presetKey?.trim() || existing.presetKey,
      effectiveStartDate: parseDateOnly(input.draft.effectiveStartDate),
      effectiveEndDate: parseDateOnly(input.draft.effectiveEndDate),
      weekdays: input.draft.weekdays ?? [],
      lastChangedByUserId: input.actor.userId,
      items: { create: itemRows },
      applicabilities: { create: applicabilityCreateRows(input.draft) },
    },
    include: planDetailInclude,
  });

  await appendPlanEvent(client, {
    workPlanId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "UPDATED_DRAFT",
    actor: input.actor,
  });

  return updated;
}

export async function duplicateWorkPlan(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentWorkPlan.findFirst({
    where: {
      id: input.workPlanId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: planDetailInclude,
  });
  if (!existing) throw new Error("Work Plan not found.");

  return createDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    actor: input.actor,
    client,
    draft: {
      name: `${existing.name} (Copy)`,
      description: existing.description,
      presetKey: existing.presetKey,
      // New lineage — do not reuse stableKey.
      effectiveStartDate: existing.effectiveStartDate
        ? existing.effectiveStartDate.toISOString().slice(0, 10)
        : null,
      effectiveEndDate: existing.effectiveEndDate
        ? existing.effectiveEndDate.toISOString().slice(0, 10)
        : null,
      weekdays: existing.weekdays,
      applicabilities: existing.applicabilities.map((a) => ({
        kind: a.kind,
        unitId: a.unitId,
        spaceId: a.spaceId,
        spaceType: a.spaceType,
        assetId: a.assetId,
        assetType: a.assetType,
      })),
      items: existing.items.map((item) => ({
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
        linkedTemplateStableKey: item.linkedTemplateStableKey,
        linkedTemplateId: item.linkedTemplateId,
        supervisorVisible: item.supervisorVisible,
      })),
    },
  });
}

export async function publishWorkPlan(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveWorkAuthority(session, input.facilityId, input.departmentId);
  requireWorkPublish(authority);

  const existing = await client.departmentWorkPlan.findFirst({
    where: {
      id: input.workPlanId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: planDetailInclude,
  });
  if (!existing) throw new Error("Work Plan not found.");
  if (existing.status !== "DRAFT") {
    throw new Error("Only draft Work Plans can be published.");
  }
  if (existing.items.length === 0) {
    throw new Error("Cannot publish a Work Plan with no items.");
  }

  const priorPublished = await client.departmentWorkPlan.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey: existing.stableKey,
      status: "PUBLISHED",
      id: { not: existing.id },
    },
  });

  for (const prior of priorPublished) {
    await client.departmentWorkPlan.update({
      where: { id: prior.id },
      data: {
        status: "RETIRED",
        retiredAt: new Date(),
        retiredByUserId: input.actor.userId,
        lastChangedByUserId: input.actor.userId,
      },
    });
    await appendPlanEvent(client, {
      workPlanId: prior.id,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: "RETIRED_ON_SUPERSEDE",
      actor: input.actor,
      detailJson: { supersededBy: existing.id },
    });
  }

  const published = await client.departmentWorkPlan.update({
    where: { id: existing.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
    },
    include: planDetailInclude,
  });

  await appendPlanEvent(client, {
    workPlanId: published.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "PUBLISHED",
    actor: input.actor,
  });

  return published;
}

export async function createSuccessorDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentWorkPlan.findFirst({
    where: {
      id: input.workPlanId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: planDetailInclude,
  });
  if (!existing) throw new Error("Work Plan not found.");
  if (existing.status !== "PUBLISHED" && existing.status !== "RETIRED") {
    throw new Error("Successor drafts are created from published or retired plans.");
  }

  return createDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    actor: input.actor,
    client,
    draft: {
      name: existing.name,
      description: existing.description,
      stableKey: existing.stableKey,
      presetKey: existing.presetKey,
      effectiveStartDate: existing.effectiveStartDate
        ? existing.effectiveStartDate.toISOString().slice(0, 10)
        : null,
      effectiveEndDate: existing.effectiveEndDate
        ? existing.effectiveEndDate.toISOString().slice(0, 10)
        : null,
      weekdays: existing.weekdays,
      applicabilities: existing.applicabilities.map((a) => ({
        kind: a.kind,
        unitId: a.unitId,
        spaceId: a.spaceId,
        spaceType: a.spaceType,
        assetId: a.assetId,
        assetType: a.assetType,
      })),
      items: existing.items.map((item) => ({
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
        linkedTemplateStableKey: item.linkedTemplateStableKey,
        linkedTemplateId: item.linkedTemplateId,
        supervisorVisible: item.supervisorVisible,
      })),
    },
  });
}

export async function retireWorkPlan(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    workPlanId: string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.departmentWorkPlan.findFirst({
    where: {
      id: input.workPlanId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Work Plan not found.");
  if (existing.status !== "PUBLISHED") {
    throw new Error("Only published Work Plans can be retired.");
  }

  const retired = await client.departmentWorkPlan.update({
    where: { id: existing.id },
    data: {
      status: "RETIRED",
      retiredAt: new Date(),
      retiredByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
    },
    include: planDetailInclude,
  });

  await appendPlanEvent(client, {
    workPlanId: retired.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "RETIRED",
    actor: input.actor,
  });

  return retired;
}

export async function createDraftFromPreset(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    presetKey: DepartmentWorkPresetKey | string;
    actor: WorkActor;
    client?: DbClient;
  },
) {
  if (!isDepartmentWorkPresetKey(input.presetKey)) {
    throw new Error(`Unknown Work Plan preset "${input.presetKey}".`);
  }
  const draft = buildWorkPlanPresetDraft(input.presetKey);
  return createDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    draft,
    actor: input.actor,
    client: input.client,
  });
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

  const rows = await prisma.departmentWorkPlan.findMany({
    where: {
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
    },
    include: planDetailInclude,
    orderBy: [{ name: "asc" }, { stableKey: "asc" }, { version: "desc" }],
  });

  return rows.filter((plan) => {
    if (!plan.weekdays.length) return true;
    return plan.weekdays.includes(weekday);
  });
}

export async function loadBuilderWorkPlans(input: {
  session: AppJwtPayload;
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

  const rows = await prisma.departmentWorkPlan.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
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
  session: AppJwtPayload;
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
  session: AppJwtPayload;
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
    confirmedAssignments: input.unitId
      ? [{ employeeId: "preview", unitId: input.unitId, roleKey: null }]
      : [{ employeeId: "preview", unitId: "preview-unit", roleKey: null }],
    existingOccurrences: [],
    unitNames: input.unitId
      ? new Map([[input.unitId, "Preview unit"]])
      : new Map([["preview-unit", "Preview unit"]]),
  });

  return { plan: detail.plan, requirements, canManage: detail.canManage };
}
