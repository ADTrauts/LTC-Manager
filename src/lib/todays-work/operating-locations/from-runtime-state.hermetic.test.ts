import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeCoverageState, RuntimeLocationState } from "@/lib/runtime-location-state";
import { DEFERRED_READINESS } from "@/lib/runtime-location-state";

import {
  COVERAGE_UNAVAILABLE_LABEL,
  aggregateOperationFromRuntime,
  presentCoverageFromRuntime,
  projectOperatingLocationBoardFromRuntime,
  projectOperatingLocationFromRuntime,
} from "./from-runtime-state";
import type { SupervisorOperatingLocation } from "./types";

function coverage(state: RuntimeCoverageState["slots"][number]["state"]): RuntimeCoverageState {
  return {
    availability: "evaluated",
    planLifecycle: "RUNTIME_VISIBLE",
    slots: [
      {
        expectationId: "e1",
        templateStableKey: "dietary-coverage",
        templateVersion: 1,
        roleKey: "SERVER",
        roleLabel: "Server",
        requiredCount: 1,
        filledCount: state === "COVERED" ? 1 : 0,
        state,
        cycleStableKey: "breakfast",
        assignmentIds: state === "COVERED" ? ["oa-1"] : [],
        assignmentRefs:
          state === "COVERED"
            ? [{ assignmentId: "oa-1", employeeId: null, employeeDisplayName: null }]
            : [],
      },
    ],
  };
}

