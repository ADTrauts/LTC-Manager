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
import { adaptProjectionToOperationsCenter } from "@/lib/operations-center/projection";

import {
  adaptProjectionToBusinessWorkspace,
  emptyBusinessWorkspaceScope,
  intersectInputsToProjectedScope,
  resolveAllowedQuickActionIds,
  resolveProjectedCompositionConfig,
} from "@/lib/business-workspace/projection";
import type { BusinessWorkspaceInputs } from "@/lib/business-workspace/load-workspace-inputs";
import { buildQuickActions } from "@/lib/business-workspace/build-quick-actions";
import { buildPerformanceSnapshot } from "@/lib/business-workspace/build-performance-snapshot";
import { canAccessBusinessWorkspace } from "@/lib/business-workspace/workspace-permissions";
import {
  applyWorkspacePreferences,
  emptyWorkspacePreferenceState,
} from "@/lib/business-workspace/workspace-preferences";

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

function stubInputs(
  overrides: Partial<BusinessWorkspaceInputs> = {},
): BusinessWorkspaceInputs {
  return {
    facilityId: "fac_1",
    facilityName: "Test",
    facilityTimezone: "America/New_York",
    now: new Date("2026-07-17T12:00:00Z"),
    operationalTime: {
      facilityTimezone: "America/New_York",
      facilityLocalDate: "2026-07-17",
      facilityLocal: { year: 2026, month: 7, day: 17, hour: 8, minute: 0 },
      mealType: null,
      mealLabel: null,
      operationPhase: null,
      scheduledStartLocal: null,
      minutesUntilService: null,
    } as BusinessWorkspaceInputs["operationalTime"],
    dashboard: {
      month: 7,
      managerCount: 1,
      birthdaysThisMonth: [],
      unitCount: 2,
      mealBoards: [],
      totals: { expected: 2, completed: 1, failed: 0, missed: 0, pending: 1 },
      unitsWithExceptions: [
        {
          id: "unit_kensington",
          name: "Kensington",
          unitType: "SERVERY",
          hasDietary: true,
          expected: 1,
          completed: 0,
          failed: 0,
          missed: 0,
          pending: 1,
          mealTimes: [],
          staffingCount: 0,
          openRepairCount: 0,
        },
        {
          id: "unit_not_projected",
          name: "Other",
          unitType: "SERVERY",
          hasDietary: true,
          expected: 1,
          completed: 0,
          failed: 1,
          missed: 0,
          pending: 0,
          mealTimes: [],
          staffingCount: 0,
          openRepairCount: 2,
        },
      ],
      unitsMissingStaffing: [
        {
          id: "unit_kensington",
          name: "Kensington",
          unitType: "SERVERY",
          hasDietary: true,
          expected: 1,
          completed: 0,
          failed: 0,
          missed: 0,
          pending: 1,
          mealTimes: [],
          staffingCount: 0,
          openRepairCount: 0,
        },
        {
          id: "unit_not_projected",
          name: "Other",
          unitType: "SERVERY",
          hasDietary: true,
          expected: 1,
          completed: 0,
          failed: 0,
          missed: 0,
          pending: 0,
          mealTimes: [],
          staffingCount: 0,
          openRepairCount: 0,
        },
      ],
      unitCards: [],
      openRepairCount: 2,
      urgentRepairCount: 1,
      operationContext: {
        mealType: "LUNCH",
        mealLabel: "Lunch",
        serviceLabel: "Lunch",
        phase: "Preparation",
        scheduledTimeLabel: null,
        minutesUntilService: null,
      },
      sitePulse: {
        headline: "x",
        tone: "blocked",
        ready: 0,
        inProgress: 0,
        blocked: 1,
        attentionCount: 1,
        locationSummary: "",
      },
    },
    readiness: {
      items: [
        {
          unitId: "unit_kensington",
          unitName: "Kensington",
          state: "blocked",
          reason: "staffing",
          profileKey: "DIETARY",
        },
        {
          unitId: "unit_not_projected",
          unitName: "Other",
          state: "blocked",
          reason: "off",
          profileKey: "DIETARY",
        },
      ],
      summary: { ready: 0, inProgress: 0, blocked: 2, total: 2 },
      byUnitId: new Map(),
    } as unknown as BusinessWorkspaceInputs["readiness"],
    callDownSummary: { total: 0, open: 0, covered: 0 },
    openRepairs: [
      {
        id: "r1",
        unitId: "unit_kensington",
        title: "Oven",
        priority: "URGENT",
        status: "OPEN",
        workOrderKind: "CORRECTIVE",
        dueAt: null,
        unitName: "Kensington",
        departmentKey: "DIETARY",
      },
      {
        id: "r2",
        unitId: "unit_not_projected",
        title: "Other",
        priority: "URGENT",
        status: "OPEN",
        workOrderKind: "CORRECTIVE",
        dueAt: null,
        unitName: "Other",
        departmentKey: "DIETARY",
      },
    ],
    inspectionsDue: [
      {
        id: "i1",
        definitionId: "d1",
        definitionName: "Sanitation",
        unitId: "unit_kensington",
        unitName: "Kensington",
        dueAt: new Date(),
        overdue: true,
        departmentKey: "DIETARY",
      },
      {
        id: "i2",
        definitionId: "d2",
        definitionName: "Off",
        unitId: "unit_not_projected",
        unitName: "Other",
        dueAt: new Date(),
        overdue: true,
        departmentKey: "DIETARY",
      },
    ],
    activeDepartmentKeys: ["DIETARY", "EVS", "PLANT"],
    activity: {
      repairsOpened: [
        {
          id: "r1",
          title: "Oven",
          priority: "URGENT",
          status: "OPEN",
          unitName: "Kensington",
          departmentKey: "DIETARY",
          at: new Date(),
        },
        {
          id: "r2",
          title: "Off",
          priority: "URGENT",
          status: "OPEN",
          unitName: "Other",
          departmentKey: "EVS",
          at: new Date(),
        },
      ],
      repairsResolved: [],
      inspectionsCompleted: [],
      knowledgePublished: [],
    },
    ...overrides,
  };
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
  assert.ok(scope.allowedQuickActionIds.includes("evs-board"));
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
  assert.equal(canAccessBusinessWorkspace("LEAD"), false);
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

test("10. Input intersection never broadens beyond Projection", () => {
  const scope = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  const scoped = intersectInputsToProjectedScope(stubInputs(), scope);
  assert.ok(
    scoped.readiness.items.every((i) =>
      scope.projectedUnitIds.includes(i.unitId),
    ),
  );
  assert.ok(
    !scoped.openRepairs.some((r) => r.unitId === "unit_not_projected"),
  );
  assert.ok(
    !scoped.dashboard.unitsMissingStaffing.some(
      (u) => u.id === "unit_not_projected",
    ),
  );
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

test("12. Performance metrics — logs hidden without compliance contributor", () => {
  const plant = adaptProjectionToBusinessWorkspace(PLANT_GOLDEN_PROJECTION);
  const config = resolveProjectedCompositionConfig(plant);
  const metrics = buildPerformanceSnapshot(stubInputs(), config);
  assert.ok(!metrics.some((m) => m.id === "due-compliance"));
});

test("13. Dietary performance may show log completion when projected", () => {
  const dietary = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  const config = resolveProjectedCompositionConfig(dietary);
  if (dietary.showLogCompletion) {
    const metrics = buildPerformanceSnapshot(stubInputs(), config);
    assert.ok(metrics.some((m) => m.id === "due-compliance"));
  }
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
  const prefs = {
    ...emptyWorkspacePreferenceState(),
    hiddenSectionIds: ["performance"] as const,
    sectionOrder: ["bogus", "manager_focus"] as unknown as string[],
  };
  const composed = applyWorkspacePreferences({
    role: "MANAGER",
    preferences: prefs,
  });
  assert.ok(!composed.sectionOrder.includes("bogus"));
  assert.ok(composed.visibleSections.includes("manager_focus"));
});

test("16. Flag off distinct from OC / Today's Work flags", () => {
  withEnv("PROJECTION_OPERATIONS_CENTER_ENABLED", "true", () => {
    withEnv("PROJECTION_TODAYS_WORK_ENABLED", "true", () => {
      withEnv("PROJECTION_BUSINESS_WORKSPACE_ENABLED", undefined, () => {
        assert.equal(isProjectionBusinessWorkspaceEnabled(), false);
      });
    });
  });
});

test("17. Scope parity with Today’s Work / OC on same snapshot", () => {
  const bw = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  const tw = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  const oc = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  assert.deepEqual(
    [...bw.projectedUnitIds].sort(),
    [...tw.projectedUnitIds].sort(),
  );
  assert.deepEqual(
    [...bw.projectedUnitIds].sort(),
    [...oc.projectedUnitIds].sort(),
  );
});

test("18. Compatibility quick-action mapping retained for assets/evs", () => {
  const ids = resolveAllowedQuickActionIds(
    adaptProjectionToBusinessWorkspace(EVS_GOLDEN_PROJECTION)
      .managerSignalContributors,
  );
  assert.ok(ids.includes("evs-board"));
  assert.ok(ids.includes("todays-work"));
});

test("19. Activity intersection drops off-projection department noise", () => {
  const scope = adaptProjectionToBusinessWorkspace(DIETARY_GOLDEN_PROJECTION);
  const scoped = intersectInputsToProjectedScope(stubInputs(), scope);
  assert.ok(
    scoped.activity.repairsOpened.every(
      (r) => r.departmentKey === "DIETARY" || r.departmentKey == null,
    ),
  );
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
          handle.href.startsWith("/evs") ||
          handle.href.startsWith("/admin/") ||
          handle.href.startsWith("/dashboard") ||
          handle.href.startsWith("/unit/"),
      );
    }
  }
});
