import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("draft successor copies scope, locations, parent, and milestone times", () => {
  const service = readFileSync(join(root, "src/lib/operational-cycles/cycle-service.ts"), "utf8");
  assert.match(service, /include:\s*\{[\s\S]*?locations: true,[\s\S]*?milestoneTimes: true,/);
  assert.match(service, /locationMode: source\.locationMode/);
  assert.match(service, /parentStableKey: source\.parentStableKey/);
  assert.match(service, /spaceId: l\.spaceId/);
  assert.match(service, /configuredTime: row\.configuredTime/);
});

test("published cycles remain immutable; only drafts replace child timing rows", () => {
  const service = readFileSync(join(root, "src/lib/operational-cycles/cycle-service.ts"), "utf8");
  assert.match(service, /Only draft cycles can be updated/);
  assert.match(service, /milestoneTimes: \{ deleteMany: \{\}, create: timeRows \}/);
  assert.match(service, /existing\.status !== "DRAFT"/);
});

test("Units builder no longer independently rewrites UnitMealTime", () => {
  const actions = readFileSync(join(root, "src/app/(protected)/units/actions.ts"), "utf8");
  assert.match(actions, /Do not independently rewrite this table/);
  assert.doesNotMatch(actions, /unitMealTime\.deleteMany/);
  assert.doesNotMatch(actions, /unitMealTime\.createMany/);
});
