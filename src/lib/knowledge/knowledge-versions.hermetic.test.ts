import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { KnowledgeArticleStatus, KnowledgeArticleVersionStatus } from "@prisma/client";

import {
  assertKnowledgePublishedVersionImmutable,
  isKnowledgeProcedureCategory,
  mapArticleStatusToVersionStatus,
  nextKnowledgeVersionNumber,
  restoreArticleHeadFromVersions,
} from "./version-semantics";

test("knowledge version statuses include successor states without replacing article status", () => {
  assert.deepEqual(Object.values(KnowledgeArticleStatus).sort(), [
    "ARCHIVED",
    "DRAFT",
    "PUBLISHED",
  ]);
  assert.deepEqual(Object.values(KnowledgeArticleVersionStatus).sort(), [
    "ARCHIVED",
    "DRAFT",
    "PUBLISHED",
    "SUPERSEDED",
  ]);
});

test("existing article status maps to version 1 without fabricating history", () => {
  assert.equal(mapArticleStatusToVersionStatus("PUBLISHED"), "PUBLISHED");
  assert.equal(mapArticleStatusToVersionStatus("DRAFT"), "DRAFT");
  assert.equal(mapArticleStatusToVersionStatus("ARCHIVED"), "ARCHIVED");
  assert.equal(nextKnowledgeVersionNumber(null), 1);
  assert.equal(nextKnowledgeVersionNumber(1), 2);
});

test("published versions are immutable", () => {
  assert.throws(
    () => assertKnowledgePublishedVersionImmutable("PUBLISHED"),
    /immutable/,
  );
  assert.throws(
    () => assertKnowledgePublishedVersionImmutable("SUPERSEDED"),
    /immutable/,
  );
  assert.doesNotThrow(() => assertKnowledgePublishedVersionImmutable("DRAFT"));
});

test("restore keeps historical publishedAt and does not force draft", () => {
  const published = restoreArticleHeadFromVersions({
    versions: [
      { status: "SUPERSEDED", publishedAt: new Date("2026-01-01"), version: 1 },
      { status: "PUBLISHED", publishedAt: new Date("2026-02-01"), version: 2 },
    ],
  });
  assert.equal(published.status, "PUBLISHED");
  assert.equal(published.publishedAt?.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(published.archivedAt, null);

  const draftOnly = restoreArticleHeadFromVersions({
    versions: [{ status: "DRAFT", publishedAt: null, version: 1 }],
  });
  assert.equal(draftOnly.status, "DRAFT");
  assert.equal(draftOnly.publishedAt, null);
});

test("Procedure is a Knowledge category, not a separate Plant table", () => {
  assert.equal(isKnowledgeProcedureCategory("SOP"), true);
  assert.equal(isKnowledgeProcedureCategory("REFERENCE"), false);
  assert.equal(isKnowledgeProcedureCategory("TRAINING"), false);
});

test("restore action no longer clears publishedAt", () => {
  const actions = readFileSync(
    new URL("../../app/(protected)/admin/knowledge/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(actions, /restoreKnowledgeArticle/);
  assert.doesNotMatch(actions, /publishedAt: null/);
});

test("additive KnowledgeArticleVersion migration backfills version 1 only", () => {
  const sql = readFileSync(
    new URL(
      "../../../prisma/migrations/20261005180000_knowledge_article_version/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE "KnowledgeArticleVersion"/);
  assert.match(sql, /INSERT INTO "KnowledgeArticleVersion"/);
  assert.match(sql, /"version",/);
  assert.doesNotMatch(sql, /UPDATE "KnowledgeArticle"/);
  assert.doesNotMatch(sql, /DELETE FROM "KnowledgeArticle"/);
  assert.doesNotMatch(sql, /DROP TABLE "KnowledgeArticle"/);
});

test("version service publishes by superseding prior published rows, not rewriting bodies", () => {
  const source = readFileSync(new URL("./version-service.ts", import.meta.url), "utf8");
  assert.match(source, /status: "SUPERSEDED"/);
  assert.match(source, /ensureEditableDraft/);
  assert.match(source, /assertKnowledgePublishedVersionImmutable/);
});
