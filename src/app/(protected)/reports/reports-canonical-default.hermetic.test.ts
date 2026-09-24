import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("canonical Review uses one facility service date and SPACE filter", () => {
  const page = read("src/app/(protected)/reports/page.tsx");
  const ui = read("src/app/(protected)/reports/canonical-review.tsx");
  const nav = read("src/app/(protected)/reports/review-mode-nav.tsx");
  assert.match(page, /serviceDate: params\.date/);
  assert.match(page, /start && end && start !== end/);
  assert.match(page, /spaceId/);
  assert.match(page, /deptNav\.activeDepartmentId/);
  assert.doesNotMatch(page, /startDate/);
  assert.doesNotMatch(page, /params\.mode === "range"/);
  assert.match(ui, /ReviewDateForm/);
  assert.doesNotMatch(ui, /ReviewScopeNav/);
  assert.match(ui, /ReviewCard/);
  assert.match(ui, /lg:grid-cols-2/);
  assert.match(nav, /Legacy Report/);
  assert.match(nav, /id: "review"/);
});

test("canonical Review page does not switch current day to RLS", () => {
  const page = read("src/app/(protected)/reports/page.tsx");
  assert.match(page, /todayKey: facts\.todayKey/);
  assert.doesNotMatch(page, /loadRuntimeLocationStates/);
  assert.doesNotMatch(page, /loadOperatingLocationBoard/);
  assert.doesNotMatch(page, /loadDashboardRuntime/);
});
