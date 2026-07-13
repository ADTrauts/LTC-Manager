import type { KnowledgeArticleCategory, Prisma } from "@prisma/client";

import { buildPublishedKnowledgeWhere } from "@/lib/knowledge/visibility";

import type { ContextualKnowledgeContext, ContextualKnowledgeLinkReason } from "./types";

const FACILITY_WIDE_CATEGORIES: KnowledgeArticleCategory[] = [
  "SAFETY",
  "COMPLIANCE",
  "SOP",
  "REFERENCE",
];

/**
 * Build a Prisma where for published articles that could match the context
 * (object links OR optional facility-wide reference). Caller ranks and filters.
 */
export function buildContextualKnowledgeWhere(
  context: ContextualKnowledgeContext,
): Prisma.KnowledgeArticleWhereInput {
  const published = buildPublishedKnowledgeWhere({
    facilityId: context.facilityId,
    viewerDepartmentIds: context.viewerDepartmentIds,
  });

  const linkClauses: Prisma.KnowledgeArticleWhereInput[] = [];

  if (context.assetId) {
    linkClauses.push({ assetLinks: { some: { assetId: context.assetId } } });
  }
  if (context.logTemplateId) {
    linkClauses.push({
      logTemplateLinks: { some: { logTemplateId: context.logTemplateId } },
    });
  }
  if (context.inspectionDefinitionId) {
    linkClauses.push({
      inspectionDefinitionLinks: {
        some: { inspectionDefinitionId: context.inspectionDefinitionId },
      },
    });
  }
  if (context.unitId) {
    linkClauses.push({ unitLinks: { some: { unitId: context.unitId } } });
  }
  if (context.includeFacilityWideReference) {
    linkClauses.push({
      AND: [
        { departmentId: null },
        { category: { in: FACILITY_WIDE_CATEGORIES } },
        { unitLinks: { none: {} } },
        { assetLinks: { none: {} } },
        { logTemplateLinks: { none: {} } },
        { inspectionDefinitionLinks: { none: {} } },
      ],
    });
  }

  if (linkClauses.length === 0) {
    // No object context and no facility-wide opt-in → empty result set.
    return { ...published, id: "__none__" };
  }

  return {
    AND: [published, { OR: linkClauses }],
  };
}

export function categoryPrecedence(category: KnowledgeArticleCategory): number {
  switch (category) {
    case "SAFETY":
      return 0;
    case "COMPLIANCE":
      return 1;
    case "SOP":
      return 2;
    case "TROUBLESHOOTING":
      return 3;
    case "EQUIPMENT":
      return 4;
    case "LOCATION":
      return 5;
    case "REFERENCE":
      return 6;
    case "TRAINING":
      return 7;
    case "OTHER":
    default:
      return 8;
  }
}

export function linkReasonRank(reason: ContextualKnowledgeLinkReason): number {
  switch (reason) {
    case "ASSET":
    case "LOG_TEMPLATE":
    case "INSPECTION_DEFINITION":
      return 0;
    case "UNIT":
      return 1;
    case "FACILITY_WIDE":
      return 2;
    default:
      return 3;
  }
}

export function linkReasonLabel(reason: ContextualKnowledgeLinkReason): string {
  switch (reason) {
    case "ASSET":
      return "Linked to this equipment";
    case "LOG_TEMPLATE":
      return "Linked to this log";
    case "INSPECTION_DEFINITION":
      return "Linked to this inspection";
    case "UNIT":
      return "Linked to this location";
    case "FACILITY_WIDE":
      return "Facility reference";
    default:
      return "Related guidance";
  }
}

export { FACILITY_WIDE_CATEGORIES };
