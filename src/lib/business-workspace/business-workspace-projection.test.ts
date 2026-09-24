/**
 * Wave 15K — Business Workspace Projection cutover tests.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isProjectionBusinessWorkspaceEnabled } from "@/lib/feature-flags";
import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
} from "@/lib/projection";
import { adaptProjectionToTodaysWork } from "@/lib/todays-work/projection";

import {
  adaptProjectionToBusinessWorkspace,
  emptyBusinessWorkspaceScope,
  resolveAllowedQuickActionIds,
  resolveProjectedCompositionConfig,
} from "@/lib/business-workspace/projection";
import { buildQuickActions } from "@/lib/business-workspace/build-quick-actions";
import { canAccessBusinessWorkspace } from "@/lib/business-workspace/workspace-permissions";
import {
  applyWorkspacePreferences,
  emptyWorkspacePreferenceState,
} from "@/lib/business-workspace/workspace-preferences";
import type { WorkspacePreferenceState } from "@/lib/business-workspace/types";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("1. PROJECTION_BUSINESS_WORKSPACE_ENABLED defaults to false", () => {
  withEnv("PROJECTION_BUSINESS_WORKSPACE_ENABLED", undefined, () => {
    assert.equal(isProjectionBusinessWorkspaceEnabled(), false);
  });
  withEnv("PROJECTION_BUSINESS_WORKSPACE_ENABLED", "true", () => {
    assert.equal(isProjectionBusinessWorkspaceEnabled(), true);
  });
});

test("2. Dietary manager Workspace — Experiences and Units", () => {
  const scope = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  assert.equal(scope.lensMode, "DEPARTMENT");
  assert.equal(scope.departmentKey, "DIETARY");
  assert.ok(scope.projectedUnitIds.includes("unit_kensington"));
  assert.ok(scope.projectedExperienceKeys.includes("MEAL_SERVICE"));
  assert.ok(scope.allowedQuickActionIds.includes("operations-center"));
  assert.ok(scope.showLogCompletion || scope.showMealContext);
});

test("3. EVS — no Dietary meal Experiences / meal boards", () => {
  const scope = adaptProjectionToBusinessWorkspace(EVS_GOLDEN_PROJECTION);
  assert.ok(!scope.projectedExperienceKeys.includes("MEAL_SERVICE"));
  assert.equal(scope.showMealContext, false);
  // EVS board route is deferred: cleaning Experiences must not emit an evs-board quick action.
  assert.ok(!scope.allowedQuickActionIds.includes("evs-board"));
});

test("4. Plant — policy without fake assignments; no meal/EVS cleaning", () => {
  const scope = adaptProjectionToBusinessWorkspace(PLANT_GOLDEN_PROJECTION);
  assert.equal(scope.plantPolicy?.createsRoomAssignments, false);
  assert.ok(!scope.projectedExperienceKeys.includes("MEAL_SERVICE"));
  assert.ok(!scope.projectedExperienceKeys.includes("ROOM_CLEANING"));
  assert.ok(scope.allowedQuickActionIds.includes("assets"));
  assert.ok(!scope.allowedQuickActionIds.includes("evs-board"));
  assert.ok(!scope.allowedQuickActionIds.includes("logs"));
});

test("5. Facility Overview — labeled department sections", () => {
  const scope = adaptProjectionToBusinessWorkspace(
    FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  );
  assert.equal(scope.lensMode, "FACILITY");
  assert.ok(scope.departmentSections.every((s) => s.label != null));
  assert.ok(scope.departmentSections.length >= 1);
});

test("6. Staff/Lead denied; Manager/Supervisor allowed", () => {
  assert.equal(canAccessBusinessWorkspace("STAFF"), false);
  assert.equal(canAccessBusinessWorkspace("LEAD_TEAM_MEMBER"), false);
  assert.equal(canAccessBusinessWorkspace("SUPERVISOR"), true);
  assert.equal(canAccessBusinessWorkspace("MANAGER"), true);
});

test("7. Projection failure fails closed", () => {
  const scope = emptyBusinessWorkspaceScope("fac_1", "boom");
  assert.equal(scope.error, "boom");
  assert.equal(scope.projectedUnitIds.length, 0);
  assert.equal(scope.allowedQuickActionIds.length, 0);
});

test("8. Empty Projection — calm zero contributions", () => {
  const scope = adaptProjectionToBusinessWorkspace({
    ...DIETARY_GOLDEN_PROJECTION,
    locations: { roots: [], actionableIds: [], byId: {} },
    areas: [],
    experiences: [],
  });
  assert.equal(scope.projectedUnitIds.length, 0);
  assert.equal(scope.managerSignalContributors.length, 0);
});

test("9. Area and Experience order preserved", () => {
  const scope = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  const areas = scope.departmentSections[0]?.areas ?? [];
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i]!.order >= areas[i - 1]!.order);
  }
});

test("11. Quick actions from Projection — Plant has assets not logs", () => {
  const plant = adaptProjectionToBusinessWorkspace(PLANT_GOLDEN_PROJECTION);
  const config = resolveProjectedCompositionConfig(plant);
  const actions = buildQuickActions({
    config,
    context: {
      mode: "department",
      departmentId: "d1",
      departmentKey: "PLANT",
      departmentName: "Plant",
    },
  });
  assert.ok(actions.some((a) => a.id === "assets"));
  assert.ok(!actions.some((a) => a.id === "logs"));
  assert.ok(!actions.some((a) => a.id === "evs-board"));
});

test("14. Permissions narrowing — actions subset", () => {
  const full = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  const narrow = adaptProjectionToBusinessWorkspace(
    PERMISSION_NARROWED_PROJECTION,
  );
  const fullMeal = full.managerSignalContributors.find(
    (e) => e.experienceKey === "MEAL_SERVICE",
  );
  const narrowMeal = narrow.managerSignalContributors.find(
    (e) => e.experienceKey === "MEAL_SERVICE",
  );
  assert.ok(fullMeal && narrowMeal);
  for (const action of narrowMeal.actions) {
    assert.ok(narrowMeal.allowedActionKeys.includes(action.key));
  }
});

test("15. Preferences cannot invent sections outside role allowlist", () => {
  // "bogus" is deliberately not a WorkspaceSectionId: the allowlist must drop it.
  const prefs = {
    ...emptyWorkspacePreferenceState(),
    hiddenSectionIds: ["performance"],
    sectionOrder: ["bogus", "manager_focus"],
  } as unknown as WorkspacePreferenceState;
  const composed = applyWorkspacePreferences({
    role: "MANAGER",
    preferences: prefs,
  });
  assert.ok(!(composed.sectionOrder as string[]).includes("bogus"));
  assert.ok(composed.visibleSections.includes("manager_focus"));
});

test("16. Flag off distinct from Today's Work flag", () => {
  withEnv("PROJECTION_TODAYS_WORK_ENABLED", "true", () => {
    withEnv("PROJECTION_BUSINESS_WORKSPACE_ENABLED", undefined, () => {
      assert.equal(isProjectionBusinessWorkspaceEnabled(), false);
    });
  });
});

test("17. Scope parity with Today’s Work on same snapshot", () => {
  const bw = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  const tw = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  assert.deepEqual(
    [...bw.projectedUnitIds].sort(),
    [...tw.projectedUnitIds].sort(),
  );
});

test("18. Compatibility quick-action mapping omits the deferred EVS board", () => {
  const ids = resolveAllowedQuickActionIds(
    adaptProjectionToBusinessWorkspace(EVS_GOLDEN_PROJECTION)
      .managerSignalContributors,
  );
  assert.ok(!ids.includes("evs-board"));
  assert.ok(ids.includes("todays-work"));
});

test("20. Destination handles stay on existing routes", () => {
  const scope = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  for (const handle of scope.destinationHandles) {
    if (handle.href) {
      assert.ok(
        handle.href.startsWith("/today") ||
          handle.href.startsWith("/assets") ||
          handle.href.startsWith("/logs") ||
          handle.href.startsWith("/issues") ||
          handle.href.startsWith("/admin/") ||
          handle.href.startsWith("/dashboard") ||
          handle.href.startsWith("/unit/"),
      );
    }
  }
});
