/**
 * Wave E — leftover engines unwired.
 * RLS cycles/evidence do not read Operational Type.
 * Projection scope is responsibility, not Experience keys.
 * Operation engine and Experience shell packages are gone.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("RLS prefetch and compose do not key cycles or evidence off Operational Type", () => {
  const prefetch = source("src/lib/runtime-location-state/prefetch.ts");
  const compose = source("src/lib/runtime-location-state/compose.ts");
  assert.equal(prefetch.includes("loadSpaceOperationalTypeAssignments"), false);
  assert.match(prefetch, /operationalTypeKey: null/);
  assert.match(compose, /locationMode: "EXPLICIT_UNITS"/);
  assert.match(compose, /operationalTypeKey: null/);
  assert.match(compose, /function isServeryPlace/);
  assert.doesNotMatch(compose, /toUpperCase\(\) !== "SERVERY"/);
});

test("Projection actionable rooms come from responsibility, not Experience keys", () => {
  const pipeline = source("src/lib/projection/pipeline.ts");
  assert.match(pipeline, /const actionable = explicitlyResponsible/);
  assert.doesNotMatch(pipeline, /keys\.length > 0 \|\| explicitlyResponsible/);
});

test("Operation engine and Experience shell packages are gone", () => {
  assert.equal(existsSync("src/lib/operations"), false);
  assert.equal(existsSync("src/lib/experience-shell"), false);
  assert.equal(existsSync("src/components/experience-shell"), false);
  assert.equal(existsSync("scripts/sync-operation-instances.ts"), false);
  const flags = source("src/lib/feature-flags.ts");
  assert.equal(flags.includes("isOperationEngineEnabled"), false);
  assert.equal(flags.includes("OPERATION_ENGINE_ENABLED"), false);
  const pkg = source("package.json");
  assert.equal(pkg.includes("db:sync-operation-instances"), false);
  assert.equal(source("src/lib/servery/record-milestone.ts").includes("@/lib/operations"), false);
});

test("applyIndustryPack was never implemented and stays will-not-do", () => {
  const src = [
    source("src/lib/department-administration/baseline.ts"),
    source("docs/platform-vision/RETIRED.md"),
    source("docs/product/10_PRODUCT_ROADMAP.md"),
  ].join("\n");
  assert.doesNotMatch(source("src/lib/department-administration/baseline.ts"), /function applyIndustryPack/);
  assert.match(src, /applyIndustryPack/);
});
