import assert from "node:assert/strict";
import test from "node:test";

import { composeLocationProgram } from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";

import { presentReviewLocationsFromRuntime } from "./present-review-locations-from-runtime";

function kitchen(): RuntimeLocationState {
  return withRuntimeLocationAnswers({
    identity: {
      location: {
        kind: "SPACE",
        spaceId: "kitchen-1",
        unitId: "unit-1",
        departmentId: "dept-1",
        facilityId: "fac-1",
      },
      displayName: "Main Kitchen",
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "1",
        neighborhoodName: null,
        unitName: "Kitchen",
        spaceName: "Main Kitchen",
      },
      physical: { roomTypeKey: "production", roomTypeLabel: "Production Space" },
    },
    program: {
      locationProgram: composeLocationProgram({
        departmentId: "dept-1",
        departmentName: "Dietary",
        location: {
          spaceId: "kitchen-1",
          name: "Main Kitchen",
          neighborhoodName: null,
          floorName: "1",
          facilityTypeLabel: "Production Space",
          facilityRoomTypeId: "type-prod",
          responsible: true,
        },
        teams: [{ id: "culinary", name: "Culinary", spaceIds: ["kitchen-1"] }],
        teamCycles: [
          {
            teamId: "culinary",
            cycleStableKey: "breakfast",
            label: "Breakfast",
            startLocal: "06:00",
            endLocal: "10:00",
            requiredCount: 5,
            grain: "TOTAL",
          },
        ],
        cyclePlacements: [],
        spaceLogs: [],
        assetLogs: [],
        typeDefaults: [],
        suppressions: [],
        assets: [],
      }),
      operationalType: {
        state: "unassigned",
        key: null,
        name: null,
        id: null,
        profileId: null,
        profileVersion: null,
        profileStatus: null,
      },
      cycleSetRef: null,
      coverageExpectationRefs: [],
      logAttachmentRefs: [],
    },
    operation: {
      state: "ACTIVE",
      current: {
        cycleStableKey: "breakfast",
        cycleVersion: 1,
        label: "Breakfast",
        hierarchyLabel: "Breakfast",
        window: { start: "06:00", end: "10:00" },
        timing: {
          configured: "06:00",
          adjusted: null,
          expectedToday: "06:00",
          actual: null,
          recordedAt: null,
        },
      },
      upcoming: null,
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: {
      availability: "evaluated",
      planLifecycle: "RUNTIME_VISIBLE",
      slots: [
        {
          expectationId: "e1",
          templateStableKey: "breakfast",
          templateVersion: 1,
          roleKey: "TEAM:culinary",
          roleLabel: "Culinary",
          requiredCount: 5,
          filledCount: 3,
          state: "UNCOVERED",
          cycleStableKey: "breakfast",
          assignmentIds: [],
          assignmentRefs: [],
        },
      ],
    },
    evidence: {
      requiredToday: 1,
      dueNow: [],
      upcoming: [],
      completed: [],
      overdue: ["temp-log"],
      needsReview: [],
      correctiveOpen: [],
      items: [
        {
          requirementKey: "temp-log",
          attachmentId: "a1",
          catalogStableKey: "temp",
          displayName: "Hot holding temp",
          productState: "OVERDUE",
          cycleStableKey: "breakfast",
          window: { start: "06:00", end: "10:00" },
          recordId: null,
          href: null,
          needsSupervisorReview: false,
        },
      ],
    },
    assets: { assets: [], openIssues: [], issuesAffectingOperation: [] },
    milestones: { items: [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: [
      {
        source: "coverage",
        state: "UNCOVERED",
        location: {
          kind: "SPACE",
          spaceId: "kitchen-1",
          unitId: "unit-1",
          departmentId: "dept-1",
          facilityId: "fac-1",
        },
        operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: null },
        label: "Culinary short 2",
        href: null,
      },
    ],
    next: null,
    asOf: {
      now: new Date("2026-08-17T12:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  });
}

test("Review replay is planned vs actual from answers, not Operational Type", () => {
  const rows = presentReviewLocationsFromRuntime([kitchen()]);
  assert.equal(rows[0]?.displayLabel, "Main Kitchen");
  assert.equal(rows[0]?.happeningLabel, "Breakfast · Active");
  assert.equal(rows[0]?.paceLabel, "At risk");
  assert.equal(rows[0]?.plannedLabel, "Culinary · 5 planned");
  assert.equal(rows[0]?.actualLabel, "3 of 5");
  assert.equal(rows[0]?.evidenceLabel, "Hot holding temp overdue");
  assert.equal(rows[0]?.operationalTypeName, "Production Space · Culinary");
  assert.doesNotMatch(JSON.stringify(rows), /Operational Type/);
});
