import assert from "node:assert/strict";
import test from "node:test";

import {
  coverageStateLabel,
  evidenceStateLabel,
  milestoneVarianceLabel,
  presenceExceptionLabel,
  presentOperationalReviewDay,
  unavailableExplanation,
} from "./present-operational-review-day";
import type {
  OperationalReviewDayViewModel,
  ReviewCoverageSlot,
  ReviewEvidenceOccurrence,
  ReviewLocationEntry,
  ReviewMilestoneItem,
} from "./types";

const TZ = "America/New_York";

function location(): ReviewLocationEntry {
  return {
    spaceId: "space-1",
    parentUnitId: "unit-1",
    parentUnitLabel: "Central Kitchen",
    displayLabel: "Main Kitchen",
    displayLabelIsHistorical: false,
    operationalTypeKey: "servery",
    operationalTypeName: "Servery",
  };
}

function evidence(
  overrides: Partial<ReviewEvidenceOccurrence> & Pick<ReviewEvidenceOccurrence, "requirementKey" | "state">,
): ReviewEvidenceOccurrence {
  return {
    spaceId: "space-1",
    parentUnitId: "unit-1",
    attachmentId: "att-1",
    attachmentStableKey: "att_1",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
    slotLabel: "Morning cooler",
    cycleStableKey: "breakfast",
    windowStartLocal: "07:00",
    windowEndLocal: "09:00",
    expected: true,
    recordId: null,
    occurredAt: null,
    recordedAt: null,
    operationalDateKey: "2026-09-01",
    ...overrides,
  };
}

function coverage(overrides?: Partial<ReviewCoverageSlot>): ReviewCoverageSlot {
  return {
    spaceId: "space-1",
    roleKey: "SERVER",
    roleLabel: "Server",
    requiredCount: 2,
    filledCount: 1,
    state: "at_risk",
    templateId: "cov-1",
    templateStableKey: "servery-meals",
    templateVersion: 1,
    cycleStableKey: "breakfast",
    cycleLabel: "Breakfast",
    operationalTypeKey: "servery",
    fillingAssignmentIds: ["oa-1"],
    ...overrides,
  };
}

function milestone(overrides?: Partial<ReviewMilestoneItem>): ReviewMilestoneItem {
  return {
    kind: "MEAL_SERVICE_STARTED",
    cycleStableKey: "lunch",
    cycleVersion: 1,
    cycleLabel: "Lunch",
    expectedTimeLocal: "12:00",
    spaceId: "space-1",
    unitId: "unit-1",
    actualOccurredAt: "2026-09-01T16:12:00.000Z",
    actualRecordedAt: "2026-09-01T16:12:00.000Z",
    ...overrides,
  };
}

function model(overrides?: Partial<OperationalReviewDayViewModel>): OperationalReviewDayViewModel {
  return {
    facilityId: "f1",
    facilityLabel: "Terrace View",
    departmentId: "d1",
    departmentIds: ["d1"],
    serviceDate: "2026-09-01",
    timezone: TZ,
    locations: [location()],
    evidence: {
      availability: { status: "evaluated", reason: null },
      occurrences: [],
    },
    coverage: {
      availability: { status: "evaluated", reason: null },
      slots: [],
      assignments: [],
    },
    cycles: {
      availability: { status: "evaluated", reason: null },
      versions: [
        {
          id: "cyc-lunch",
          stableKey: "lunch",
          version: 1,
          label: "Lunch",
          startLocal: "11:30",
          endLocal: "13:30",
          expectedMilestones: ["SERVICE_STARTED"],
          spaceIds: ["space-1"],
        },
      ],
    },
    milestones: {
      availability: { status: "evaluated", reason: null },
      items: [],
    },
    presence: {
      scheduled: [],
      exceptions: [],
      attendanceClaimed: false,
    },
    work: {
      availability: { status: "unavailable", reason: "unsupported_work_history" },
    },
    assets: {
      availability: { status: "evaluated", reason: null },
      impacts: [],
    },
    ...overrides,
  };
}

test("missed evidence appears in attention and is not counted as unavailable", () => {
  const presented = presentOperationalReviewDay(
    model({
      evidence: {
        availability: { status: "evaluated", reason: null },
        occurrences: [evidence({ requirementKey: "req-miss", state: "not_complete" })],
      },
    }),
  );
  assert.equal(presented.evidence.attention[0]?.stateLabel, "Missed");
  assert.equal(presented.evidence.completed.length, 0);
  assert.deepEqual(
    presented.summaryItems.map((row) => row.id),
    ["evidence-missed"],
  );
  assert.match(presented.summaryItems[0]!.label, /1 evidence item missed/);
});

