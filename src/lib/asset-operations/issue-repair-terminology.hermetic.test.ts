import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveProductAreaLabel, resolveProductModeForPath } from "@/lib/product-mode";

test("repairs label as Maintenance", () => {
  assert.equal(resolveProductModeForPath("/repairs/abc"), "RUN");
  assert.equal(resolveProductAreaLabel("/repairs/abc"), "Maintenance");
  assert.equal(resolveProductAreaLabel("/issues/abc"), null);
});

test("new work orders do not write the compatibility issue type or issue pointer", () => {
  const service = readFileSync("src/lib/asset-operations/work-order-service.ts", "utf8");
  const repairs = readFileSync("src/app/(protected)/repairs/actions.ts", "utf8");
  const unit = readFileSync("src/app/(protected)/unit/[unitId]/actions.ts", "utf8");
  const preventive = readFileSync("src/lib/preventive-maintenance/work-order-create.ts", "utf8");
  assert.doesNotMatch(service, /issueType:/);
  assert.doesNotMatch(service, /assetIssue\.update\([\s\S]*workOrderId/);
  assert.match(service, /operationalRequest\.update/);
  const createData = (source: string) => {
    const start = source.indexOf("prisma.repair.create");
    return source.slice(start, source.indexOf("select:", start));
  };
  assert.doesNotMatch(createData(repairs), /issueType/);
  assert.doesNotMatch(createData(unit), /issueType/);
  assert.doesNotMatch(preventive, /issueType/);
});

test("Asset Issues and Repairs share the RUN Maintenance category", () => {
  assert.equal(resolveProductAreaLabel("/asset-issues/abc"), "Maintenance");
  assert.equal(resolveProductAreaLabel("/repairs"), "Maintenance");
  assert.equal(resolveProductAreaLabel("/assets"), "Maintenance");
});
