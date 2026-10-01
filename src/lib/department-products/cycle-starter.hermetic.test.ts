import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildDietaryDefaultCyclePlans, buildEvsDefaultCyclePlans } from "@/lib/operational-cycles/defaults";
import { dietaryStarterWouldCreateCount } from "@/lib/operational-cycles/dietary-starter";

import {
  cycleStarterWouldCreateCount,
  resolveCycleStarterForDepartmentProduct,
} from "./cycle-starter";
import { getDepartmentProduct } from "./registry";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("Department Product cycle starters", () => {
  it("resolves Dietary and EVS from the product registry, not UI key checks", () => {
    const dietary = resolveCycleStarterForDepartmentProduct("DIETARY");
    assert.ok(dietary);
    assert.equal(dietary.kind, "dietary");
    assert.equal(dietary.actionLabel, "Use Dietary operating rhythm");
    assert.deepEqual(
      dietary.preview.map((root) => root.label),
      ["Breakfast", "Lunch", "Dinner"],
    );

    const evs = resolveCycleStarterForDepartmentProduct("EVS");
    assert.ok(evs);
    assert.equal(evs.kind, "evs");
    assert.equal(evs.actionLabel, "Use EVS operating rhythm");
    assert.deepEqual(
      evs.preview.map((root) => root.label),
      ["Morning Operations", "Afternoon Operations", "Evening Operations"],
    );
    assert.deepEqual(evs.preview.map((root) => root.stableKey), [
      "morning_routine",
      "day_cleaning",
      "evening_closeout",
    ]);
  });

  it("does not invent a Plant operating rhythm", () => {
    assert.equal(getDepartmentProduct("PLANT")?.starters.cycleStarter, undefined);
    assert.equal(resolveCycleStarterForDepartmentProduct("PLANT"), null);
    assert.equal(resolveCycleStarterForDepartmentProduct("LAUNDRY"), null);
  });

  it("is stable-key idempotent and does not recreate renamed keys", () => {
    const allDietary = new Set(buildDietaryDefaultCyclePlans().map((plan) => plan.stableKey));
    assert.equal(cycleStarterWouldCreateCount("dietary", allDietary), 0);
    assert.equal(dietaryStarterWouldCreateCount(new Set(["breakfast"])), cycleStarterWouldCreateCount("dietary", new Set(["breakfast"])));

    const renamed = new Set(["breakfast", "lunch", "dinner"]);
    const remaining = cycleStarterWouldCreateCount("dietary", renamed);
    assert.ok(remaining > 0);
    assert.equal(
      remaining,
      buildDietaryDefaultCyclePlans().filter((plan) => !renamed.has(plan.stableKey)).length,
    );

    const allEvs = new Set(buildEvsDefaultCyclePlans().map((plan) => plan.stableKey));
    assert.equal(cycleStarterWouldCreateCount("evs", allEvs), 0);
    assert.equal(cycleStarterWouldCreateCount("evs", new Set()), buildEvsDefaultCyclePlans().length);
  });

  it("keeps starter application on the mounted Teams path and does not remount CyclesPanel", () => {
    const page = source("src/app/(protected)/admin/departments/[departmentId]/page.tsx");
    const workspace = source("src/app/(protected)/admin/departments/[departmentId]/teams-workspace.tsx");
    const panel = source("src/app/(protected)/admin/departments/[departmentId]/operating-rhythm-panel.tsx");
    const resolver = source("src/lib/department-products/cycle-starter.ts");
    const actions = source("src/app/(protected)/admin/departments/[departmentId]/cycle-actions.ts");
    assert.doesNotMatch(page, /CyclesPanel/);
    assert.match(workspace, /OperatingRhythmPanel/);
    assert.doesNotMatch(workspace, /Dietary|EVS|Plant/);
    assert.match(panel, /applyProductCycleStarterAction/);
    assert.match(panel, /makeOperatingRhythmLiveAction/);
    assert.match(resolver, /They will not be used in Run until you make them live/);
    assert.match(actions, /resolveCycleStarterForDepartmentProduct/);
    assert.doesNotMatch(panel, /if \(departmentKey === ["']EVS["']\)/);
  });

  it("reuses existing publish and starter services without a new engine", () => {
    const actions = source("src/app/(protected)/admin/departments/[departmentId]/cycle-actions.ts");
    assert.match(actions, /export async function applyProductCycleStarterAction/);
    assert.match(actions, /export async function makeOperatingRhythmLiveAction/);
    assert.match(actions, /generateDietaryDefaultsDrafts/);
    assert.match(actions, /generateEvsDefaultsDrafts/);
    assert.match(actions, /scheduleDraftPublications/);
    assert.match(actions, /minimumPublishEffectiveFrom/);
  });
});