test("completed evidence stays accessible and quiet in the summary", () => {
  const presented = presentOperationalReviewDay(
    model({
      evidence: {
        availability: { status: "evaluated", reason: null },
        occurrences: [
          evidence({
            requirementKey: "req-ok",
            state: "completed",
            recordId: "ev-1",
            occurredAt: "2026-09-01T12:00:00.000Z",
            recordedAt: "2026-09-01T12:05:00.000Z",
          }),
        ],
      },
    }),
  );
  assert.equal(presented.quiet, true);
  assert.equal(presented.evidence.completed[0]?.stateLabel, "Completed");
  assert.equal(presented.summaryItems.length, 0);
});

test("corrective evidence is attention and does not become a score", () => {
  const presented = presentOperationalReviewDay(
    model({
      evidence: {
        availability: { status: "evaluated", reason: null },
        occurrences: [
          evidence({
            requirementKey: "req-fix",
            state: "completed_with_corrective_action",
            recordId: "ev-2",
            occurredAt: "2026-09-01T12:00:00.000Z",
            recordedAt: "2026-09-01T12:05:00.000Z",
          }),
        ],
      },
    }),
  );
  assert.equal(presented.evidence.attention[0]?.stateLabel, "Completed with corrective action");
  assert.match(presented.summaryItems[0]!.label, /corrective action/);
  assert.equal(presented.quiet, false);
});

test("unavailable evidence is distinct from missed", () => {
  const presented = presentOperationalReviewDay(
    model({
      evidence: {
        availability: { status: "unavailable", reason: "attachment_history_not_reliable" },
        occurrences: [evidence({ requirementKey: "req-u", state: "unavailable" })],
      },
    }),
  );
  assert.equal(presented.evidence.attention[0]?.stateLabel, "Unavailable");
  assert.ok(!presented.summaryItems.some((row) => /missed/i.test(row.label)));
  assert.ok(presented.summaryItems.some((row) => /unavailable/i.test(row.label)));
  assert.match(presented.evidence.unavailableMessage ?? "", /cannot be reconstructed/);
});

test("coverage uses OA actual; schedule stays presence only", () => {
  const presented = presentOperationalReviewDay(
    model({
      coverage: {
        availability: { status: "evaluated", reason: null },
        slots: [coverage()],
        assignments: [
          {
            id: "oa-1",
            roleKey: "SERVER",
            status: "ACTIVE",
            employeeId: "e1",
            employeeDisplayName: "John",
            unitId: "unit-1",
            coveredSpaceIds: ["space-1"],
            startsAt: null,
            endsAt: null,
            hasCallDown: false,
            locationChangedDuringEdits: false,
          },
        ],
      },
      presence: {
        scheduled: [
          {
            scheduleEntryId: "sch-1",
            employeeId: "mary",
            employeeDisplayName: "Mary",
            unitId: "unit-1",
            departmentId: "d1",
            shift: "AM",
          },
        ],
        exceptions: [
          {
            overrideId: "ov-1",
            employeeId: "mary",
            employeeDisplayName: "Mary",
            kind: "called_off",
            reason: "Called off",
            oldUnitId: "unit-1",
            newUnitId: "unit-1",
          },
        ],
        attendanceClaimed: false,
      },
    }),
  );
  assert.equal(presented.coverage.slots[0]?.stateLabel, "At risk");
  assert.equal(presented.coverage.slots[0]?.assignedCount, 1);
  assert.equal(presented.coverage.slots[0]?.requiredCount, 2);
  assert.equal(presented.presence.scheduled[0]?.employeeDisplayName, "Mary");
  assert.equal(presenceExceptionLabel("called_off"), "Call-off");
  assert.equal(presented.presence.attendanceClaimed, false);
  assert.match(presented.summaryItems.find((row) => row.id === "coverage-gaps")!.label, /1 coverage gap/);
});

test("OA edit history is flagged instead of inventing intraday location truth", () => {
  const presented = presentOperationalReviewDay(
    model({
      coverage: {
        availability: { status: "evaluated", reason: null },
        slots: [coverage({ state: "covered", filledCount: 2 })],
        assignments: [
          {
            id: "oa-2",
            roleKey: "SERVER",
            status: "ACTIVE",
            employeeId: "e1",
            employeeDisplayName: "John",
            unitId: "unit-1",
            coveredSpaceIds: ["space-1"],
            startsAt: null,
            endsAt: null,
            hasCallDown: false,
            locationChangedDuringEdits: true,
          },
        ],
      },
    }),
  );
  assert.match(presented.coverage.assignmentEditLimitation ?? "", /latest recorded state/);
});

test("service milestone shows expected, actual, and factual lateness", () => {
  const variance = milestoneVarianceLabel({
    serviceDate: "2026-09-01",
    timezone: TZ,
    expectedTimeLocal: "12:00",
    actualOccurredAt: "2026-09-01T16:12:00.000Z",
  });
  assert.equal(variance, "12 min late");
  const presented = presentOperationalReviewDay(
    model({
      milestones: {
        availability: { status: "evaluated", reason: null },
        items: [milestone()],
      },
    }),
  );
  const lunch = presented.service.cycles.find((row) => row.stableKey === "lunch");
  assert.equal(lunch?.milestones[0]?.kindLabel, "Meal Service Started");
  assert.equal(lunch?.milestones[0]?.expectedTimeLabel, "12:00 PM");
  assert.equal(lunch?.milestones[0]?.varianceLabel, "12 min late");
  assert.match(presented.summaryItems[0]!.label, /Meal Service Started 12 min late/);
});

