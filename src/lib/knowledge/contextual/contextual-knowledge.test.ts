import assert from "node:assert/strict";
import test from "node:test";

import { KnowledgeArticleCategory } from "@prisma/client";

import {
  buildContextualKnowledgeWhere,
  categoryPrecedence,
  linkReasonLabel,
  linkReasonRank,
} from "@/lib/knowledge/contextual/build-contextual-knowledge-where";
import { articleVisibleToViewer } from "@/lib/knowledge/visibility";

test("exact object link ranks above unit and facility-wide", () => {
  assert.ok(linkReasonRank("ASSET") < linkReasonRank("UNIT"));
  assert.ok(linkReasonRank("LOG_TEMPLATE") < linkReasonRank("UNIT"));
  assert.ok(linkReasonRank("INSPECTION_DEFINITION") < linkReasonRank("FACILITY_WIDE"));
  assert.ok(linkReasonRank("UNIT") < linkReasonRank("FACILITY_WIDE"));
});

test("safety and compliance precede SOP and troubleshooting within a link tier", () => {
  assert.ok(categoryPrecedence("SAFETY") < categoryPrecedence("SOP"));
  assert.ok(categoryPrecedence("COMPLIANCE") < categoryPrecedence("TROUBLESHOOTING"));
  assert.ok(categoryPrecedence("SOP") < categoryPrecedence("REFERENCE"));
});

test("link reason labels are operator-friendly", () => {
  assert.match(linkReasonLabel("ASSET"), /equipment/i);
  assert.match(linkReasonLabel("UNIT"), /location/i);
  assert.match(linkReasonLabel("FACILITY_WIDE"), /Facility/i);
});

test("contextual where requires published status via visibility AND object links", () => {
  const where = buildContextualKnowledgeWhere({
    facilityId: "fac_1",
    viewerDepartmentIds: ["dept_a"],
    unitId: "unit_1",
    includeFacilityWideReference: false,
  });
  assert.equal((where as { AND?: unknown[] }).AND?.length, 2);
});

test("empty context without facility-wide opt-in yields impossible id filter", () => {
  const where = buildContextualKnowledgeWhere({
    facilityId: "fac_1",
    viewerDepartmentIds: null,
  });
  assert.equal((where as { id?: string }).id, "__none__");
});

test("facility-wide opt-in adds reference category clause", () => {
  const where = buildContextualKnowledgeWhere({
    facilityId: "fac_1",
    viewerDepartmentIds: null,
    includeFacilityWideReference: true,
  });
  const and = (where as { AND: Array<{ OR?: unknown[] }> }).AND;
  assert.ok(and[1]?.OR && and[1].OR.length >= 1);
});

test("draft and archived never pass frontline visibility helper", () => {
  assert.equal(
    articleVisibleToViewer({
      articleDepartmentId: null,
      articleStatus: "DRAFT",
      viewerDepartmentIds: null,
    }),
    false,
  );
  assert.equal(
    articleVisibleToViewer({
      articleDepartmentId: null,
      articleStatus: "ARCHIVED",
      viewerDepartmentIds: null,
    }),
    false,
  );
});

test("unrelated department published article excluded from frontline viewer", () => {
  assert.equal(
    articleVisibleToViewer({
      articleDepartmentId: "dept_evs",
      articleStatus: "PUBLISHED",
      viewerDepartmentIds: ["dept_dietary"],
    }),
    false,
  );
});

test("sort rank is deterministic for same reason and category", () => {
  const a = linkReasonRank("UNIT") * 100 + categoryPrecedence("SOP" as KnowledgeArticleCategory);
  const b = linkReasonRank("UNIT") * 100 + categoryPrecedence("SOP" as KnowledgeArticleCategory);
  assert.equal(a, b);
});
