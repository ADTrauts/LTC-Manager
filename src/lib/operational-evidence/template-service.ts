import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  requireEvidenceManage,
  requireEvidencePublish,
  resolveEvidenceAuthority,
} from "./evidence-authority";
import {
  buildTemplatePresetDraft,
  isOperationalEvidencePresetKey,
  type OperationalEvidencePresetKey,
} from "./template-presets";
import type { TemplateDraftInput, TemplateFieldDraftInput } from "./types";
import { validateTemplate, validateTemplateForPublish } from "./validate-template";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

export type EvidenceActor = {
  userId: string | null;
  label?: string | null;
};

async function appendTemplateEvent(
  client: DbClient,
  input: {
    templateId: string;
    facilityId: string;
    departmentId: string;
    eventType: string;
    actor: EvidenceActor;
    detailJson?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await client.operationalTemplateEvent.create({
    data: {
      id: cuidLike(),
      templateId: input.templateId,
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
  const authority = await resolveEvidenceAuthority(session, facilityId, departmentId);
  requireEvidenceManage(authority);
  return authority;
}

async function nextVersionForStableKey(
  client: DbClient,
  departmentId: string,
  stableKey: string,
): Promise<number> {
  const latest = await client.operationalTemplate.findFirst({
    where: { departmentId, stableKey },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

function normalizeFieldKey(field: TemplateFieldDraftInput, index: number): string {
  const raw = field.fieldKey?.trim();
  if (raw) return raw;
  return `field_${index + 1}`;
}

function fieldCreateRows(fields: TemplateFieldDraftInput[]) {
  return fields.map((field, index) => ({
    id: cuidLike(),
    fieldKey: normalizeFieldKey(field, index),
    label: field.label.trim(),
    fieldType: field.fieldType,
    isRequired: field.fieldType === "OPTIONAL_COMMENT" ? false : (field.isRequired ?? true),
    displaySequence: field.displaySequence,
    helpText: field.helpText?.trim() || null,
    unitLabel: field.unitLabel?.trim() || null,
    minNumber: field.minNumber ?? null,
    maxNumber: field.maxNumber ?? null,
    allowedSelections: field.allowedSelections ?? [],
    correctiveActionTrigger: field.correctiveActionTrigger ?? false,
    correctiveActionRequired: field.correctiveActionRequired ?? false,
  }));
}

function applicabilityCreateRows(draft: TemplateDraftInput) {
  return (draft.applicabilities ?? []).map((row) => ({
    id: cuidLike(),
    kind: row.kind,
    assetId: row.assetId?.trim() || null,
    assetType: row.assetType?.trim() || null,
    spaceId: row.spaceId?.trim() || null,
    spaceType: row.spaceType ?? null,
    unitId: row.unitId?.trim() || null,
  }));
}

function scheduleCreateRows(draft: TemplateDraftInput) {
  return (draft.schedules ?? []).map((row) => ({
    id: cuidLike(),
    kind: row.kind,
    cycleStableKey: row.cycleStableKey?.trim() || null,
    windowStartLocal: row.windowStartLocal?.trim() || null,
    windowEndLocal: row.windowEndLocal?.trim() || null,
  }));
}

const templateDetailInclude = {
  fields: { orderBy: { displaySequence: "asc" as const } },
  applicabilities: true,
  schedules: true,
} as const;

export async function createDraft(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    draft: TemplateDraftInput;
    actor: EvidenceActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const validation = validateTemplate(input.draft);
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  const stableKey = input.draft.stableKey?.trim() || `tmpl_${cuidLike()}`;
  const version = await nextVersionForStableKey(client, input.departmentId, stableKey);

  const created = await client.operationalTemplate.create({
    data: {
      id: cuidLike(),
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey,
      version,
      name: input.draft.name.trim(),
      description: input.draft.description?.trim() || null,
      instructions: input.draft.instructions?.trim() || null,
      purposeType: input.draft.purposeType,
      status: "DRAFT",
      presetKey: input.draft.presetKey?.trim() || null,
      allowAdHoc: input.draft.allowAdHoc ?? false,
      createdByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
      fields: { create: fieldCreateRows(input.draft.fields) },
      applicabilities: { create: applicabilityCreateRows(input.draft) },
      schedules: { create: scheduleCreateRows(input.draft) },
    },
    include: templateDetailInclude,
  });

  await appendTemplateEvent(client, {
    templateId: created.id,
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
    templateId: string;
    draft: TemplateDraftInput;
    actor: EvidenceActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.operationalTemplate.findFirst({
    where: {
      id: input.templateId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Template not found.");

  // Published versions are immutable — create a successor draft version instead.
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

  const validation = validateTemplate(input.draft);
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  await client.operationalTemplateField.deleteMany({ where: { templateId: existing.id } });
  await client.operationalTemplateApplicability.deleteMany({ where: { templateId: existing.id } });
  await client.operationalTemplateSchedule.deleteMany({ where: { templateId: existing.id } });

  const updated = await client.operationalTemplate.update({
    where: { id: existing.id },
    data: {
      name: input.draft.name.trim(),
      description: input.draft.description?.trim() || null,
      instructions: input.draft.instructions?.trim() || null,
      purposeType: input.draft.purposeType,
      allowAdHoc: input.draft.allowAdHoc ?? existing.allowAdHoc,
      presetKey: input.draft.presetKey?.trim() || existing.presetKey,
      lastChangedByUserId: input.actor.userId,
      fields: { create: fieldCreateRows(input.draft.fields) },
      applicabilities: { create: applicabilityCreateRows(input.draft) },
      schedules: { create: scheduleCreateRows(input.draft) },
    },
    include: templateDetailInclude,
  });

  await appendTemplateEvent(client, {
    templateId: updated.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "UPDATED_DRAFT",
    actor: input.actor,
  });

  return updated;
}

export async function publishTemplate(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    templateId: string;
    actor: EvidenceActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolveEvidenceAuthority(session, input.facilityId, input.departmentId);
  requireEvidencePublish(authority);

  const existing = await client.operationalTemplate.findFirst({
    where: {
      id: input.templateId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: templateDetailInclude,
  });
  if (!existing) throw new Error("Template not found.");
  if (existing.status !== "DRAFT") {
    throw new Error("Only draft templates can be published.");
  }

  const draftForValidation: TemplateDraftInput = {
    name: existing.name,
    description: existing.description,
    instructions: existing.instructions,
    purposeType: existing.purposeType,
    allowAdHoc: existing.allowAdHoc,
    presetKey: existing.presetKey,
    fields: existing.fields.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.label,
      fieldType: f.fieldType,
      isRequired: f.isRequired,
      displaySequence: f.displaySequence,
      helpText: f.helpText,
      unitLabel: f.unitLabel,
      minNumber: f.minNumber,
      maxNumber: f.maxNumber,
      allowedSelections: f.allowedSelections,
      correctiveActionTrigger: f.correctiveActionTrigger,
      correctiveActionRequired: f.correctiveActionRequired,
    })),
    applicabilities: existing.applicabilities.map((a) => ({
      kind: a.kind,
      assetId: a.assetId,
      assetType: a.assetType,
      spaceId: a.spaceId,
      spaceType: a.spaceType,
      unitId: a.unitId,
    })),
    schedules: existing.schedules.map((s) => ({
      kind: s.kind,
      cycleStableKey: s.cycleStableKey,
      windowStartLocal: s.windowStartLocal,
      windowEndLocal: s.windowEndLocal,
    })),
  };

  const validation = validateTemplateForPublish(draftForValidation);
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  const priorPublished = await client.operationalTemplate.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      stableKey: existing.stableKey,
      status: "PUBLISHED",
      id: { not: existing.id },
    },
  });

  for (const prior of priorPublished) {
    await client.operationalTemplate.update({
      where: { id: prior.id },
      data: {
        status: "RETIRED",
        retiredAt: new Date(),
        lastChangedByUserId: input.actor.userId,
      },
    });
    await appendTemplateEvent(client, {
      templateId: prior.id,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      eventType: "RETIRED_ON_SUPERSEDE",
      actor: input.actor,
      detailJson: { supersededBy: existing.id },
    });
  }

  const published = await client.operationalTemplate.update({
    where: { id: existing.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedByUserId: input.actor.userId,
      lastChangedByUserId: input.actor.userId,
    },
    include: templateDetailInclude,
  });

  await appendTemplateEvent(client, {
    templateId: published.id,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "PUBLISHED",
    actor: input.actor,
  });

  return published;
}

export async function retireTemplate(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    templateId: string;
    actor: EvidenceActor;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  await assertManage(session, input.facilityId, input.departmentId);

  const existing = await client.operationalTemplate.findFirst({
    where: {
      id: input.templateId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
  });
  if (!existing) throw new Error("Template not found.");
  if (existing.status !== "PUBLISHED") {
    throw new Error("Only published templates can be retired.");
  }

  const retired = await client.operationalTemplate.update({
    where: { id: existing.id },
    data: {
      status: "RETIRED",
      retiredAt: new Date(),
      lastChangedByUserId: input.actor.userId,
    },
    include: templateDetailInclude,
  });

  await appendTemplateEvent(client, {
    templateId: retired.id,
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
    presetKey: OperationalEvidencePresetKey | string;
    actor: EvidenceActor;
    client?: DbClient;
  },
) {
  if (!isOperationalEvidencePresetKey(input.presetKey)) {
    throw new Error(`Unknown template preset "${input.presetKey}".`);
  }
  const draft = buildTemplatePresetDraft(input.presetKey);
  return createDraft(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    draft,
    actor: input.actor,
    client: input.client,
  });
}

export async function loadBuilderTemplates(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
}) {
  const authority = await resolveEvidenceAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canManage) {
    throw new Error(authority.reason ?? "Insufficient Operational Evidence authority.");
  }

  const rows = await prisma.operationalTemplate.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      fields: { select: { id: true }, take: 1 },
      _count: { select: { fields: true, applicabilities: true, schedules: true } },
    },
    orderBy: [{ name: "asc" }, { stableKey: "asc" }, { version: "desc" }],
  });

  return {
    templates: rows,
    canManage: authority.canManage,
    canPublish: authority.canPublish,
  };
}

export async function loadTemplateDetail(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  templateId: string;
}) {
  const authority = await resolveEvidenceAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canManage) {
    throw new Error(authority.reason ?? "Insufficient Operational Evidence authority.");
  }

  const template = await prisma.operationalTemplate.findFirst({
    where: {
      id: input.templateId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      ...templateDetailInclude,
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!template) throw new Error("Template not found.");

  return {
    template,
    canManage: authority.canManage,
    canPublish: authority.canPublish,
  };
}
