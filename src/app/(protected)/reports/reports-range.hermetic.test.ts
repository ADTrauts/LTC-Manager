import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("canonical Range is explicit and does not replace Day default", () => {
  const page = read("src/app/(protected)/reports/page.tsx");
  const day = read("src/app/(protected)/reports/canonical-review.tsx");
  const range = read("src/app/(protected)/reports/canonical-range-review.tsx");
  const form = read("src/app/(protected)/reports/review-date-form.tsx");
  const nav = read("src/app/(protected)/reports/review-mode-nav.tsx");
  assert.match(page, /start && end && start !== end/);
  assert.match(page, /loadOperationalReviewRange/);
  assert.match(page, /loadOperationalReviewDay/);
  assert.doesNotMatch(page, /params\.mode === "range"/);
  assert.match(day, /ReviewDateForm/);
  assert.doesNotMatch(day, /ReviewScopeNav/);
  assert.match(range, /ReviewDateForm/);
  assert.match(form, /name="start"/);
  assert.match(form, /name="end"/);
  assert.doesNotMatch(form, /Same dates review one day/);
  assert.doesNotMatch(range, /ReviewScopeNav/);
  assert.doesNotMatch(range, /mode" value="range"/);
  assert.match(range, /No operational exceptions were identified for this date range/);
  assert.match(range, /ReviewCard/);
  assert.match(range, /lg:grid-cols-2/);
  assert.doesNotMatch(nav, /id: "range"/);
  assert.doesNotMatch(range, /timesPerDay/);
  assert.doesNotMatch(range, /loadRuntimeLocationStates/);
  assert.doesNotMatch(range, /compliance %/);
});
