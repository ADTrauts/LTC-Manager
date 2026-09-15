import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("draft successor copies scope, locations, room type, parent, and milestone times", () => {
  const service = readFileSync(join(root, "src/lib/operational-cycles/cycle-service.ts"), "utf8");
  assert.match(service, /include:\s*\{[\s\S]*?locations: true,[\s\S]*?milestoneTimes: true,/);
  assert.match(service, /roomTypeKey: source\.roomTypeKey/);
  assert.match(service, /parentStableKey: source\.parentStableKey/);
  assert.match(service, /spaceId: l\.spaceId/);
  assert.match(service, /configuredTime: row\.configuredTime/);
});

test("published cycles remain immutable; only drafts replace child timing rows", () => {
  const service = readFileSync(join(root, "src/lib/operational-cycles/cycle-service.ts"), "utf8");
  assert.match(service, /Only draft cycles can be updated/);
  assert.match(service, /departmentOperationalCycleMilestoneTime\.deleteMany/);
  assert.match(service, /existing\.status !== "DRAFT"/);
});

test("migration is conservative UnitMealTime backfill and does not drop the table", () => {
  const sql = readFileSync(
    join(
      root,
      "prisma/migrations/20260813120000_cycle_scope_and_milestone_times/migration.sql",
    ),
    "utf8",
  );
  assert.match(sql, /DepartmentOperationalCycleMilestoneTime/);
  assert.match(sql, /UNIQUE INDEX "DepartmentOperationalCycleMilestoneTime_cycleId_unitId_milestone_key"/);
  assert.match(sql, /ADD VALUE 'ROOM_TYPE'/);
  assert.doesNotMatch(sql, /DROP TABLE "UnitMealTime"/);
  assert.match(sql, /COUNT\(\*\)::int/);
  assert.match(sql, /\) = 1/);
  assert.match(sql, /ON CONFLICT \("cycleId", "unitId", "milestone"\) DO NOTHING/);
  assert.match(sql, /hierarchyRole" IS DISTINCT FROM 'FLOOR'/);
});

test("Units builder no longer independently rewrites UnitMealTime", () => {
  const actions = readFileSync(join(root, "src/app/(protected)/units/actions.ts"), "utf8");
  assert.match(actions, /Do not independently rewrite this table/);
  assert.doesNotMatch(actions, /unitMealTime\.deleteMany/);
  assert.doesNotMatch(actions, /unitMealTime\.createMany/);
});

test("hierarchy migration adds parentStableKey without label-based backfill", () => {
  const sql = readFileSync(
    join(
      root,
      "prisma/migrations/20260813220000_cycle_hierarchy_parent_stable_key/migration.sql",
    ),
    "utf8",
  );
  assert.match(sql, /ADD COLUMN "parentStableKey"/);
  assert.doesNotMatch(sql, /UPDATE.*"parentStableKey"/i);
  assert.doesNotMatch(sql, /Breakfast/);
});

test("additive cycle scope migrations remain ordered", () => {
  const dirs = readdirSync(join(root, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.includes(" "))
    .map((entry) => entry.name)
    .sort();
  const scopeIndex = dirs.indexOf("20260813120000_cycle_scope_and_milestone_times");
  const expectationsIndex = dirs.indexOf("20260813210000_cycle_day_meal_expectations");
  const hierarchyIndex = dirs.indexOf("20260813220000_cycle_hierarchy_parent_stable_key");
  assert.ok(scopeIndex >= 0);
  assert.ok(expectationsIndex > scopeIndex);
  assert.ok(hierarchyIndex > expectationsIndex);
});
