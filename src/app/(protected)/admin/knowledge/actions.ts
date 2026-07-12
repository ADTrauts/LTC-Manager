"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { KnowledgeArticleStatus } from "@prisma/client";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  knowledgeArticleFormSchema,
  parseIdListJson,
  validatePublishableArticle,
} from "@/lib/knowledge/article-schema";
import {
  dedupeIds,
  isDepartmentCompatibleLink,
  isUnitCompatibleWithArticleDepartment,
  objectLinkCompatibilityError,
} from "@/lib/knowledge/object-links";
import { prisma } from "@/lib/prisma";

export type KnowledgeActionResult =
  | { ok: true; message: string; articleId?: string }
  | { ok: false; message: string };

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateKnowledgeViews() {
  revalidatePath("/admin/knowledge");
  revalidatePath("/admin");
}

function userIdForSession(session: Awaited<ReturnType<typeof requireFacilitySession>>) {
  return session.authKind === "user" ? session.uid : undefined;
}

async function assertScopedDepartment(facilityId: string, departmentId: string | null | undefined) {
  if (!departmentId) return null;
  const dept = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, name: true },
  });
  if (!dept) throw new Error("Department not found.");
  return dept;
}

async function validateAndLoadObjectLinks(
  facilityId: string,
  articleDepartmentId: string | null,
  articleDepartmentName: string | null,
  unitIds: string[],
  assetIds: string[],
  logTemplateIds: string[],
  inspectionDefinitionIds: string[],
) {
  const units = unitIds.length
    ? await prisma.unit.findMany({
        where: { id: { in: unitIds }, facilityId, isActive: true },
        select: {
          id: true,
          name: true,
          departmentResponsibilities: { select: { departmentId: true } },
        },
      })
    : [];

  if (units.length !== unitIds.length) {
    throw new Error("One or more locations were not found in this facility.");
  }

  for (const unit of units) {
    if (
      !isUnitCompatibleWithArticleDepartment(articleDepartmentId, {
        departmentIds: unit.departmentResponsibilities.map((row) => row.departmentId),
      })
    ) {
      throw new Error(objectLinkCompatibilityError(`Location “${unit.name}”`, articleDepartmentName));
    }
  }

  const assets = assetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: assetIds }, unit: { facilityId } },
        select: { id: true, name: true, departmentId: true },
      })
    : [];

  if (assets.length !== assetIds.length) {
    throw new Error("One or more assets were not found in this facility.");
  }

  for (const asset of assets) {
    if (!isDepartmentCompatibleLink(articleDepartmentId, asset.departmentId)) {
      throw new Error(objectLinkCompatibilityError(`Asset “${asset.name}”`, articleDepartmentName));
    }
  }

  const logTemplates = logTemplateIds.length
    ? await prisma.logTemplate.findMany({
        where: { id: { in: logTemplateIds }, facilityId, isActive: true },
        select: { id: true, name: true, departmentId: true },
      })
    : [];

  if (logTemplates.length !== logTemplateIds.length) {
    throw new Error("One or more log templates were not found in this facility.");
  }

  for (const template of logTemplates) {
    if (!isDepartmentCompatibleLink(articleDepartmentId, template.departmentId)) {
      throw new Error(
        objectLinkCompatibilityError(`Log template “${template.name}”`, articleDepartmentName),
      );
    }
  }

  const definitions = inspectionDefinitionIds.length
    ? await prisma.inspectionDefinition.findMany({
        where: { id: { in: inspectionDefinitionIds }, facilityId, isActive: true },
        select: { id: true, name: true, departmentId: true },
      })
    : [];

  if (definitions.length !== inspectionDefinitionIds.length) {
    throw new Error("One or more inspection definitions were not found in this facility.");
  }

  for (const definition of definitions) {
    if (!isDepartmentCompatibleLink(articleDepartmentId, definition.departmentId)) {
      throw new Error(
        objectLinkCompatibilityError(`Inspection “${definition.name}”`, articleDepartmentName),
      );
    }
  }

  return { units, assets, logTemplates, definitions };
}

