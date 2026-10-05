/**
 * Knowledge article version writes.
 * Published title/summary/body never mutate in place. Edits use a successor DRAFT.
 * Article head title/body/status remain a compatibility projection of current truth.
 */

import type {
  KnowledgeArticleCategory,
  KnowledgeArticleStatus,
  KnowledgeSourceType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import { validatePublishableArticle } from "./article-schema";
import {
  assertKnowledgePublishedVersionImmutable,
  nextKnowledgeVersionNumber,
  restoreArticleHeadFromVersions,
} from "./version-semantics";

type Db = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

export type KnowledgeArticleContentInput = {
  title: string;
  summary?: string | null;
  body: string;
  category: KnowledgeArticleCategory;
  sourceType: KnowledgeSourceType;
  departmentId?: string | null;
  status?: KnowledgeArticleStatus;
};

export async function loadCurrentDraftVersion(client: Db, articleId: string) {
  return client.knowledgeArticleVersion.findFirst({
    where: { articleId, status: "DRAFT" },
    orderBy: { version: "desc" },
  });
}

export async function loadCurrentPublishedVersion(client: Db, articleId: string) {
  return client.knowledgeArticleVersion.findFirst({
    where: { articleId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
}

export async function loadKnowledgeVersionById(client: Db, versionId: string) {
  return client.knowledgeArticleVersion.findUnique({
    where: { id: versionId },
  });
}

export async function loadKnowledgeArticleEditorState(client: Db, articleId: string) {
  const article = await client.knowledgeArticle.findUnique({
    where: { id: articleId },
    include: {
      versions: { orderBy: { version: "asc" } },
      unitLinks: true,
      assetLinks: true,
      logTemplateLinks: true,
      inspectionDefinitionLinks: true,
    },
  });
  if (!article) return null;
  const draft = article.versions.find((row) => row.status === "DRAFT") ?? null;
  const published =
    [...article.versions].reverse().find((row) => row.status === "PUBLISHED") ?? null;
  const editor = draft ?? published ?? article;
  return {
    article,
    draft,
    published,
    editorTitle: editor.title,
    editorSummary: editor.summary,
    editorBody: "body" in editor ? editor.body : article.body,
    editorStatus: draft ? ("DRAFT" as const) : article.status,
  };
}

async function maxVersion(client: Db, articleId: string): Promise<number> {
  const aggregate = await client.knowledgeArticleVersion.aggregate({
    where: { articleId },
    _max: { version: true },
  });
  return aggregate._max.version ?? 0;
}

async function projectArticleHead(
  client: Db,
  articleId: string,
  extra: Prisma.KnowledgeArticleUncheckedUpdateInput,
) {
  const published = await loadCurrentPublishedVersion(client, articleId);
  const draft = await loadCurrentDraftVersion(client, articleId);
  const head = published ?? draft;
  if (!head) {
    return client.knowledgeArticle.update({
      where: { id: articleId },
      data: extra,
    });
  }
  return client.knowledgeArticle.update({
    where: { id: articleId },
    data: {
      ...extra,
      title: published?.title ?? head.title,
      summary: published?.summary ?? head.summary,
      body: published?.body ?? head.body,
      status: published ? "PUBLISHED" : "DRAFT",
      publishedAt: published?.publishedAt ?? undefined,
    },
  });
}

export async function createKnowledgeArticleWithInitialVersion(
  client: Db,
  input: KnowledgeArticleContentInput & {
    facilityId: string;
    createdByUserId?: string | null;
  },
) {
  const nextStatus = input.status ?? "DRAFT";
  if (nextStatus === "PUBLISHED") {
    const publishCheck = validatePublishableArticle(input);
    if (!publishCheck.ok) throw new Error(publishCheck.message);
  }
  const now = new Date();
  const created = await client.knowledgeArticle.create({
    data: {
      facilityId: input.facilityId,
      title: input.title,
      summary: input.summary ?? null,
      body: input.body,
      category: input.category,
      sourceType: input.sourceType,
      departmentId: input.departmentId ?? null,
      status: nextStatus,
      createdByUserId: input.createdByUserId ?? null,
      updatedByUserId: input.createdByUserId ?? null,
      publishedAt: nextStatus === "PUBLISHED" ? now : null,
      archivedAt: nextStatus === "ARCHIVED" ? now : null,
    },
    select: { id: true },
  });

  await client.knowledgeArticleVersion.create({
    data: {
      id: cuidLike(),
      articleId: created.id,
      version: 1,
      status:
        nextStatus === "PUBLISHED"
          ? "PUBLISHED"
          : nextStatus === "ARCHIVED"
            ? "ARCHIVED"
            : "DRAFT",
      title: input.title,
      summary: input.summary ?? null,
      body: input.body,
      createdByUserId: input.createdByUserId ?? null,
      publishedAt: nextStatus === "PUBLISHED" ? now : null,
      archivedAt: nextStatus === "ARCHIVED" ? now : null,
    },
  });

  return created;
}

async function ensureEditableDraft(
  client: Db,
  articleId: string,
  userId: string | null | undefined,
) {
  const existingDraft = await loadCurrentDraftVersion(client, articleId);
  if (existingDraft) {
    assertKnowledgePublishedVersionImmutable(existingDraft.status);
    return existingDraft;
  }

  const published = await loadCurrentPublishedVersion(client, articleId);
  if (published) {
    const version = nextKnowledgeVersionNumber(await maxVersion(client, articleId));
    return client.knowledgeArticleVersion.create({
      data: {
        id: cuidLike(),
        articleId,
        version,
        status: "DRAFT",
        title: published.title,
        summary: published.summary,
        body: published.body,
        createdByUserId: userId ?? null,
        createdFromVersionId: published.id,
      },
    });
  }

  const article = await client.knowledgeArticle.findUniqueOrThrow({
    where: { id: articleId },
    select: { title: true, summary: true, body: true, createdByUserId: true },
  });
  return client.knowledgeArticleVersion.create({
    data: {
      id: cuidLike(),
      articleId,
      version: nextKnowledgeVersionNumber(await maxVersion(client, articleId)) || 1,
      status: "DRAFT",
      title: article.title,
      summary: article.summary,
      body: article.body,
      createdByUserId: userId ?? article.createdByUserId,
    },
  });
}

export async function saveKnowledgeArticleEditableContent(
  client: Db,
  input: KnowledgeArticleContentInput & {
    articleId: string;
    updatedByUserId?: string | null;
  },
) {
  const existing = await client.knowledgeArticle.findUnique({
    where: { id: input.articleId },
    select: { id: true, status: true, publishedAt: true },
  });
  if (!existing) throw new Error("Article not found.");

  const nextStatus = input.status ?? "DRAFT";
  const draft = await ensureEditableDraft(client, existing.id, input.updatedByUserId);
  assertKnowledgePublishedVersionImmutable(draft.status);

  await client.knowledgeArticleVersion.update({
    where: { id: draft.id },
    data: {
      title: input.title,
      summary: input.summary ?? null,
      body: input.body,
    },
  });

  await client.knowledgeArticle.update({
    where: { id: existing.id },
    data: {
      category: input.category,
      sourceType: input.sourceType,
      departmentId: input.departmentId ?? null,
      updatedByUserId: input.updatedByUserId ?? null,
    },
  });

  if (nextStatus === "PUBLISHED") {
    await publishKnowledgeArticle(client, existing.id, input.updatedByUserId);
    return existing.id;
  }

  if (nextStatus === "ARCHIVED") {
    await archiveKnowledgeArticle(client, existing.id, input.updatedByUserId);
    return existing.id;
  }

  await projectArticleHead(client, existing.id, {
    updatedByUserId: input.updatedByUserId ?? null,
  });
  return existing.id;
}

export async function publishKnowledgeArticle(
  client: Db,
  articleId: string,
  updatedByUserId?: string | null,
) {
  const article = await client.knowledgeArticle.findUnique({
    where: { id: articleId },
    select: { id: true, title: true, body: true },
  });
  if (!article) throw new Error("Article not found.");

  let draft = await loadCurrentDraftVersion(client, articleId);
  const published = await loadCurrentPublishedVersion(client, articleId);
  if (!draft && published) {
    return articleId;
  }
  if (!draft) {
    draft = await ensureEditableDraft(client, articleId, updatedByUserId);
  }

  const publishCheck = validatePublishableArticle(draft);
  if (!publishCheck.ok) throw new Error(publishCheck.message);

  const now = new Date();
  if (published) {
    await client.knowledgeArticleVersion.update({
      where: { id: published.id },
      data: { status: "SUPERSEDED" },
    });
  }

  await client.knowledgeArticleVersion.update({
    where: { id: draft.id },
    data: {
      status: "PUBLISHED",
      publishedAt: draft.publishedAt ?? now,
    },
  });

  await client.knowledgeArticle.update({
    where: { id: articleId },
    data: {
      title: draft.title,
      summary: draft.summary,
      body: draft.body,
      status: "PUBLISHED",
      publishedAt: draft.publishedAt ?? now,
      archivedAt: null,
      updatedByUserId: updatedByUserId ?? null,
    },
  });

  return articleId;
}

export async function archiveKnowledgeArticle(
  client: Db,
  articleId: string,
  updatedByUserId?: string | null,
) {
  const article = await client.knowledgeArticle.findUnique({
    where: { id: articleId },
    select: { id: true },
  });
  if (!article) throw new Error("Article not found.");

  await client.knowledgeArticle.update({
    where: { id: articleId },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
      updatedByUserId: updatedByUserId ?? null,
    },
  });
  return articleId;
}

export async function restoreKnowledgeArticle(
  client: Db,
  articleId: string,
  updatedByUserId?: string | null,
) {
  const article = await client.knowledgeArticle.findUnique({
    where: { id: articleId },
    select: { id: true, status: true },
  });
  if (!article) throw new Error("Article not found.");
  if (article.status !== "ARCHIVED") {
    throw new Error("Only archived articles can be restored.");
  }

  const versions = await client.knowledgeArticleVersion.findMany({
    where: { articleId },
    select: { status: true, publishedAt: true, version: true },
    orderBy: { version: "asc" },
  });
  const head = restoreArticleHeadFromVersions({ versions });

  await client.knowledgeArticle.update({
    where: { id: articleId },
    data: {
      status: head.status,
      publishedAt: head.publishedAt,
      archivedAt: null,
      updatedByUserId: updatedByUserId ?? null,
    },
  });
  return articleId;
}
