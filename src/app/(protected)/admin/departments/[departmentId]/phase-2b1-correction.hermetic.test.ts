import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Overview identity appears once — panel does not repeat department name header", () => {
  const overview = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/overview-panel.tsx",
    ),
    "utf8",
  );
  assert.match(overview, /Department Manager/);
  assert.match(overview, /Configuration/);
  assert.doesNotMatch(overview, /<h2[^>]*>\{department\.name\}<\/h2>/);
  assert.match(overview, /View locations →/);
});

test("Locations hierarchy presents Floor → Neighborhood → Room", () => {
  const locations = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx",
    ),
    "utf8",
  );
  assert.match(locations, /DepartmentLocationTree/);
  assert.match(locations, /Manage responsibility/);
  assert.match(locations, /department-locations-header/);
  assert.doesNotMatch(locations, /locationCoverage\.total/);
  assert.doesNotMatch(locations, /Room · /);
});

test("Teams rows are catalog objects with chevron navigation", () => {
  const teams = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/teams-workspace.tsx",
    ),
    "utf8",
  );
  assert.match(teams, /team-row/);
  assert.match(teams, /Manager not assigned/);
  assert.match(teams, /\+ Add Team/);
  assert.match(teams, /›/);
});

test("TemporalStrip empty Period skips blank rail", () => {
  const strip = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/cycle-period-temporal-strip.tsx",
    ),
    "utf8",
  );
  assert.match(strip, /cycle-temporal-strip-empty/);
  assert.match(strip, /No phases or key times yet/);
  assert.match(strip, /hasTimelineContent/);
});

test("TemporalStrip visual language uses time rail primitive", () => {
  const ui = readFileSync(
    join(process.cwd(), "src/components/design-system/TemporalStrip.tsx"),
    "utf8",
  );
  assert.match(ui, /temporal-strip-rail/);
  assert.match(ui, /temporal-point-marker/);
  assert.match(ui, /operational instrument/);
});

test("zero-change Draft does not say Ready to publish", () => {
  const review = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/cycles-review-publish.tsx",
    ),
    "utf8",
  );
  assert.match(review, /No changes to publish/);
  assert.match(review, /DiscardAllDraftsButton/);
  assert.match(review, /data-review-ready=\{noChanges \? "no-changes"/);
});

test("Current lifecycle uses Retire via action menu, not Delete", () => {
  const panel = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/cycles-panel.tsx",
    ),
    "utf8",
  );
  assert.match(panel, /edit-current/);
  assert.match(panel, /retire-current/);
  assert.doesNotMatch(panel, /delete-draft-root/);
});