async function syncArticleObjectLinks(
  articleId: string,
  unitIds: string[],
  assetIds: string[],
  logTemplateIds: string[],
  inspectionDefinitionIds: string[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.knowledgeArticleUnit.deleteMany({ where: { articleId } });
    await tx.knowledgeArticleAsset.deleteMany({ where: { articleId } });
    await tx.knowledgeArticleLogTemplate.deleteMany({ where: { articleId } });
    await tx.knowledgeArticleInspectionDefinition.deleteMany({ where: { articleId } });

    if (unitIds.length) {
      await tx.knowledgeArticleUnit.createMany({
        data: unitIds.map((unitId) => ({ articleId, unitId })),
        skipDuplicates: true,
      });
    }
    if (assetIds.length) {
      await tx.knowledgeArticleAsset.createMany({
        data: assetIds.map((assetId) => ({ articleId, assetId })),
        skipDuplicates: true,
      });
    }
    if (logTemplateIds.length) {
      await tx.knowledgeArticleLogTemplate.createMany({
        data: logTemplateIds.map((logTemplateId) => ({ articleId, logTemplateId })),
        skipDuplicates: true,
      });
    }
    if (inspectionDefinitionIds.length) {
      await tx.knowledgeArticleInspectionDefinition.createMany({
        data: inspectionDefinitionIds.map((inspectionDefinitionId) => ({
          articleId,
          inspectionDefinitionId,
        })),
        skipDuplicates: true,
      });
    }
  });
}

function parseArticleForm(formData: FormData) {
  return knowledgeArticleFormSchema.parse({
    articleId: toOptional(formData.get("articleId")),
    title: formData.get("title"),
    summary: toOptional(formData.get("summary")) ?? null,
    body: formData.get("body"),
    category: formData.get("category"),
    sourceType: toOptional(formData.get("sourceType")) ?? "MANUAL",
    departmentId: toOptional(formData.get("departmentId")) ?? null,
    status: toOptional(formData.get("status")),
    unitIds: dedupeIds(parseIdListJson(formData.get("unitIdsJson"))),
    assetIds: dedupeIds(parseIdListJson(formData.get("assetIdsJson"))),
    logTemplateIds: dedupeIds(parseIdListJson(formData.get("logTemplateIdsJson"))),
    inspectionDefinitionIds: dedupeIds(parseIdListJson(formData.get("inspectionDefinitionIdsJson"))),
  });
}

export async function upsertKnowledgeArticleAction(
  formData: FormData,
): Promise<KnowledgeActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  let parsed;
  try {
    parsed = parseArticleForm(formData);
  } catch {
    return { ok: false, message: "Check the article fields and try again." };
  }

  const dept = await assertScopedDepartment(session.facilityId, parsed.departmentId);
  const articleDepartmentId = dept?.id ?? null;
  const articleDepartmentName = dept?.name ?? null;

  try {
    await validateAndLoadObjectLinks(
      session.facilityId,
      articleDepartmentId,
      articleDepartmentName,
      parsed.unitIds,
      parsed.assetIds,
      parsed.logTemplateIds,
      parsed.inspectionDefinitionIds,
    );
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Invalid object links.",
    };
  }

  const userId = userIdForSession(session);
  const nextStatus = parsed.status ?? KnowledgeArticleStatus.DRAFT;

  if (nextStatus === KnowledgeArticleStatus.PUBLISHED) {
    const publishCheck = validatePublishableArticle(parsed);
    if (!publishCheck.ok) return publishCheck;
  }

  if (parsed.articleId) {
    const existing = await prisma.knowledgeArticle.findFirst({
      where: { id: parsed.articleId, facilityId: session.facilityId },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!existing) {
      return { ok: false, message: "Article not found." };
    }

    const publishedAt =
      nextStatus === KnowledgeArticleStatus.PUBLISHED
        ? existing.publishedAt ?? new Date()
        : nextStatus === KnowledgeArticleStatus.DRAFT
          ? null
          : existing.publishedAt;

    const archivedAt =
      nextStatus === KnowledgeArticleStatus.ARCHIVED
        ? new Date()
        : nextStatus === KnowledgeArticleStatus.DRAFT ||
            nextStatus === KnowledgeArticleStatus.PUBLISHED
          ? null
          : undefined;

    await prisma.knowledgeArticle.update({
      where: { id: existing.id },
      data: {
        title: parsed.title,
        summary: parsed.summary,
        body: parsed.body,
        category: parsed.category,
        sourceType: parsed.sourceType,
        departmentId: articleDepartmentId,
        status: nextStatus,
        updatedByUserId: userId,
        publishedAt,
        ...(archivedAt !== undefined ? { archivedAt } : {}),
      },
    });

    await syncArticleObjectLinks(
      existing.id,
      parsed.unitIds,
      parsed.assetIds,
      parsed.logTemplateIds,
      parsed.inspectionDefinitionIds,
    );

    revalidateKnowledgeViews();
    redirect(`/admin/knowledge?saved=${existing.id}`);
  }

  const created = await prisma.knowledgeArticle.create({
    data: {
      facilityId: session.facilityId,
      title: parsed.title,
      summary: parsed.summary,
      body: parsed.body,
      category: parsed.category,
      sourceType: parsed.sourceType,
      departmentId: articleDepartmentId,
      status: nextStatus,
      createdByUserId: userId,
      updatedByUserId: userId,
      publishedAt: nextStatus === KnowledgeArticleStatus.PUBLISHED ? new Date() : null,
      archivedAt: nextStatus === KnowledgeArticleStatus.ARCHIVED ? new Date() : null,
    },
    select: { id: true },
  });

  await syncArticleObjectLinks(
    created.id,
    parsed.unitIds,
    parsed.assetIds,
    parsed.logTemplateIds,
    parsed.inspectionDefinitionIds,
  );

  revalidateKnowledgeViews();
  redirect(`/admin/knowledge?saved=${created.id}`);
}

