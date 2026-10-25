import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("creating a Request does not create an Issue record", () => {
  const source = readFileSync(new URL("./request-service.ts", import.meta.url), "utf8");
  assert.match(source, /not create an AssetIssue/);
  assert.doesNotMatch(source, /assetIssue\.create/);
});

test("reporting an Issue does not create a Request", () => {
  const source = readFileSync(
    new URL("../asset-operations/issue-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /not a Request and not a Work Order/);
  assert.match(source, /export async function reportIssue/);
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

test("the old issues address is gone and repair copy is not an Issue store", () => {
  assert.equal(existsSync("src/app/(protected)/issues/page.tsx"), false);
  assert.equal(existsSync("src/app/(protected)/issues/actions.ts"), false);
  const copy = readFileSync(new URL("../work/issues/issue-copy.ts", import.meta.url), "utf8");
  assert.match(copy, /not canonical Issue/);
});
