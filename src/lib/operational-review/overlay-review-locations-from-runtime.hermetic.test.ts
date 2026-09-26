import assert from "node:assert/strict";
import test from "node:test";

import { emptyLocationProgram } from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";

import { overlayReviewLocationsFromRuntime } from "./overlay-review-locations-from-runtime";
import type { PresentedLocationRow } from "./present-operational-review-day";

function row(partial: Partial<PresentedLocationRow> & Pick<PresentedLocationRow, "spaceId">): PresentedLocationRow {
  return {
    displayLabel: partial.displayLabel ?? partial.spaceId,
    parentUnitId: partial.parentUnitId ?? "unit-1",
    parentUnitLabel: partial.parentUnitLabel ?? "Kitchen",
    operationalTypeName: partial.operationalTypeName ?? "Servery",
    currentLocationHref: partial.currentLocationHref ?? null,
    exceptionCount: partial.exceptionCount ?? 0,
    exceptionSummary: partial.exceptionSummary ?? "No exceptions",
    availabilityNotes: partial.availabilityNotes ?? [],
    ...partial,
  };
}

function state(spaceId: string): RuntimeLocationState {
  return withRuntimeLocationAnswers({
    identity: {
      location: {
        kind: "SPACE",
        spaceId,
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
      locationProgram: {
        ...emptyLocationProgram({
          departmentId: "dept-1",
          departmentName: "Dietary",
          spaceId,
          name: "Main Kitchen",
          facilityTypeLabel: "Production Space",
        }),
        teams: [
          {
            id: "culinary",
            name: "Culinary",
            provenance: { source: "TEAM_ROOM_MEMBERSHIP", detail: "Works this room" },
          },
        ],
      },
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
    operation: { state: "NONE", current: null, upcoming: null, provenance: "NEW_PERIOD_KEY_TIME" },
    coverage: { availability: "evaluated", planLifecycle: "RUNTIME_VISIBLE", slots: [] },
    evidence: {
      requiredToday: 0,
      dueNow: [],
      upcoming: [],
      completed: [],
      overdue: [],
      needsReview: [],
      correctiveOpen: [],
      items: [],
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
          spaceId,
          unitId: "unit-1",
          departmentId: "dept-1",
          facilityId: "fac-1",
        },
        operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: null },
        label: "Culinary uncovered",
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

test("Review location rows read Facility type and teams from RLS, not Operational Type", () => {
  const overlaid = overlayReviewLocationsFromRuntime(
    [row({ spaceId: "kitchen", displayLabel: "Kitchen", operationalTypeName: "MAIN_KITCHEN" })],
    [state("kitchen")],
  );
  assert.equal(overlaid[0]?.displayLabel, "Main Kitchen");
  assert.equal(overlaid[0]?.operationalTypeName, "Production Space · Culinary");
  assert.equal(overlaid[0]?.exceptionCount, 1);
  assert.equal(overlaid[0]?.exceptionSummary, "1 exception");
});

test("leaves a location alone when RLS has no matching space", () => {
  const original = row({ spaceId: "retail", displayLabel: "Retail" });
  const overlaid = overlayReviewLocationsFromRuntime([original], [state("kitchen")]);
  assert.deepEqual(overlaid[0], original);
});
