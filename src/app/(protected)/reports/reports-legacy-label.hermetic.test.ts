import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("/reports opens Audit / Reports and leaves the legacy view", () => {
  const page = read("src/app/(protected)/reports/page.tsx");
  assert.match(page, /loadOperationalReviewDay/);
  assert.match(page, /presentOperationalReviewDay/);
  assert.match(page, /params\.view === "legacy"/);
  assert.match(page, /CanonicalReview/);
  assert.match(page, /redirect\(query \? `\/reports\?\$\{query\}` : "\/reports"\)/);
  assert.doesNotMatch(page, /<LegacyReport/);
  assert.doesNotMatch(page, /legacy-report/);
  assert.doesNotMatch(page, /timesPerDay/);
  assert.doesNotMatch(page, /logAssignment/);
  assert.doesNotMatch(page, /OperationalReviewDayViewModel/);
  assert.match(page, /loadRuntimeLocationStates/);
  assert.doesNotMatch(page, /loadDashboardRuntime/);
});

test("canonical Review UI does not consume legacy expected math or Run scoring", () => {
  const ui = read("src/app/(protected)/reports/canonical-review.tsx");
  assert.match(ui, /No operational exceptions were identified for this service day/);
  assert.match(ui, /No Audit \/ Reports items were found for this service day/);
  assert.match(ui, /Historical expectation unavailable/);
  assert.match(ui, /Staffing & Coverage/);
  assert.match(ui, /ReviewDateForm/);
  assert.doesNotMatch(ui, /timesPerDay/);
  assert.doesNotMatch(ui, /logAssignment/);
  assert.doesNotMatch(ui, /LogSubmission/);
  assert.doesNotMatch(ui, /ReviewScopeNav/);
  assert.doesNotMatch(ui, /Site Pulse/);
  assert.doesNotMatch(ui, /loadRuntimeLocationStates/);
  assert.doesNotMatch(ui, /compliance %/);
});
