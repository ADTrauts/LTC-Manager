/**
 * Optional SQL-backed Knowledge version tests.
 * Opt in via PLANT_OPERATIONS_TEST_DATABASE_URL or DEPARTMENT_WORK_TEST_DATABASE_URL.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import {
  createKnowledgeArticleWithInitialVersion,
  loadCurrentPublishedVersion,
  loadKnowledgeVersionById,
  publishKnowledgeArticle,
  restoreKnowledgeArticle,
  saveKnowledgeArticleEditableContent,
} from "./version-service";

const databaseUrl =
  process.env.PLANT_OPERATIONS_TEST_DATABASE_URL ||
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set PLANT_OPERATIONS_TEST_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

test(
  "knowledge versions: successor draft keeps published v1 readable; restore keeps publishedAt",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const facility = await prisma.facility.findFirst({ select: { id: true } });
      assert.ok(facility, "facility required");

      const created = await createKnowledgeArticleWithInitialVersion(prisma, {
        facilityId: facility.id,
        title: `Phase 2 procedure ${cuidLike().slice(-6)}`,
        summary: "v1 summary",
        body: "Version 1 body",
        category: "SOP",
        sourceType: "MANUAL",
        status: "PUBLISHED",
      });

      const v1 = await loadCurrentPublishedVersion(prisma, created.id);
      assert.ok(v1);
      assert.equal(v1.version, 1);
      assert.equal(v1.status, "PUBLISHED");
      assert.equal(v1.body, "Version 1 body");
      const v1PublishedAt = v1.publishedAt;
      assert.ok(v1PublishedAt);

      await saveKnowledgeArticleEditableContent(prisma, {
        articleId: created.id,
        title: `Phase 2 procedure ${cuidLike().slice(-6)} edited`,
        summary: "v2 summary",
        body: "Version 2 body",
        category: "SOP",
        sourceType: "MANUAL",
        status: "DRAFT",
      });

      const stillV1 = await loadKnowledgeVersionById(prisma, v1.id);
      assert.equal(stillV1?.body, "Version 1 body");
      assert.equal(stillV1?.status, "PUBLISHED");

      await publishKnowledgeArticle(prisma, created.id);

      const v1After = await loadKnowledgeVersionById(prisma, v1.id);
      assert.equal(v1After?.status, "SUPERSEDED");
      assert.equal(v1After?.body, "Version 1 body");
      assert.equal(v1After?.publishedAt?.toISOString(), v1PublishedAt.toISOString());

      const v2 = await loadCurrentPublishedVersion(prisma, created.id);
      assert.ok(v2);
      assert.equal(v2.version, 2);
      assert.equal(v2.body, "Version 2 body");

      await prisma.knowledgeArticle.update({
        where: { id: created.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await restoreKnowledgeArticle(prisma, created.id);
      const restored = await prisma.knowledgeArticle.findUniqueOrThrow({
        where: { id: created.id },
      });
      assert.equal(restored.status, "PUBLISHED");
      assert.ok(restored.publishedAt);
      const v2AfterRestore = await loadKnowledgeVersionById(prisma, v2.id);
      assert.equal(v2AfterRestore?.publishedAt?.toISOString(), v2.publishedAt?.toISOString());
    } finally {
      await prisma.$disconnect();
    }
  },
);