export async function publishKnowledgeArticleAction(
  formData: FormData,
): Promise<KnowledgeActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const articleId = toOptional(formData.get("articleId"));
  if (!articleId) return { ok: false, message: "Article not found." };

  const article = await prisma.knowledgeArticle.findFirst({
    where: { id: articleId, facilityId: session.facilityId },
    select: { id: true, title: true, body: true, status: true },
  });
  if (!article) return { ok: false, message: "Article not found." };

  const publishCheck = validatePublishableArticle(article);
  if (!publishCheck.ok) return publishCheck;

  await prisma.knowledgeArticle.update({
    where: { id: article.id },
    data: {
      status: KnowledgeArticleStatus.PUBLISHED,
      publishedAt: new Date(),
      archivedAt: null,
      updatedByUserId: userIdForSession(session),
    },
  });

  revalidateKnowledgeViews();
  return { ok: true, message: "Article published.", articleId: article.id };
}

export async function archiveKnowledgeArticleAction(
  formData: FormData,
): Promise<KnowledgeActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const articleId = toOptional(formData.get("articleId"));
  if (!articleId) return { ok: false, message: "Article not found." };

  const article = await prisma.knowledgeArticle.findFirst({
    where: { id: articleId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!article) return { ok: false, message: "Article not found." };

  await prisma.knowledgeArticle.update({
    where: { id: article.id },
    data: {
      status: KnowledgeArticleStatus.ARCHIVED,
      archivedAt: new Date(),
      updatedByUserId: userIdForSession(session),
    },
  });

  revalidateKnowledgeViews();
  return { ok: true, message: "Article archived.", articleId: article.id };
}

export async function restoreKnowledgeArticleAction(
  formData: FormData,
): Promise<KnowledgeActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const articleId = toOptional(formData.get("articleId"));
  if (!articleId) return { ok: false, message: "Article not found." };

  const article = await prisma.knowledgeArticle.findFirst({
    where: { id: articleId, facilityId: session.facilityId },
    select: { id: true, status: true },
  });
  if (!article) return { ok: false, message: "Article not found." };
  if (article.status !== KnowledgeArticleStatus.ARCHIVED) {
    return { ok: false, message: "Only archived articles can be restored to Draft." };
  }

  await prisma.knowledgeArticle.update({
    where: { id: article.id },
    data: {
      status: KnowledgeArticleStatus.DRAFT,
      archivedAt: null,
      publishedAt: null,
      updatedByUserId: userIdForSession(session),
    },
  });

  revalidateKnowledgeViews();
  return { ok: true, message: "Article restored to Draft.", articleId: article.id };
}
