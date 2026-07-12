import type { KnowledgeArticleCategory, KnowledgeArticleStatus, Prisma } from "@prisma/client";

/** Admin list filters — database-backed title/summary/body search. */
export function buildKnowledgeAdminListWhere(input: {
  facilityId: string;
  status?: KnowledgeArticleStatus | "ALL";
  departmentId?: string | "ALL" | "FACILITY_WIDE";
  category?: KnowledgeArticleCategory | "ALL";
  query?: string;
  includeArchived?: boolean;
}): Prisma.KnowledgeArticleWhereInput {
  const where: Prisma.KnowledgeArticleWhereInput = {
    facilityId: input.facilityId,
  };

  if (input.status && input.status !== "ALL") {
    where.status = input.status;
  } else if (!input.includeArchived) {
    where.status = { not: "ARCHIVED" };
  }

  if (input.departmentId === "FACILITY_WIDE") {
    where.departmentId = null;
  } else if (input.departmentId && input.departmentId !== "ALL") {
    where.departmentId = input.departmentId;
  }

  if (input.category && input.category !== "ALL") {
    where.category = input.category;
  }

  const q = input.query?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { body: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}