test("partial-data days keep valid evidence when coverage is unavailable", () => {
  const presented = presentOperationalReviewDay(
    model({
      evidence: {
        availability: { status: "evaluated", reason: null },
        occurrences: [evidence({ requirementKey: "req-miss", state: "not_complete" })],
      },
      coverage: {
        availability: { status: "unavailable", reason: "coverage_interval_ambiguous" },
        slots: [],
        assignments: [],
      },
    }),
  );
  assert.equal(presented.evidence.attention.length, 1);
  assert.equal(presented.coverage.availability.status, "unavailable");
  assert.ok(presented.unavailableDomains.some((row) => row.id === "coverage-domain"));
  assert.equal(presented.empty, false);
});

test("current-day presentation still uses the historical model and marks today", () => {
  const presented = presentOperationalReviewDay(model({ serviceDate: "2026-09-15" }), {
    todayKey: "2026-09-15",
  });
  assert.equal(presented.isToday, true);
  assert.equal(presented.serviceDate, "2026-09-15");
});

test("location grain is SPACE and parent units are grouping context only", () => {
  const presented = presentOperationalReviewDay(model());
  assert.equal(presented.locations[0]?.spaceId, "space-1");
  assert.equal(presented.locations[0]?.parentUnitLabel, "Central Kitchen");
  assert.equal(presented.locations[0]?.currentLocationHref, "/unit/unit-1?space=space-1");
  assert.equal(presented.locationOptions[0]?.spaceId, "space-1");
});

test("space filter does not invent a unit operational row", () => {
  const presented = presentOperationalReviewDay(
    model({
      locations: [
        location(),
        {
          ...location(),
          spaceId: "space-2",
          displayLabel: "Retail",
          operationalTypeName: "Retail",
        },
      ],
      evidence: {
        availability: { status: "evaluated", reason: null },
        occurrences: [
          evidence({ requirementKey: "req-1", state: "not_complete" }),
          evidence({ requirementKey: "req-2", state: "not_complete", spaceId: "space-2" }),
        ],
      },
    }),
    { spaceId: "space-2" },
  );
  assert.equal(presented.locations.length, 1);
  assert.equal(presented.locations[0]?.spaceId, "space-2");
  assert.equal(presented.evidence.attention.length, 1);
  assert.equal(presented.locationOptions.length, 2);
});

test("late recording is flagged but stays on the operational service date", () => {
  const presented = presentOperationalReviewDay(
    model({
      evidence: {
        availability: { status: "evaluated", reason: null },
        occurrences: [
          evidence({
            requirementKey: "req-late",
            state: "completed",
            recordId: "ev-late",
            occurredAt: "2026-09-01T15:00:00.000Z",
            recordedAt: "2026-09-02T13:00:00.000Z",
          }),
        ],
      },
    }),
  );
  assert.equal(presented.evidence.completed[0]?.recordedLater, true);
  assert.equal(presented.serviceDate, "2026-09-01");
});

test("empty and quiet days stay factual", () => {
  const empty = presentOperationalReviewDay(
    model({
      locations: [],
      cycles: { availability: { status: "evaluated", reason: null }, versions: [] },
    }),
  );
  assert.equal(empty.empty, true);
  assert.equal(empty.quiet, false);
  const quiet = presentOperationalReviewDay(model());
  assert.equal(quiet.empty, false);
  assert.equal(quiet.quiet, true);
});

test("asset impacts appear only when present", () => {
  const none = presentOperationalReviewDay(model());
  assert.equal(none.assets.rows.length, 0);
  const withImpact = presentOperationalReviewDay(
    model({
      assets: {
        availability: { status: "evaluated", reason: null },
        impacts: [
          {
            issueId: "iss-1",
            spaceId: "space-1",
            operationalImpact: "EQUIPMENT_UNAVAILABLE",
            observedAt: "2026-09-01T14:00:00.000Z",
          },
        ],
      },
    }),
  );
  assert.equal(withImpact.assets.rows[0]?.impactLabel, "Equipment unavailable");
  assert.equal(withImpact.assets.rows[0]?.href, "/asset-issues/iss-1");
  assert.match(withImpact.summaryItems.find((row) => row.id === "assets")!.label, /1 asset/);
});

test("review labels stay factual", () => {
  assert.equal(evidenceStateLabel("not_complete"), "Missed");
  assert.equal(evidenceStateLabel("unavailable"), "Unavailable");
  assert.equal(coverageStateLabel("uncovered"), "Uncovered");
  assert.equal(presenceExceptionLabel("reassigned"), "Reassigned");
  assert.match(unavailableExplanation("legacy_only_date"), /Historical expectation unavailable/);
});
