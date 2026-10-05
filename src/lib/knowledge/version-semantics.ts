/**
 * Knowledge version semantics.
 *
 * KnowledgeArticle.id is the stable logical article/resource identity.
 * KnowledgeArticleVersion holds immutable published content snapshots.
 * Not every article is a Procedure — category remains on the article
 * (SOP / REFERENCE / TRAINING / …). Facility Plant Operations may later
 * pin Procedure-type versions; that FK is not part of this phase.
 */

import type {
  KnowledgeArticleStatus,
  KnowledgeArticleVersionStatus,
} from "@prisma/client";

export function assertKnowledgePublishedVersionImmutable(
  status: KnowledgeArticleVersionStatus | string,
) {
  if (status === "PUBLISHED" || status === "SUPERSEDED") {
    throw new Error(
      "Published Knowledge versions are immutable. Create a successor draft instead.",
    );
  }
}

export function mapArticleStatusToVersionStatus(
  status: KnowledgeArticleStatus | string,
): KnowledgeArticleVersionStatus {
  if (status === "PUBLISHED") return "PUBLISHED";
  if (status === "ARCHIVED") return "ARCHIVED";
  return "DRAFT";
}

export function restoreArticleHeadFromVersions(input: {
  versions: Array<{
    status: KnowledgeArticleVersionStatus | string;
    publishedAt: Date | null;
    version: number;
  }>;
}): {
  status: KnowledgeArticleStatus;
  publishedAt: Date | null;
  archivedAt: null;
} {
  const published = input.versions
    .filter((row) => row.status === "PUBLISHED")
    .sort((a, b) => b.version - a.version);
  if (published[0]) {
    return {
      status: "PUBLISHED",
      publishedAt: published[0].publishedAt,
      archivedAt: null,
    };
  }

  const historicalPublishedAt = input.versions
    .filter((row) => row.publishedAt)
    .sort((a, b) => b.version - a.version)[0]?.publishedAt ?? null;

  return {
    status: "DRAFT",
    publishedAt: historicalPublishedAt,
    archivedAt: null,
  };
}

export function nextKnowledgeVersionNumber(existingMax: number | null | undefined): number {
  return (existingMax ?? 0) + 1;
}

export function isKnowledgeProcedureCategory(category: string): boolean {
  return category === "SOP";
}
