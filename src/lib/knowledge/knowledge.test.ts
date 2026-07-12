import assert from "node:assert/strict";
import test from "node:test";

import {
  KnowledgeArticleCategory,
  KnowledgeArticleStatus,
  KnowledgeSourceType,
} from "@prisma/client";

import { validatePublishableArticle } from "@/lib/knowledge/article-schema";
import { escapeKnowledgeHtml, renderKnowledgeBodyPlainText } from "@/lib/knowledge/body";
import {
  isDepartmentCompatibleLink,
  isUnitCompatibleWithArticleDepartment,
  dedupeIds,
} from "@/lib/knowledge/object-links";
import { buildKnowledgeAdminListWhere } from "@/lib/knowledge/search";
import {
  articleVisibleToViewer,
  buildPublishedKnowledgeWhere,
} from "@/lib/knowledge/visibility";

test("knowledge enums include expected operational values", () => {
  assert.deepEqual(Object.values(KnowledgeArticleStatus).sort(), [
    "ARCHIVED",
    "DRAFT",
    "PUBLISHED",
  ]);
  assert.ok(Object.values(KnowledgeArticleCategory).includes("SOP"));
  assert.ok(Object.values(KnowledgeArticleCategory).includes("REFERENCE"));
  assert.ok(Object.values(KnowledgeSourceType).includes("MANUAL"));
});

test("publish validation rejects blank title or body", () => {
  assert.equal(validatePublishableArticle({ title: "", body: "x" }).ok, false);
  assert.equal(validatePublishableArticle({ title: "Title", body: "   " }).ok, false);
  assert.equal(validatePublishableArticle({ title: "Title", body: "Steps" }).ok, true);
});

test("department object-link compatibility rule", () => {
  assert.equal(isDepartmentCompatibleLink(null, "dept_a"), true);
  assert.equal(isDepartmentCompatibleLink("dept_a", null), true);
  assert.equal(isDepartmentCompatibleLink("dept_a", "dept_a"), true);
  assert.equal(isDepartmentCompatibleLink("dept_a", "dept_b"), false);
});

test("unit link requires department responsibility when article is scoped", () => {
  assert.equal(
    isUnitCompatibleWithArticleDepartment("dept_a", { departmentIds: ["dept_b"] }),
    false,
  );
  assert.equal(
    isUnitCompatibleWithArticleDepartment("dept_a", { departmentIds: ["dept_a", "dept_b"] }),
    true,
  );
  assert.equal(isUnitCompatibleWithArticleDepartment(null, { departmentIds: [] }), true);
});

test("dedupeIds removes duplicates", () => {
  assert.deepEqual(dedupeIds(["a", "a", "b", ""]), ["a", "b"]);
});

test("published visibility excludes drafts and respects department scope", () => {
  assert.equal(
    articleVisibleToViewer({
      articleDepartmentId: "dept_evs",
      articleStatus: "DRAFT",
      viewerDepartmentIds: ["dept_evs"],
    }),
    false,
  );
  assert.equal(
    articleVisibleToViewer({
      articleDepartmentId: "dept_evs",
      articleStatus: "PUBLISHED",
      viewerDepartmentIds: ["dept_dietary"],
    }),
    false,
  );
  assert.equal(
    articleVisibleToViewer({
      articleDepartmentId: null,
      articleStatus: "PUBLISHED",
      viewerDepartmentIds: ["dept_dietary"],
    }),
    true,
  );
  assert.equal(
    articleVisibleToViewer({
      articleDepartmentId: "dept_evs",
      articleStatus: "PUBLISHED",
      viewerDepartmentIds: null,
    }),
    true,
  );
});

test("buildPublishedKnowledgeWhere defaults to published only", () => {
  const where = buildPublishedKnowledgeWhere({
    facilityId: "fac_1",
    viewerDepartmentIds: ["dept_a"],
  });
  assert.equal(where.facilityId, "fac_1");
  assert.deepEqual(where.status, { in: ["PUBLISHED"] });
  assert.ok(where.OR);
});

test("admin list search excludes archived by default", () => {
  const where = buildKnowledgeAdminListWhere({ facilityId: "fac_1" });
  assert.deepEqual(where.status, { not: "ARCHIVED" });
});

test("admin list filters status category department and query", () => {
  const where = buildKnowledgeAdminListWhere({
    facilityId: "fac_1",
    status: "PUBLISHED",
    category: "SOP",
    departmentId: "dept_1",
    query: "sanitizer",
  });
  assert.equal(where.status, "PUBLISHED");
  assert.equal(where.category, "SOP");
  assert.equal(where.departmentId, "dept_1");
  assert.ok(where.OR);
});

test("body renderer escapes HTML", () => {
  const escaped = renderKnowledgeBodyPlainText('<script>alert("x")</script>');
  assert.match(escaped, /&lt;script&gt;/);
  assert.equal(escapeKnowledgeHtml("a & b"), "a &amp; b");
});
