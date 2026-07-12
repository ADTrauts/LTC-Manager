import type { KnowledgeArticleStatus, Prisma } from "@prisma/client";

/**
 * Build Prisma where clause for published knowledge visible to a viewer.
 *
 * - `viewerDepartmentIds: null` → facility leadership / unset scope sees all published in facility
 * - `viewerDepartmentIds: string[]` → published facility-wide OR matching department only
 */
export function buildPublishedKnowledgeWhere(input: {
  facilityId: string;
  viewerDepartmentIds: string[] | null;
  includeArchived?: boolean;
}): Prisma.KnowledgeArticleWhereInput {
  const statusFilter: KnowledgeArticleStatus[] = input.includeArchived
    ? ["PUBLISHED", "ARCHIVED"]
    : ["PUBLISHED"];

  const base: Prisma.KnowledgeArticleWhereInput = {
    facilityId: input.facilityId,
    status: { in: statusFilter },
  };

  if (input.viewerDepartmentIds === null) {
    return base;
  }

  if (input.viewerDepartmentIds.length === 0) {
    return { ...base, departmentId: null };
  }

  return {
    ...base,
    OR: [{ departmentId: null }, { departmentId: { in: input.viewerDepartmentIds } }],
  };
}

export function articleVisibleToViewer(input: {
  articleDepartmentId: string | null;
  articleStatus: KnowledgeArticleStatus;
  viewerDepartmentIds: string[] | null;
}): boolean {
  if (input.articleStatus !== "PUBLISHED") {
    return false;
  }
  if (input.viewerDepartmentIds === null) {
    return true;
  }
  if (!input.articleDepartmentId) {
    return true;
  }
  return input.viewerDepartmentIds.includes(input.articleDepartmentId);
}
