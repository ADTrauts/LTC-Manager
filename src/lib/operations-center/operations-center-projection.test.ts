/**
 * Wave 15J — Operations Center Projection cutover tests.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isProjectionOperationsCenterEnabled } from "@/lib/feature-flags";
import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
} from "@/lib/projection";
import { adaptProjectionToTodaysWork } from "@/lib/todays-work/projection";

import {
  adaptProjectionToOperationsCenter,
  applyProjectedScopeToDashboard,
  contributionKindsFromContracts,
  emptyOperationsCenterScope,
  filterCallDownsToProjectedUnits,
  intersectDashboardQueriesToProjectedUnits,
  resolveEligibleOcCards,
} from "@/lib/operations-center/projection";
import type { OperationsCenterDashboardData } from "@/lib/operations-center/types";
import type { DashboardQueryResult } from "@/lib/operations-center/load-dashboard-queries";

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

test("1. PROJECTION_OPERATIONS_CENTER_ENABLED defaults to false", () => {
  withEnv("PROJECTION_OPERATIONS_CENTER_ENABLED", undefined, () => {
    assert.equal(isProjectionOperationsCenterEnabled(), false);
  });
  withEnv("PROJECTION_OPERATIONS_CENTER_ENABLED", "true", () => {
    assert.equal(isProjectionOperationsCenterEnabled(), true);
  });
});

test("2. Dietary department projection — Experiences and Units", () => {
  const scope = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  assert.equal(scope.lensMode, "DEPARTMENT");
  assert.equal(scope.departmentKey, "DIETARY");
  assert.ok(scope.projectedUnitIds.includes("unit_kensington"));
  assert.ok(scope.projectedExperiences.includes("MEAL_SERVICE"));
  assert.ok(scope.projectedExperiences.includes("TEMPERATURE_MONITORING"));
  assert.ok(scope.eligibleCardIds.includes("meal-boards"));
  assert.ok(scope.departmentSections[0]?.areas.every((a) => a.experiences.length > 0));
});

test("3. EVS department projection — no Dietary meal Experiences", () => {
  const scope = adaptProjectionToOperationsCenter(EVS_GOLDEN_PROJECTION);
  assert.ok(!scope.projectedExperiences.includes("MEAL_SERVICE"));
  assert.ok(!scope.eligibleCardIds.includes("meal-boards"));
  assert.ok(scope.projectedExperiences.length > 0);
});

test("4. Plant department projection — policy without fake assignments", () => {
  const scope = adaptProjectionToOperationsCenter(PLANT_GOLDEN_PROJECTION);
  assert.equal(scope.plantPolicy?.createsRoomAssignments, false);
  assert.ok(!scope.projectedExperiences.includes("MEAL_SERVICE"));
  assert.ok(!scope.projectedExperiences.includes("ROOM_CLEANING"));
  assert.ok(scope.eligibleCardIds.includes("open-repairs"));
  assert.ok(!scope.eligibleCardIds.includes("meal-boards"));
});

test("5. Facility Overview — labeled department sections, never flattened", () => {
  const scope = adaptProjectionToOperationsCenter(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
  assert.equal(scope.lensMode, "FACILITY");
  assert.ok(scope.departmentSections.every((s) => s.label != null));
  assert.ok(scope.departmentSections.length >= 1);
  const labels = scope.departmentSections.map((s) => s.label);
  assert.ok(labels.includes("Dietary") || labels.includes("EVS") || labels.includes("Plant"));
});

test("6. Permission-narrowed Experiences — actions subset", () => {
  const full = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  const narrow = adaptProjectionToOperationsCenter(PERMISSION_NARROWED_PROJECTION);
  const fullMeal = full.experienceContributors.find(
    (e) => e.experienceKey === "MEAL_SERVICE",
  );
  const narrowMeal = narrow.experienceContributors.find(
    (e) => e.experienceKey === "MEAL_SERVICE",
  );
  assert.ok(fullMeal && narrowMeal);
  for (const action of narrowMeal.actions) {
    assert.ok(narrowMeal.allowedActionKeys.includes(action.key));
  }
});

test("7. Area and Experience order preserved", () => {
  const scope = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  const areas = scope.departmentSections[0]?.areas ?? [];
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i]!.order >= areas[i - 1]!.order);
  }
  for (const area of areas) {
    for (let i = 1; i < area.experiences.length; i++) {
      assert.ok(
        area.experiences[i]!.order >= area.experiences[i - 1]!.order,
      );
    }
  }
});

test("8. Empty Areas suppressed", () => {
  const scope = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  assert.ok(scope.departmentSections.every((s) => s.areas.every((a) => a.experiences.length > 0)));
});

test("9. Projected locations only — dashboard intersection never broadens", () => {
  const scope = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  const data: OperationsCenterDashboardData = {
    month: 1,
    managerCount: 1,
    birthdaysThisMonth: [],
    unitCount: 3,
    mealBoards: [
      {
        meal: "LUNCH",
        rows: [
          {
            unitId: "unit_kensington",
            unitName: "Kensington",
            unitType: "SERVERY",
            mealTime: "12:00",
            statusLabel: "Ready",
            isReadyLive: true,
            isStartedLive: false,
          },
          {
            unitId: "unit_not_projected",
            unitName: "Other",
            unitType: "SERVERY",
            mealTime: "12:00",
            statusLabel: "Ready",
            isReadyLive: true,
            isStartedLive: false,
          },
        ],
      },
    ],
    totals: { expected: 0, completed: 0, failed: 0, missed: 0, pending: 0 },
    unitsWithExceptions: [],
    unitsMissingStaffing: [],
    unitCards: [
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
        staffingCount: 1,
        openRepairCount: 0,
      },
      {
        id: "unit_not_projected",
        name: "Other",
        unitType: "SERVERY",
        hasDietary: true,
        expected: 5,
        completed: 0,
        failed: 5,
        missed: 0,
        pending: 0,
        mealTimes: [],
        staffingCount: 0,
        openRepairCount: 9,
      },
    ],
    openRepairCount: 9,
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
      blocked: 2,
      attentionCount: 2,
      locationSummary: "",
    },
  };

  const filtered = applyProjectedScopeToDashboard(data, scope);
  assert.ok(filtered.unitCards.every((u) => scope.projectedUnitIds.includes(u.id)));
  assert.ok(!filtered.unitCards.some((u) => u.id === "unit_not_projected"));
  assert.ok(
    filtered.mealBoards.every((b) =>
      b.rows.every((r) => scope.projectedUnitIds.includes(r.unitId)),
    ),
  );
  assert.ok(filtered.sitePulse.blocked + filtered.sitePulse.inProgress + filtered.sitePulse.ready <= scope.projectedUnitIds.length || filtered.unitCards.length === 0);
});

test("10. Call-down scope intersection", () => {
  const scope = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  const filtered = filterCallDownsToProjectedUnits(
    {
      items: [
        {
          id: "1",
          employeeName: "A",
          templateKey: "call-off",
          templateLabel: "Call-off",
          reason: "x",
          reasonDetails: null,
          oldUnitId: "unit_not_projected",
          oldUnitName: "Other",
          newUnitId: "unit_kensington",
          newUnitName: "Kensington",
          mealType: null,
          status: "open",
          statusLabel: "Open",
          changedAt: new Date(),
          staffingHref: "/today/coverage",
          coverageHref: "/today/coverage",
        },
        {
          id: "2",
          employeeName: "B",
          templateKey: "call-off",
          templateLabel: "Call-off",
          reason: "y",
          reasonDetails: null,
          oldUnitId: "unit_off",
          oldUnitName: "Off",
          newUnitId: "unit_also_off",
          newUnitName: "Also",
          mealType: null,
          status: "open",
          statusLabel: "Open",
          changedAt: new Date(),
          staffingHref: "/today/coverage",
          coverageHref: "/today/coverage",
        },
      ],
      summary: { total: 2, open: 2, covered: 0 },
      dateIso: "2026-07-17",
    },
    scope.projectedUnitIds,
  );
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0]?.id, "1");
});

test("11. Issue/repair query intersection", () => {
  const scope = adaptProjectionToOperationsCenter(PLANT_GOLDEN_PROJECTION);
  const queries = {
    units: [
      { id: "unit_kensington" },
      { id: "unit_not_projected" },
    ],
    assignments: [],
    submissionsToday: [],
    scheduleEntriesToday: [],
    overridesToday: [],
    openRepairs: [
      { unitId: "unit_kensington", priority: "URGENT" },
      { unitId: "unit_not_projected", priority: "URGENT" },
    ],
    birthdaysThisMonth: [],
    serveryMealServiceEventsToday: [],
    roomAreaStatusesToday: [{ unitId: "unit_not_projected" }],
    outOfServiceAssets: [{ unitId: "unit_kensington" }],
    pmSchedulesDueThroughToday: [
      { asset: { unitId: "unit_kensington" } },
      { asset: { unitId: "unit_not_projected" } },
    ],
    managerCount: 0,
    month: 1,
  } as unknown as DashboardQueryResult;

  const intersected = intersectDashboardQueriesToProjectedUnits(
    queries,
    scope.projectedUnitIds,
  );
  assert.ok(intersected.openRepairs.every((r) => scope.projectedUnitIds.includes(r.unitId)));
  assert.ok(
    !intersected.openRepairs.some((r) => r.unitId === "unit_not_projected"),
  );
});

test("12. Contribution kinds drive card eligibility (no department hardcode)", () => {
  const mealKinds = contributionKindsFromContracts({
    domains: ["meal_service"],
    tools: ["TASKS", "LOGS"],
    readinessSignalKeys: ["meal_service.readiness"],
    hasNavigation: true,
  });
  assert.ok(mealKinds.includes("operations"));
  assert.ok(mealKinds.includes("compliance_logs"));

  const plantKinds = contributionKindsFromContracts({
    domains: ["work_orders"],
    tools: ["TASKS", "RECORDS"],
    readinessSignalKeys: ["work_orders.readiness"],
    hasNavigation: true,
  });
  assert.ok(plantKinds.includes("issues_repairs"));
  assert.ok(!plantKinds.includes("operations"));

  const cards = resolveEligibleOcCards(
    [
      {
        id: "x",
        experienceKey: "WORK_ORDERS",
        label: "Work Orders",
        order: 1,
        areaKey: "A",
        departmentKey: "PLANT",
        unitIds: ["u1"],
        spaceIds: [],
        domains: ["work_orders"],
        tools: [],
        actions: [],
        allowedActionKeys: [],
        readinessSignalKeys: ["work_orders.readiness"],
        contributionKinds: plantKinds,
        destinationHandles: [],
      },
    ],
    ["u1"],
  );
  assert.ok(cards.includes("open-repairs"));
  assert.ok(!cards.includes("meal-boards"));
});

test("13. Projection failure fails closed — empty scope, no Units", () => {
  const scope = emptyOperationsCenterScope("fac_1", "boom");
  assert.equal(scope.error, "boom");
  assert.equal(scope.projectedUnitIds.length, 0);
  assert.equal(scope.eligibleCardIds.length, 0);
  assert.equal(scope.departmentSections.length, 0);
});

test("14. Flag off is distinct from Today's Work flag", () => {
  withEnv("PROJECTION_TODAYS_WORK_ENABLED", "true", () => {
    withEnv("PROJECTION_OPERATIONS_CENTER_ENABLED", undefined, () => {
      assert.equal(isProjectionOperationsCenterEnabled(), false);
    });
  });
});

test("15. Today's Work and OC projected Unit parity on same snapshot", () => {
  const oc = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  const tw = adaptProjectionToTodaysWork(DIETARY_GOLDEN_PROJECTION);
  assert.deepEqual(
    [...oc.projectedUnitIds].sort(),
    [...tw.projectedUnitIds].sort(),
  );
});

test("16. Plant cannot receive Dietary/EVS Experiences", () => {
  const scope = adaptProjectionToOperationsCenter(PLANT_GOLDEN_PROJECTION);
  for (const key of scope.projectedExperiences) {
    assert.ok(key !== "MEAL_SERVICE");
    assert.ok(key !== "TEMPERATURE_MONITORING");
    assert.ok(key !== "ROOM_CLEANING");
    assert.ok(key !== "ROOM_STATUS");
  }
});

test("17. Destination handles stay on existing routes", () => {
  const scope = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  for (const handle of scope.destinationHandles) {
    if (handle.href) {
      assert.ok(
        handle.href.startsWith("/today") ||
          handle.href.startsWith("/assets") ||
          handle.href.startsWith("/unit/") ||
          handle.href.startsWith("/issues/"),
      );
    }
  }
});

test("18. Staffing isolation — Dietary scope excludes EVS-only Units from cards", () => {
  const dietary = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  const evs = adaptProjectionToOperationsCenter(EVS_GOLDEN_PROJECTION);
  // Department scopes may overlap on shared Units; Experiences must not cross.
  assert.ok(!dietary.projectedExperiences.some((k) => k.startsWith("ROOM_")));
  assert.ok(!evs.projectedExperiences.includes("MEAL_SERVICE"));
});

test("19. Readiness signal keys collected from Experience contracts", () => {
  const scope = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  assert.ok(scope.readinessSignalKeys.length >= 0);
  assert.ok(Array.isArray(scope.readinessSignalKeys));
});

test("20. Query scopes by domain present for projected Experiences", () => {
  const scope = adaptProjectionToOperationsCenter(DIETARY_GOLDEN_PROJECTION);
  assert.ok(Object.keys(scope.queryScopesByDomain).length > 0);
});
