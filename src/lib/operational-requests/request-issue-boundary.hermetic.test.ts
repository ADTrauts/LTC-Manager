import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("creating a Request does not create an Issue record", () => {
  const source = readFileSync(new URL("./request-service.ts", import.meta.url), "utf8");
  assert.match(source, /not create an AssetIssue/);
  assert.doesNotMatch(source, /assetIssue\.create/);
});

test("reporting an AssetIssue is not equivalent to creating a Request", () => {
  const source = readFileSync(
    new URL("../asset-operations/issue-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /not a Request and not a Work Order/);
  assert.doesNotMatch(source, /operationalRequest\.create/);
});

test("legacy unit issue action persists Repair, not canonical Issue", () => {
  const source = readFileSync(
    new URL("../../app/(protected)/unit/[unitId]/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /Persists as Repair \(Work Order\), not AssetIssue/);
  assert.match(source, /prisma\.repair\.create/);
  assert.doesNotMatch(source, /prisma\.assetIssue\.create/);
});

test("/issues compatibility path is not Issue domain authority", () => {
  const page = readFileSync(
    new URL("../../app/(protected)/issues/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /Compatibility path only/);
  assert.match(page, /redirect\("\/repairs"\)/);
  const copy = readFileSync(new URL("../work/issues/issue-copy.ts", import.meta.url), "utf8");
  assert.match(copy, /not canonical Issue/);
  assert.match(copy, /not domain authority/);
});
