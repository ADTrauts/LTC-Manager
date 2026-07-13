import assert from "node:assert/strict";
import test from "node:test";

import type { ContextualKnowledgeArticle } from "@/lib/knowledge/contextual";
import { toContextualKnowledgeClientArticles } from "@/lib/knowledge/contextual";

function article(
  partial: Partial<ContextualKnowledgeArticle> & Pick<ContextualKnowledgeArticle, "id" | "title" | "linkReason" | "sortRank">,
): ContextualKnowledgeArticle {
  return {
    summary: null,
    body: "Body",
    category: "SOP",
    sourceType: "MANUAL",
    departmentId: null,
    departmentName: null,
    departmentKey: null,
    updatedAt: new Date("2026-07-12T12:00:00.000Z"),
    linkReasonLabel: "Linked",
    ...partial,
  };
}

test("client serialization converts updatedAt to ISO string", () => {
  const client = toContextualKnowledgeClientArticles([
    article({ id: "a1", title: "Guide", linkReason: "UNIT", sortRank: 100 }),
  ]);
  assert.equal(typeof client[0]?.updatedAt, "string");
  assert.match(client[0]!.updatedAt, /2026-07-12/);
});

test("ordering preference: asset safety before unit sop before facility reference", () => {
  const ranked = [
    article({ id: "fw", title: "B", linkReason: "FACILITY_WIDE", sortRank: 206, category: "REFERENCE" }),
    article({ id: "unit", title: "A", linkReason: "UNIT", sortRank: 102, category: "SOP" }),
    article({ id: "asset", title: "C", linkReason: "ASSET", sortRank: 0, category: "SAFETY" }),
  ].sort((a, b) => {
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    return a.title.localeCompare(b.title);
  });

  assert.deepEqual(
    ranked.map((row) => row.id),
    ["asset", "unit", "fw"],
  );
});