function state(partial: {
  spaceId: string;
  cycle?: string | null;
  coverage?: RuntimeCoverageState;
  exceptions?: RuntimeLocationState["exceptions"];
  overdue?: boolean;
  nextAt?: Date | null;
  impact?: boolean;
}): RuntimeLocationState {
  const location = {
    kind: "SPACE" as const,
    spaceId: partial.spaceId,
    unitId: "unit-1a",
    departmentId: "dept-1",
    facilityId: "fac-1",
  };
  const exceptions = partial.exceptions ?? [
    ...(partial.coverage?.slots.some((slot) => slot.state === "UNCOVERED")
      ? [
          {
            source: "coverage" as const,
            state: "UNCOVERED",
            location,
            operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
            label: "Server uncovered",
            href: null,
          },
        ]
      : []),
    ...(partial.overdue
      ? [
          {
            source: "evidence" as const,
            state: "OVERDUE",
            location,
            operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
            label: "Food Temperature overdue",
            href: null,
          },
        ]
      : []),
    ...(partial.impact
      ? [
          {
            source: "asset_issue" as const,
            state: "SERVICE_AT_RISK",
            location,
            operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
            label: "Hot well at risk",
            href: "/asset-issues/x",
          },
        ]
      : []),
  ];

  return {
    identity: {
      location,
      displayName: partial.spaceId,
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "Floor 1",
        neighborhoodName: "1A – Naval Park",
        unitName: "1A – Naval Park",
        spaceName: partial.spaceId,
      },
      physical: { roomTypeKey: "servery", roomTypeLabel: "Servery" },
    },
    program: {
      operationalType: {
        state: "assigned",
        key: "SERVERY",
        name: "Servery",
        id: "ot",
        profileId: "p1",
        profileVersion: 1,
        profileStatus: "ACTIVE",
      },
      cycleSetRef: null,
      coverageExpectationRefs: [],
      logAttachmentRefs: [],
    },
    operation: {
      state: partial.cycle ? "ACTIVE" : "NONE",
      current: partial.cycle
        ? {
            cycleStableKey: partial.cycle,
            cycleVersion: 1,
            label: partial.cycle === "breakfast" ? "Breakfast" : partial.cycle,
            hierarchyLabel: partial.cycle === "breakfast" ? "Breakfast" : partial.cycle,
            window: { start: "06:00", end: "10:00" },
            timing: {
              configured: "06:00",
              adjusted: null,
              expectedToday: "06:00",
              actual: null,
              recordedAt: null,
            },
          }
        : null,
      upcoming: null,
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: partial.coverage ?? coverage("COVERED"),
    evidence: {
      requiredToday: partial.overdue ? 1 : 0,
      dueNow: [],
      upcoming: [],
      completed: [],
      overdue: partial.overdue ? ["food-temp"] : [],
      needsReview: [],
      correctiveOpen: [],
      items: [],
    },
    assets: {
      assets: [],
      openIssues: [],
      issuesAffectingOperation: [],
    },
    milestones: { items: [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions,
    next: partial.nextAt
      ? { kind: "cycle_end", at: partial.nextAt, label: "Breakfast ends", sourceId: "breakfast" }
      : null,
    asOf: {
      now: new Date("2026-08-17T11:30:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  };
}

const neighborhood: SupervisorOperatingLocation = {
  id: "neighborhood:unit-1a",
  kind: "NEIGHBORHOOD",
  displayName: "1A – Naval Park",
  unitId: "unit-1a",
  departmentKey: "DIETARY",
  departmentLabel: "Dietary",
  floorLabel: "Floor 1",
  facilityOrder: 0,
  rooms: [
    {
      spaceId: "space-a",
      unitId: "unit-1a",
      name: "Servery A",
      href: "/unit/unit-1a?space=space-a",
      roomTypeLabel: "Servery",
    },
    {
      spaceId: "space-b",
      unitId: "unit-1a",
      name: "Servery B",
      href: "/unit/unit-1a?space=space-b",
      roomTypeLabel: "Servery",
    },
    {
      spaceId: "space-c",
      unitId: "unit-1a",
      name: "Servery C",
      href: "/unit/unit-1a?space=space-c",
      roomTypeLabel: "Servery",
    },
  ],
};

test("OA disabled presents Coverage unavailable, not Uncovered", () => {
  const staffing = presentCoverageFromRuntime(
    [
      {
        availability: "feature_disabled",
        planLifecycle: null,
        slots: [],
      },
    ],
    1,
  );
  assert.equal(staffing.kind, "unknown");
  assert.equal(staffing.label, COVERAGE_UNAVAILABLE_LABEL);
  assert.notEqual(staffing.kind, "uncovered");
});

test("standalone card projects a single SPACE state", () => {
  const location: SupervisorOperatingLocation = {
    ...neighborhood,
    id: "room:space-a",
    kind: "STANDALONE_ROOM",
    displayName: "Servery A",
    rooms: [neighborhood.rooms[0]!],
  };
  const row = projectOperatingLocationFromRuntime({
    location,
    states: [state({ spaceId: "space-a", cycle: "breakfast" })],
  });
  assert.equal(row.currentOperation.label, "Breakfast");
  assert.equal(row.staffing.kind, "covered");
  assert.equal(row.derivedStatus, "on_track");
});

test("neighborhood aggregates SPACE states without picking an arbitrary cycle", () => {
  const states = [
    state({ spaceId: "space-a", cycle: "breakfast", coverage: coverage("COVERED") }),
    state({
      spaceId: "space-b",
      cycle: "breakfast",
      coverage: coverage("UNCOVERED"),
      overdue: true,
    }),
    state({
      spaceId: "space-c",
      cycle: "breakfast",
      coverage: coverage("COVERED"),
      impact: true,
      nextAt: new Date("2026-08-17T12:00:00.000Z"),
    }),
  ];

  const operation = aggregateOperationFromRuntime(states);
  assert.equal(operation.label, "Breakfast");
  assert.equal(operation.phaseCount, 1);

  const staffing = presentCoverageFromRuntime(
    states.map((row) => row.coverage),
    3,
  );
  assert.match(staffing.label, /2 of 3 location responsibilities covered/);
  assert.equal(staffing.kind, "uncovered");

  const row = projectOperatingLocationFromRuntime({
    location: neighborhood,
    states,
  });
  assert.equal(row.displayName, "1A – Naval Park");
  assert.equal(row.currentOperation.label, "Breakfast");
  assert.ok(row.issues.some((issue) => issue.kind === "staffing" && issue.spaceId === "space-b"));
  assert.ok(row.issues.some((issue) => issue.kind === "log" && issue.spaceId === "space-b"));
  assert.ok(row.issues.some((issue) => issue.kind === "repair" && issue.spaceId === "space-c"));
  assert.equal(row.derivedStatus, "needs_attention");
});

test("mixed cycles on a neighborhood stay mixed, not an arbitrary pick", () => {
  const operation = aggregateOperationFromRuntime([
    state({ spaceId: "space-a", cycle: "breakfast" }),
    state({ spaceId: "space-b", cycle: "lunch" }),
  ]);
  assert.equal(operation.label, "2 active phases");
  assert.match(operation.detail ?? "", /Breakfast/);
  assert.match(operation.detail ?? "", /lunch/);
});

test("exception-first board sort: uncovered before on-track, facility order within rank", () => {
  const healthy: SupervisorOperatingLocation = {
    ...neighborhood,
    id: "n-healthy",
    displayName: "Healthy",
    facilityOrder: 0,
    rooms: [neighborhood.rooms[0]!],
  };
  const problem: SupervisorOperatingLocation = {
    ...neighborhood,
    id: "n-problem",
    displayName: "Problem",
    facilityOrder: 1,
    rooms: [neighborhood.rooms[1]!],
  };
  const board = projectOperatingLocationBoardFromRuntime({
    locations: [healthy, problem],
    states: [
      state({ spaceId: "space-a", cycle: "breakfast", coverage: coverage("COVERED") }),
      state({ spaceId: "space-b", cycle: "breakfast", coverage: coverage("UNCOVERED") }),
    ],
    sort: "board",
  });
  assert.equal(board.locations[0]?.displayName, "Problem");
  assert.equal(board.locations[1]?.displayName, "Healthy");
});
