import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("canonical Review composer does not import legacy expected-log math or live RLS", () => {
  const compose = read("src/lib/operational-review/compose-operational-review-day.ts");
  assert.doesNotMatch(compose, /timesPerDay/);
  assert.doesNotMatch(compose, /LogAssignment/);
  assert.doesNotMatch(compose, /LogSubmission/);
  assert.doesNotMatch(compose, /loadRuntimeLocationStates/);
  assert.doesNotMatch(compose, /loadDashboardRuntime/);
  assert.doesNotMatch(compose, /loadOperatingLocationBoard/);
  assert.doesNotMatch(compose, /from "@\/lib\/prisma"/);
  assert.doesNotMatch(compose, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.doesNotMatch(compose, /setHours\(0,\s*0,\s*0,\s*0\)/);
  assert.match(compose, /projectLogExpectationHistory/);
  assert.match(compose, /selectHistoricalCoverageTemplates/);
  assert.match(compose, /evaluateCoverageSlots/);
});

test("canonical Review loader batches domain reads and does not score RLS or Work", () => {
  const loader = read("src/lib/operational-review/load-operational-review-day-facts.ts");
  assert.doesNotMatch(loader, /timesPerDay/);
  assert.doesNotMatch(loader, /logAssignment/);
  assert.doesNotMatch(loader, /loadRuntimeLocationStates/);
  assert.doesNotMatch(loader, /loadDashboardRuntime/);
  assert.doesNotMatch(loader, /loadPublishedWorkPlansForDate/);
  assert.equal([...loader.matchAll(/unitSpace\.findMany/g)].length, 1);
  assert.match(loader, /operationalEvidenceRecord\.findMany/);
  assert.match(loader, /operationalAssignmentTemplate\.findMany/);
  assert.match(loader, /loadPublishedCyclesForDate/);
  assert.match(loader, /Promise\.all/);
});

test("historical coverage selector is distinct from Run isActive selection", () => {
  const publication = read("src/lib/scheduling/coverage-expectations/publication.ts");
  assert.match(publication, /export function selectHistoricalCoverageTemplates/);
  assert.match(publication, /isHistoricalCoverageTemplateEffectiveOnDate/);
  assert.match(publication, /resolveCoveragePublishEffectiveFromKey/);
  const runtimeBlock = publication.slice(
    publication.indexOf("export function isCoverageTemplateEffectiveOnDate"),
    publication.indexOf("export function isHistoricalCoverageTemplateEffectiveOnDate"),
  );
  assert.match(runtimeBlock, /if \(!template\.isActive\) return false/);
});

test("route permissions for /reports remain Manager+", () => {
  const routes = read("src/lib/route-registry/platform-routes.ts");
  const reports = routes.slice(routes.indexOf('pattern: "/reports"'), routes.indexOf('pattern: "/reports"') + 500);
  assert.match(reports, /rolesAtLeast\("MANAGER"\)/);
  assert.doesNotMatch(reports, /rolesAtLeast\("SUPERVISOR"\)/);
});

test("Review presenter and public loader stay isolated from legacy math and RLS", () => {
  const presenter = read("src/lib/operational-review/present-operational-review-day.ts");
  const publicLoader = read("src/lib/operational-review/load-operational-review-day.ts");
  for (const src of [presenter, publicLoader]) {
    assert.doesNotMatch(src, /timesPerDay/);
    assert.doesNotMatch(src, /LogAssignment/);
    assert.doesNotMatch(src, /LogSubmission/);
    assert.doesNotMatch(src, /loadRuntimeLocationStates/);
    assert.doesNotMatch(src, /loadDashboardRuntime/);
    assert.doesNotMatch(src, /from "@\/lib\/prisma"/);
  }
  assert.match(presenter, /presentOperationalReviewDay/);
  assert.match(publicLoader, /loadOperationalReviewDayFacts/);
  assert.match(publicLoader, /composeOperationalReviewDay/);
});

test("canonical Range Review reuses daily composer and stays isolated", () => {
  const compose = read("src/lib/operational-review/compose-operational-review-range.ts");
  const loader = read("src/lib/operational-review/load-operational-review-range.ts");
  const facts = read("src/lib/operational-review/load-operational-review-range-facts.ts");
  const presenter = read("src/lib/operational-review/present-operational-review-range.ts");
  const dates = read("src/lib/operational-review/service-date-range.ts");
  for (const src of [compose, loader, facts, presenter, dates]) {
    assert.doesNotMatch(src, /timesPerDay/);
    assert.doesNotMatch(src, /LogAssignment/);
    assert.doesNotMatch(src, /loadRuntimeLocationStates/);
    assert.doesNotMatch(src, /loadDashboardRuntime/);
    assert.doesNotMatch(src, /toISOString\(\)\.slice\(0,\s*10\)/);
    assert.doesNotMatch(src, /setHours\(0,\s*0,\s*0,\s*0\)/);
  }
  assert.match(loader, /composeOperationalReviewDay/);
  assert.match(loader, /composeOperationalReviewRange/);
  assert.match(facts, /Promise\.all/);
  assert.match(dates, /MAX_REVIEW_RANGE_DAYS = 31/);
});
