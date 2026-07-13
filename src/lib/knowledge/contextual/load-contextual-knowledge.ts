import type { KnowledgeArticleCategory, PrismaClient } from "@prisma/client";

import { buildPublishedKnowledgeWhere } from "@/lib/knowledge/visibility";
import { prisma as defaultPrisma } from "@/lib/prisma";

import {
  buildContextualKnowledgeWhere,
  categoryPrecedence,
  linkReasonLabel,
  linkReasonRank,
} from "./build-contextual-knowledge-where";
import type {
  ContextualKnowledgeArticle,
  ContextualKnowledgeContext,
  ContextualKnowledgeLinkReason,
  ContextualKnowledgeResult,
} from "./types";

type ArticleRow = {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  category: KnowledgeArticleCategory;
  sourceType: ContextualKnowledgeArticle["sourceType"];
  departmentId: string | null;
  updatedAt: Date;
  department: { name: string; key: string } | null;
  unitLinks: { unitId: string }[];
  assetLinks: { assetId: string }[];
  logTemplateLinks: { logTemplateId: string }[];
  inspectionDefinitionLinks: { inspectionDefinitionId: string }[];
};

function resolveLinkReason(
  row: ArticleRow,
  context: ContextualKnowledgeContext,
): ContextualKnowledgeLinkReason {
  if (
    context.assetId &&
    row.assetLinks.some((link) => link.assetId === context.assetId)
  ) {
    return "ASSET";
  }
  if (
    context.logTemplateId &&
    row.logTemplateLinks.some((link) => link.logTemplateId === context.logTemplateId)
  ) {
    return "LOG_TEMPLATE";
  }
  if (
    context.inspectionDefinitionId &&
    row.inspectionDefinitionLinks.some(
      (link) => link.inspectionDefinitionId === context.inspectionDefinitionId,
    )
  ) {
    return "INSPECTION_DEFINITION";
  }
  if (context.unitId && row.unitLinks.some((link) => link.unitId === context.unitId)) {
    return "UNIT";
  }
  return "FACILITY_WIDE";
}

function sortRank(reason: ContextualKnowledgeLinkReason, category: KnowledgeArticleCategory): number {
  // Exact object-linked safety/compliance first, then SOP/troubleshooting, then other object links,
  // then unit, then facility-wide. Lower is better.
  const reasonBase = linkReasonRank(reason) * 100;
  const categoryBoost = categoryPrecedence(category);
  return reasonBase + categoryBoost;
}

/**
 * Load published contextual knowledge for an operational surface.
 * Single batched query — no N+1. Deterministic ordering.
 */
export async function loadContextualKnowledge(
  context: ContextualKnowledgeContext,
  db: PrismaClient = defaultPrisma,
): Promise<ContextualKnowledgeResult> {
  const limit = context.limit ?? 12;
  const where = buildContextualKnowledgeWhere(context);

  const rows = (await db.knowledgeArticle.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 80,
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      category: true,
      sourceType: true,
      departmentId: true,
      updatedAt: true,
      department: { select: { name: true, key: true } },
      unitLinks: {
        where: context.unitId ? { unitId: context.unitId } : undefined,
        select: { unitId: true },
      },
      assetLinks: {
        where: context.assetId ? { assetId: context.assetId } : undefined,
        select: { assetId: true },
      },
      logTemplateLinks: {
        where: context.logTemplateId
          ? { logTemplateId: context.logTemplateId }
          : undefined,
        select: { logTemplateId: true },
      },
      inspectionDefinitionLinks: {
        where: context.inspectionDefinitionId
          ? { inspectionDefinitionId: context.inspectionDefinitionId }
          : undefined,
        select: { inspectionDefinitionId: true },
      },
    },
  })) as ArticleRow[];

  const articles: ContextualKnowledgeArticle[] = rows
    .map((row) => {
      const linkReason = resolveLinkReason(row, context);
      // Drop facility-wide rows that slipped in without opt-in.
      if (linkReason === "FACILITY_WIDE" && !context.includeFacilityWideReference) {
        return null;
      }
      const rank = sortRank(linkReason, row.category);
      return {
        id: row.id,
        title: row.title,
        summary: row.summary,
        body: row.body,
        category: row.category,
        sourceType: row.sourceType,
        departmentId: row.departmentId,
        departmentName: row.department?.name ?? null,
        departmentKey: row.department?.key ?? null,
        updatedAt: row.updatedAt,
        linkReason,
        linkReasonLabel: linkReasonLabel(linkReason),
        sortRank: rank,
      } satisfies ContextualKnowledgeArticle;
    })
    .filter((row): row is ContextualKnowledgeArticle => row != null)
    .sort((a, b) => {
      if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);

  return { articles, count: articles.length };
}

/**
 * Batch-load asset-linked published articles for a registry list.
 * Returns Map<assetId, ContextualKnowledgeArticle[]>.
 */
export async function loadContextualKnowledgeByAssetIds(input: {
  facilityId: string;
  viewerDepartmentIds: string[] | null;
  assetIds: string[];
  limitPerAsset?: number;
}, db: PrismaClient = defaultPrisma): Promise<Map<string, ContextualKnowledgeArticle[]>> {
  const result = new Map<string, ContextualKnowledgeArticle[]>();
  const assetIds = [...new Set(input.assetIds.filter(Boolean))];
  if (assetIds.length === 0) return result;

  const published = buildPublishedKnowledgeWhere({
    facilityId: input.facilityId,
    viewerDepartmentIds: input.viewerDepartmentIds,
  });

  const rows = await db.knowledgeArticle.findMany({
    where: {
      AND: [published, { assetLinks: { some: { assetId: { in: assetIds } } } }],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      category: true,
      sourceType: true,
      departmentId: true,
      updatedAt: true,
      department: { select: { name: true, key: true } },
      assetLinks: {
        where: { assetId: { in: assetIds } },
        select: { assetId: true },
      },
    },
  });

  const limitPerAsset = input.limitPerAsset ?? 5;

  for (const row of rows) {
    for (const link of row.assetLinks) {
      const list = result.get(link.assetId) ?? [];
      if (list.length >= limitPerAsset) continue;
      list.push({
        id: row.id,
        title: row.title,
        summary: row.summary,
        body: row.body,
        category: row.category,
        sourceType: row.sourceType,
        departmentId: row.departmentId,
        departmentName: row.department?.name ?? null,
        departmentKey: row.department?.key ?? null,
        updatedAt: row.updatedAt,
        linkReason: "ASSET",
        linkReasonLabel: linkReasonLabel("ASSET"),
        sortRank: sortRank("ASSET", row.category),
      });
      result.set(link.assetId, list);
    }
  }

  for (const [assetId, list] of result) {
    result.set(
      assetId,
      [...list].sort((a, b) => {
        if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
        return a.title.localeCompare(b.title);
      }),
    );
  }

  return result;
}
