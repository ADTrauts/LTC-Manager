import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("/reports defaults to canonical Review and keeps Legacy Report secondary", () => {
  const page = read("src/app/(protected)/reports/page.tsx");
  assert.match(page, /loadOperationalReviewDay/);
  assert.match(page, /presentOperationalReviewDay/);
  assert.match(page, /params\.view === "legacy"/);
  assert.match(page, /CanonicalReview/);
  assert.match(page, /LegacyReport/);
  assert.doesNotMatch(page, /timesPerDay/);
  assert.doesNotMatch(page, /logAssignment/);
  assert.doesNotMatch(page, /OperationalReviewDayViewModel/);
  assert.doesNotMatch(page, /loadRuntimeLocationStates/);
  assert.doesNotMatch(page, /loadDashboardRuntime/);
});

test("Legacy Report remains labeled and isolated from canonical Review", () => {
  const legacy = read("src/app/(protected)/reports/legacy-report.tsx");
  assert.match(legacy, /Legacy Report/);
  assert.match(legacy, /previous reporting model/);
  assert.match(legacy, /not the new canonical operational Review/);
  assert.match(legacy, /Expected \(legacy\)/);
  assert.match(legacy, /Missing \(legacy\)/);
  assert.match(legacy, /Effective Coverage \(legacy\)/);
  assert.match(legacy, /timesPerDay/);
  assert.match(legacy, /logAssignment/);
  assert.match(legacy, /name="start"/);
  assert.match(legacy, /name="end"/);
  assert.match(legacy, /view" value="legacy"/);
  assert.doesNotMatch(legacy, /canonical compliance/);
  assert.doesNotMatch(legacy, /presentOperationalReviewDay/);
  assert.doesNotMatch(legacy, /loadOperationalReviewDay/);
});

test("canonical Review UI does not consume legacy expected math or Run scoring", () => {
  const ui = read("src/app/(protected)/reports/canonical-review.tsx");
  assert.match(ui, /No operational exceptions were identified for this service day/);
  assert.match(ui, /No operational Review items were found for this service day/);
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
