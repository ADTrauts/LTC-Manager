import type {
  KnowledgeArticleCategory,
  KnowledgeSourceType,
} from "@prisma/client";

/** Why an article was included in a contextual result. */
export type ContextualKnowledgeLinkReason =
  | "ASSET"
  | "LOG_TEMPLATE"
  | "INSPECTION_DEFINITION"
  | "UNIT"
  | "FACILITY_WIDE";

export type ContextualKnowledgeContext = {
  facilityId: string;
  /** null = leadership / all departments; empty = facility-wide only; ids = those depts + facility-wide */
  viewerDepartmentIds: string[] | null;
  unitId?: string | null;
  assetId?: string | null;
  logTemplateId?: string | null;
  inspectionDefinitionId?: string | null;
  /** When true, include limited facility-wide SAFETY/COMPLIANCE/SOP/REFERENCE articles. */
  includeFacilityWideReference?: boolean;
  /** Cap on returned articles after ranking. */
  limit?: number;
};

export type ContextualKnowledgeArticle = {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  category: KnowledgeArticleCategory;
  sourceType: KnowledgeSourceType;
  departmentId: string | null;
  departmentName: string | null;
  departmentKey: string | null;
  updatedAt: Date;
  linkReason: ContextualKnowledgeLinkReason;
  linkReasonLabel: string;
  sortRank: number;
};

/** JSON-safe article for client components (Server → Client props). */
export type ContextualKnowledgeArticleClient = Omit<ContextualKnowledgeArticle, "updatedAt"> & {
  updatedAt: string;
};

export function toContextualKnowledgeClientArticles(
  articles: ContextualKnowledgeArticle[],
): ContextualKnowledgeArticleClient[] {
  return articles.map((article) => ({
    ...article,
    updatedAt: article.updatedAt.toISOString(),
  }));
}

export type ContextualKnowledgeResult = {
  articles: ContextualKnowledgeArticle[];
  count: number;
};
