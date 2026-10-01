import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Today's Work loads expected Work from the canonical resolver, not a second engine", () => {
  const page = read("src/app/(protected)/today/page.tsx");
  const load = read("src/lib/todays-work/expected-work/load-expected-work.ts");
  const present = read("src/lib/todays-work/expected-work/present-expected-work.ts");
  assert.match(page, /loadTodaysExpectedWork/);
  assert.match(page, /TodaysWorkExpectedWork/);
  assert.match(load, /resolveUnitWorkRequirements/);
  assert.match(load, /presentExpectedWorkFromRequirements/);
  assert.match(present, /WorkRequirement/);
  assert.doesNotMatch(present, /from "@\/lib\/prisma"/);
  assert.doesNotMatch(load, /isDepartmentJobFlowEnabled|isDietaryJobFlowEnabled|DIETARY_JOB_FLOW/);
  assert.doesNotMatch(page, /isDepartmentJobFlowEnabled|isDietaryJobFlowEnabled/);
  assert.doesNotMatch(page, /UNASSIGNED_WORK|FAILED_WORK|Servery Ready|Meal Started/);
  assert.doesNotMatch(load, /if \(department === ["']DIETARY["']\)|key === ["']DIETARY["']/);
});

test("Review isolation remains: Review does not consume Today expected Work", () => {
  const compose = read("src/lib/operational-review/compose-operational-review-day.ts");
  const facts = read("src/lib/operational-review/load-operational-review-day-facts.ts");
  const publicLoader = read("src/lib/operational-review/load-operational-review-day.ts");
  for (const src of [compose, facts, publicLoader]) {
    assert.doesNotMatch(src, /loadTodaysExpectedWork/);
    assert.doesNotMatch(src, /presentExpectedWorkFromRequirements/);
    assert.doesNotMatch(src, /resolveUnitWorkRequirements/);
  }
});
