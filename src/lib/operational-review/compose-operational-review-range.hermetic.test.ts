import assert from "node:assert/strict";
import test from "node:test";

import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";

import { composeOperationalReviewDay } from "./compose-operational-review-day";
import { composeOperationalReviewRange } from "./compose-operational-review-range";
import { presentOperationalReviewRange } from "./present-operational-review-range";
import { enumerateServiceDateKeys } from "./service-date-range";
import type {
  OperationalReviewDayFacts,
  ReviewAttachmentSegmentFact,
  ReviewEvidenceRecordFact,
} from "./types";

const TZ = "America/New_York";

function windows(cadence: "TWICE_DAILY" | "THREE_TIMES_DAILY") {
  return daypartWindowsForCadence(cadence).map((w, i) => ({
    label: w.label,
    startLocal: w.startLocal,
    endLocal: w.endLocal,
    displaySequence: (i + 1) * 10,
  }));
}

function coolerAttachment(
  overrides?: Partial<ReviewAttachmentSegmentFact>,
): ReviewAttachmentSegmentFact {
  return {
    id: "att-cooler",
    stableKey: "att_cooler_1",
    facilityId: "f1",
    departmentId: "d1",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
    status: "ACTIVE",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: null,
    localInstructions: null,
    targetKind: "SPACE",
    assetId: null,
    spaceId: "space-1",
    unitId: "unit-1",
    targetDepartmentId: null,
    operationalTypeKey: null,
    dailyWindows: windows("TWICE_DAILY"),
    cycleSelections: [],
    catalogDefinition: {
      id: "cat-cooler",
      name: "Cooler Temperature Log",
      purposeType: "LOG",
      instructions: "Check cooler.",
      status: "PUBLISHED",
      fields: [],
    },
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

function facts(overrides?: Partial<OperationalReviewDayFacts>): OperationalReviewDayFacts {
  return {
    facilityId: "f1",
    facilityLabel: "Terrace View",
    departmentId: "d1",
    departmentIds: ["d1"],
    serviceDate: "2026-09-01",
    timezone: TZ,
    now: new Date("2026-09-15T17:00:00.000Z"),
    todayKey: "2026-09-15",
    spaces: [
      {
        spaceId: "space-1",
        displayLabel: "Main Kitchen",
        parentUnitId: "unit-1",
        parentUnitLabel: "Central Kitchen",
      },
    ],
    profiles: [
      {
        id: "p1",
        departmentId: "d1",
        version: 1,
        status: "RETIRED",
        activatedAt: new Date("2026-09-01T12:00:00.000Z"),
        retiredAt: new Date("2026-09-08T12:00:00.000Z"),
      },
    ],
    otBindings: [
      {
        profileId: "p1",
        spaceId: "space-1",
        operationalTypeKey: "servery",
        operationalTypeName: "Servery",
        archetypeIsActive: true,
      },
    ],
    attachmentSegments: [],
    evidenceRecords: [],
    coverageTemplates: [],
    assignments: [],
    plans: [{ departmentId: "d1", status: "CONFIRMED" }],
    cycles: [],
    publishedCyclesForLogs: [],
    serveryMilestoneActuals: [],
    keyTimeActuals: [],
    scheduledPresence: [],
    presenceExceptions: [],
    assetImpacts: [],
    legacySubmissionPresent: false,
    ...overrides,
  };
}

function evidence(
  overrides: Partial<ReviewEvidenceRecordFact> & Pick<ReviewEvidenceRecordFact, "id" | "requirementKey">,
): ReviewEvidenceRecordFact {
  return {
    logRequirementKey: overrides.requirementKey,
    status: "COMPLETED",
    operationalDateKey: "2026-09-01",
    catalogVersion: 1,
    logAttachmentId: "att-cooler",
    attachmentStableKey: "att_cooler_1",
    catalogStableKey: "cooler_temperature_log",
    spaceId: "space-1",
    unitId: "unit-1",
    occurredAt: new Date("2026-09-01T12:00:00.000Z"),
    recordedAt: new Date("2026-09-01T12:05:00.000Z"),
    outOfStandard: false,
    ...overrides,
  };
}

function rangeOf(days: OperationalReviewDayFacts[], start: string, end: string) {
  return composeOperationalReviewRange({
    days: days.map((day) => composeOperationalReviewDay(day)),
    startServiceDate: start,
    endServiceDate: end,
    todayKey: "2026-09-15",
  });
}

test("single-day model equals the same day inside a range", () => {
  const dayFacts = facts({
    attachmentSegments: [coolerAttachment()],
  });
  const day = composeOperationalReviewDay(dayFacts);
  const range = rangeOf(
    [
      dayFacts,
      facts({
        serviceDate: "2026-09-02",
        attachmentSegments: [coolerAttachment()],
      }),
    ],
    "2026-09-01",
    "2026-09-02",
  );
  assert.deepEqual(range.days[0], day);
  assert.equal(range.dayCount, 2);
});

test("Harbor cadence change uses daily denominators, not current × days", () => {
  const twice = coolerAttachment({
    effectiveTo: new Date("2026-09-03T00:00:00.000Z"),
    status: "INACTIVE",
  });
  const once = coolerAttachment({
    id: "att-cooler-2",
    stableKey: "att_cooler_2",
    effectiveFrom: new Date("2026-09-04T00:00:00.000Z"),
    dailyWindows: [
      { label: "Once", startLocal: "08:00", endLocal: "10:00", displaySequence: 10 },
    ],
  });
  const keys = enumerateServiceDateKeys("2026-09-01", "2026-09-07");
  const range = rangeOf(
    keys.map((serviceDate) =>
      facts({
        serviceDate,
        attachmentSegments: [twice, once],
      }),
    ),
    "2026-09-01",
    "2026-09-07",
  );
  assert.equal(range.totals.evidenceExpected, 10);
  assert.equal(range.totals.evidenceMissed, 10);
  assert.notEqual(range.totals.evidenceExpected, 7);
  assert.notEqual(range.totals.evidenceExpected, 14);
});

test("coverage version change aggregates each day's published requirement", () => {
  const keys = enumerateServiceDateKeys("2026-09-01", "2026-09-07");
  const templates = [
    {
      id: "cov-v1",
      stableKey: "servery-meals",
      version: 1,
      status: "PUBLISHED" as const,
      isActive: false,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-04",
      items: [
        {
          id: "item-1",
          roleKey: "SERVER",
          roleLabel: "Server",
          requiredCount: 2,
          unitId: null,
          applicableOperationalTypeKeys: ["servery"],
          applicableOperationalCycleStableKeys: [],
        },
      ],
    },
    {
      id: "cov-v2",
      stableKey: "servery-meals",
      version: 2,
      status: "PUBLISHED" as const,
      isActive: true,
      effectiveFrom: "2026-09-05",
      effectiveTo: null,
      items: [
        {
          id: "item-2",
          roleKey: "SERVER",
          roleLabel: "Server",
          requiredCount: 1,
          unitId: null,
          applicableOperationalTypeKeys: ["servery"],
          applicableOperationalCycleStableKeys: [],
        },
      ],
    },
  ];
  const range = rangeOf(
    keys.map((serviceDate) => facts({ serviceDate, coverageTemplates: templates })),
    "2026-09-01",
    "2026-09-07",
  );
  assert.equal(range.totals.coverageExpectedSlots, 7);
  assert.equal(
    range.days.slice(0, 4).every((day) => day.coverage.slots[0]?.requiredCount === 2),
    true,
  );
  assert.equal(
    range.days.slice(4).every((day) => day.coverage.slots[0]?.requiredCount === 1),
    true,
  );
});

test("OT change is applied per day, not current profile across the range", () => {
  const range = rangeOf(
    [
      facts({
        serviceDate: "2026-09-02",
        profiles: [
          {
            id: "p1",
            departmentId: "d1",
            version: 1,
            status: "RETIRED",
            activatedAt: new Date("2026-09-01T12:00:00.000Z"),
            retiredAt: new Date("2026-09-05T12:00:00.000Z"),
          },
          {
            id: "p2",
            departmentId: "d1",
            version: 2,
            status: "ACTIVE",
            activatedAt: new Date("2026-09-05T12:00:00.000Z"),
            retiredAt: null,
          },
        ],
        otBindings: [
          {
            profileId: "p1",
            spaceId: "space-1",
            operationalTypeKey: "servery",
            operationalTypeName: "Servery",
            archetypeIsActive: true,
          },
          {
            profileId: "p2",
            spaceId: "space-1",
            operationalTypeKey: "retail",
            operationalTypeName: "Retail",
            archetypeIsActive: true,
          },
        ],
      }),
      facts({
        serviceDate: "2026-09-06",
        profiles: [
          {
            id: "p1",
            departmentId: "d1",
            version: 1,
            status: "RETIRED",
            activatedAt: new Date("2026-09-01T12:00:00.000Z"),
            retiredAt: new Date("2026-09-05T12:00:00.000Z"),
          },
          {
            id: "p2",
            departmentId: "d1",
            version: 2,
            status: "ACTIVE",
            activatedAt: new Date("2026-09-05T12:00:00.000Z"),
            retiredAt: null,
          },
        ],
        otBindings: [
          {
            profileId: "p1",
            spaceId: "space-1",
            operationalTypeKey: "servery",
            operationalTypeName: "Servery",
            archetypeIsActive: true,
          },
          {
            profileId: "p2",
            spaceId: "space-1",
            operationalTypeKey: "retail",
            operationalTypeName: "Retail",
            archetypeIsActive: true,
          },
        ],
      }),
    ],
    "2026-09-02",
    "2026-09-06",
  );
  assert.equal(range.days[0]?.locations[0]?.operationalTypeKey, "servery");
  assert.equal(range.days[1]?.locations[0]?.operationalTypeKey, "retail");
});

test("unavailable days are excluded from false denominators", () => {
  const keys = enumerateServiceDateKeys("2026-09-01", "2026-09-07");
  const range = rangeOf(
    keys.map((serviceDate, index) =>
      facts({
        serviceDate,
        attachmentSegments:
          index < 2
            ? [
                coolerAttachment({
                  updatedAt: new Date("2026-09-10T16:00:00.000Z"),
                  dailyWindows: windows("THREE_TIMES_DAILY"),
                }),
              ]
            : [coolerAttachment()],
      }),
    ),
    "2026-09-01",
    "2026-09-07",
  );
  assert.equal(range.totals.evidenceUnavailableDays, 2);
  assert.equal(range.totals.evidenceEvaluatedDays, 5);
  assert.equal(range.totals.evidenceExpected, 10);
  assert.equal(range.totals.evidenceMissed, 10);
  assert.ok(range.days[0]?.evidence.occurrences.every((row) => row.state === "unavailable"));
});

test("partial-domain ranges keep independent denominators", () => {
  const keys = enumerateServiceDateKeys("2026-09-01", "2026-09-07");
  const overlapping = [
    {
      id: "cov-a",
      stableKey: "servery-meals",
      version: 1,
      status: "PUBLISHED" as const,
      isActive: true,
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-07",
      items: [
        {
          id: "item-a",
          roleKey: "SERVER",
          roleLabel: "Server",
          requiredCount: 1,
          unitId: null,
          applicableOperationalTypeKeys: ["servery"],
          applicableOperationalCycleStableKeys: [],
        },
      ],
    },
    {
      id: "cov-b",
      stableKey: "servery-meals",
      version: 2,
      status: "PUBLISHED" as const,
      isActive: true,
      effectiveFrom: "2026-09-01",
      effectiveTo: null,
      items: [
        {
          id: "item-b",
          roleKey: "SERVER",
          roleLabel: "Server",
          requiredCount: 2,
          unitId: null,
          applicableOperationalTypeKeys: ["servery"],
          applicableOperationalCycleStableKeys: [],
        },
      ],
    },
  ];
  const single = [overlapping[0]!];
  const range = rangeOf(
    keys.map((serviceDate, index) =>
      facts({
        serviceDate,
        attachmentSegments: [coolerAttachment()],
        coverageTemplates: index < 2 ? overlapping : single,
      }),
    ),
    "2026-09-01",
    "2026-09-07",
  );
  assert.equal(range.totals.evidenceEvaluatedDays, 7);
  assert.equal(range.totals.coverageUnavailableDays, 2);
  assert.equal(range.totals.coverageEvaluatedDays, 5);
});

test("corrective evidence aggregates separately from missed", () => {
  const attachment = coolerAttachment();
  const projected = composeOperationalReviewDay(facts({ attachmentSegments: [attachment] }));
  const firstKey = projected.evidence.occurrences[0]!.requirementKey;
  const withCorrective = facts({
    attachmentSegments: [attachment],
    evidenceRecords: [
      evidence({
        id: "ev-1",
        requirementKey: firstKey,
        status: "COMPLETED_WITH_CORRECTIVE_ACTION",
      }),
    ],
  });
  const missedOnly = facts({
    serviceDate: "2026-09-02",
    attachmentSegments: [attachment],
  });
  const range = rangeOf([withCorrective, missedOnly], "2026-09-01", "2026-09-02");
  assert.equal(range.totals.evidenceCorrective, 1);
  assert.equal(range.totals.evidenceMissed, 3);
  assert.equal(range.totals.evidenceCompleted, 1);
});

test("late recording stays on the occurred day inside a range", () => {
  const attachment = coolerAttachment();
  const projected = composeOperationalReviewDay(facts({ attachmentSegments: [attachment] }));
  const firstKey = projected.evidence.occurrences[0]!.requirementKey;
  const range = rangeOf(
    [
      facts({
        attachmentSegments: [attachment],
        evidenceRecords: [
          evidence({
            id: "ev-late",
            requirementKey: firstKey,
            occurredAt: new Date("2026-09-01T15:00:00.000Z"),
            recordedAt: new Date("2026-09-02T13:00:00.000Z"),
          }),
        ],
      }),
      facts({ serviceDate: "2026-09-02", attachmentSegments: [attachment] }),
    ],
    "2026-09-01",
    "2026-09-02",
  );
  const late = range.days[0]?.evidence.occurrences.find((row) => row.requirementKey === firstKey);
  assert.equal(late?.operationalDateKey, "2026-09-01");
  assert.equal(late?.state, "completed");
});

test("schedule does not change coverage aggregation", () => {
  const coverage = [
    {
      id: "cov-v1",
      stableKey: "servery-meals",
      version: 1,
      status: "PUBLISHED" as const,
      isActive: true,
      effectiveFrom: "2026-09-01",
      effectiveTo: null,
      items: [
        {
          id: "item-1",
          roleKey: "SERVER",
          roleLabel: "Server",
          requiredCount: 2,
          unitId: null,
          applicableOperationalTypeKeys: ["servery"],
          applicableOperationalCycleStableKeys: [],
        },
      ],
    },
  ];
  const range = rangeOf(
    [
      facts({
        coverageTemplates: coverage,
        assignments: [
          {
            id: "oa-1",
            departmentId: "d1",
            roleKey: "SERVER",
            status: "ACTIVE",
            unitId: "unit-1",
            coveredSpaceIds: ["space-1"],
            startsAt: new Date("2026-09-01T11:00:00.000Z"),
            endsAt: new Date("2026-09-01T15:00:00.000Z"),
            hasCallDown: false,
            employeeId: "e1",
            employeeDisplayName: "Pat Server",
            locationChangedDuringEdits: false,
          },
        ],
        scheduledPresence: [
          {
            id: "sch-1",
            employeeId: "e2",
            employeeDisplayName: "Other",
            unitId: "unit-1",
            departmentId: "d1",
            shift: "AM",
          },
          {
            id: "sch-2",
            employeeId: "e3",
            employeeDisplayName: "Third",
            unitId: "unit-1",
            departmentId: "d1",
            shift: "AM",
          },
        ],
      }),
    ],
    "2026-09-01",
    "2026-09-01",
  );
  assert.equal(range.days[0]?.coverage.slots[0]?.state, "at_risk");
  assert.equal(range.totals.coverageAtRisk, 1);
  assert.equal(range.totals.scheduledPresence, 2);
});

test("quiet and empty range copy stay factual", () => {
  const quiet = presentOperationalReviewRange(
    rangeOf(
      [facts({ serviceDate: "2026-09-01" }), facts({ serviceDate: "2026-09-02" })],
      "2026-09-01",
      "2026-09-02",
    ),
  );
  assert.equal(quiet.quiet, true);
  const empty = presentOperationalReviewRange(
    composeOperationalReviewRange({
      days: [],
      startServiceDate: "2026-09-01",
      endServiceDate: "2026-09-02",
      todayKey: "2026-09-15",
    }),
  );
  assert.equal(empty.empty, true);
});

test("current-day inclusion still uses the historical day model", () => {
  const range = composeOperationalReviewRange({
    days: [
      composeOperationalReviewDay(
        facts({
          serviceDate: "2026-09-15",
          todayKey: "2026-09-15",
          attachmentSegments: [coolerAttachment()],
        }),
      ),
    ],
    startServiceDate: "2026-09-15",
    endServiceDate: "2026-09-15",
    todayKey: "2026-09-15",
  });
  assert.equal(range.days[0]?.serviceDate, "2026-09-15");
  assert.ok(range.days[0]?.evidence.occurrences.every((row) => row.state === "not_complete"));
  const presented = presentOperationalReviewRange(range);
  assert.equal(presented.days[0]?.href, "/reports?date=2026-09-15");
});
