import assert from "node:assert/strict";
import test from "node:test";

import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";

import { composeOperationalReviewDay } from "./compose-operational-review-day";
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

function cycle(overrides?: Partial<OperationalCycleDefinition>): OperationalCycleDefinition {
  return {
    id: "cyc-breakfast-v1",
    stableKey: "breakfast",
    parentStableKey: null,
    nodeKind: "PERIOD",
    version: 1,
    label: "Breakfast",
    description: null,
    cycleType: "SERVICE",
    displaySequence: 10,
    startLocal: "07:00",
    endLocal: "09:00",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-09-01T00:00:00.000Z"),
    mealType: "BREAKFAST",
    locationMode: "OPERATIONAL_TYPES",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    applicableOperationalTypeKeys: ["servery"],
    roomTypeKey: null,
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    status: "RETIRED",
    unitIds: ["unit-1"],
    spaceIds: ["space-1"],
    milestoneTimes: [{ unitId: "unit-1", milestone: "READY", configuredTime: "07:00" }],
    keyTimeGroups: [],
    ...overrides,
  };
}

function logsCycle(dateKey: string, startLocal: string, endLocal: string, label = "Breakfast") {
  const instants = resolveCycleWindowInstants({
    operationalDateKey: dateKey,
    startLocal,
    endLocal,
    overnight: false,
    facilityTimezone: TZ,
  });
  assert.ok(instants);
  return {
    stableKey: "breakfast",
    label,
    startLocal,
    endLocal,
    overnight: false,
    startsAt: instants.startsAt,
    endsAt: instants.endsAt,
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
        retiredAt: new Date("2026-09-05T12:00:00.000Z"),
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

test("config change on Sept 2 does not rewrite Sept 1 expected cadence", () => {
  const sept1 = coolerAttachment({
    effectiveTo: new Date("2026-09-01T00:00:00.000Z"),
    status: "INACTIVE",
    updatedAt: new Date("2026-09-02T16:00:00.000Z"),
  });
  const sept2 = coolerAttachment({
    id: "att-cooler-2",
    stableKey: "att_cooler_2",
    effectiveFrom: new Date("2026-09-02T00:00:00.000Z"),
    dailyWindows: windows("THREE_TIMES_DAILY"),
  });
  const model = composeOperationalReviewDay(
    facts({
      attachmentSegments: [sept1, sept2],
    }),
  );
  const expected = model.evidence.occurrences.filter((row) => row.state !== "unavailable");
  assert.equal(expected.length, 2);
  assert.ok(expected.every((row) => row.attachmentId === "att-cooler"));
});

test("retired catalog still reconstructs the historical requirement", () => {
  const model = composeOperationalReviewDay(
    facts({
      serviceDate: "2026-09-03",
      attachmentSegments: [
        coolerAttachment({
          catalogDefinition: {
            id: "cat-cooler",
            name: "Cooler Temperature Log",
            purposeType: "LOG",
            instructions: "Check cooler.",
            status: "RETIRED",
            fields: [],
          },
        }),
      ],
    }),
  );
  assert.ok(model.evidence.occurrences.length >= 2);
  assert.ok(model.evidence.occurrences.every((row) => row.state === "not_complete"));
});

test("retired attachment remains expected inside its effective interval", () => {
  const model = composeOperationalReviewDay(
    facts({
      serviceDate: "2026-09-03",
      attachmentSegments: [
        coolerAttachment({
          status: "RETIRED",
          effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
          effectiveTo: new Date("2026-09-05T00:00:00.000Z"),
        }),
      ],
    }),
  );
  assert.equal(model.evidence.availability.status, "evaluated");
  assert.ok(model.evidence.occurrences.length >= 2);
  assert.ok(model.evidence.occurrences.every((row) => row.state === "not_complete"));
});

test("in-place historical ambiguity is unavailable, not fake missed evidence", () => {
  const model = composeOperationalReviewDay(
    facts({
      attachmentSegments: [
        coolerAttachment({
          updatedAt: new Date("2026-09-06T16:00:00.000Z"),
          dailyWindows: windows("THREE_TIMES_DAILY"),
        }),
      ],
    }),
  );
  assert.equal(model.evidence.availability.status, "unavailable");
  assert.equal(model.evidence.availability.reason, "attachment_history_not_reliable");
  assert.ok(model.evidence.occurrences.every((row) => row.state === "unavailable"));
  assert.ok(!model.evidence.occurrences.some((row) => row.state === "not_complete"));
});

test("cycle version for Sept 1 uses v1 timing, not v2", () => {
  const v1 = cycle();
  const v2 = cycle({
    id: "cyc-breakfast-v2",
    version: 2,
    startLocal: "08:00",
    endLocal: "10:00",
    effectiveFrom: new Date("2026-09-02T00:00:00.000Z"),
    effectiveTo: null,
    status: "PUBLISHED",
    milestoneTimes: [{ unitId: "unit-1", milestone: "READY", configuredTime: "08:00" }],
  });
  const model = composeOperationalReviewDay(
    facts({
      cycles: [v1],
      publishedCyclesForLogs: [logsCycle("2026-09-01", "07:00", "09:00")],
    }),
  );
  assert.equal(model.cycles.versions[0]?.version, 1);
  assert.equal(model.cycles.versions[0]?.startLocal, "07:00");
  assert.equal(model.milestones.items.find((row) => row.kind === "SERVERY_READY")?.expectedTimeLocal, "07:00");
  assert.equal(v2.version, 2);
});

test("OT version for Sept 2 uses v1 bindings, not current ACTIVE v2", () => {
  const model = composeOperationalReviewDay(
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
  );
  assert.equal(model.locations[0]?.operationalTypeKey, "servery");
});

test("coverage v1 remains historical expectation after isActive=false", () => {
  const model = composeOperationalReviewDay(
    facts({
      serviceDate: "2026-09-03",
      coverageTemplates: [
        {
          id: "cov-v1",
          stableKey: "servery-meals",
          version: 1,
          status: "PUBLISHED",
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
          status: "PUBLISHED",
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
      ],
    }),
  );
  assert.equal(model.coverage.availability.status, "evaluated");
  assert.equal(model.coverage.slots[0]?.templateVersion, 1);
  assert.equal(model.coverage.slots[0]?.requiredCount, 2);
});

test("OA actual of 1 against required 2 is at risk; schedule count does not cover", () => {
  const model = composeOperationalReviewDay(
    facts({
      coverageTemplates: [
        {
          id: "cov-v1",
          stableKey: "servery-meals",
          version: 1,
          status: "PUBLISHED",
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
      ],
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
          employeeDisplayName: "Other Person",
          unitId: "unit-1",
          departmentId: "d1",
          shift: "AM",
        },
        {
          id: "sch-2",
          employeeId: "e3",
          employeeDisplayName: "Third Person",
          unitId: "unit-1",
          departmentId: "d1",
          shift: "AM",
        },
      ],
    }),
  );
  assert.equal(model.coverage.slots[0]?.filledCount, 1);
  assert.equal(model.coverage.slots[0]?.state, "at_risk");
  assert.equal(model.presence.scheduled.length, 2);
});

test("presence keeps scheduled and call-off distinct and claims no attendance", () => {
  const model = composeOperationalReviewDay(
    facts({
      scheduledPresence: [
        {
          id: "sch-mary",
          employeeId: "mary",
          employeeDisplayName: "Mary",
          unitId: "unit-1",
          departmentId: "d1",
          shift: "AM",
        },
      ],
      presenceExceptions: [
        {
          id: "ov-1",
          employeeId: "mary",
          employeeDisplayName: "Mary",
          reason: "Called off",
          oldUnitId: "unit-1",
          newUnitId: "unit-1",
        },
      ],
    }),
  );
  assert.equal(model.presence.scheduled[0]?.employeeDisplayName, "Mary");
  assert.equal(model.presence.exceptions[0]?.kind, "called_off");
  assert.equal(model.presence.attendanceClaimed, false);
});

test("missed Harbor evidence does not require a submission row", () => {
  const model = composeOperationalReviewDay(
    facts({
      attachmentSegments: [coolerAttachment()],
      evidenceRecords: [],
    }),
  );
  assert.ok(model.evidence.occurrences.length >= 2);
  assert.ok(model.evidence.occurrences.every((row) => row.state === "not_complete"));
  assert.ok(model.evidence.occurrences.every((row) => row.recordId === null));
});

test("corrective evidence is completed with corrective attention", () => {
  const attachment = coolerAttachment();
  const projected = composeOperationalReviewDay(facts({ attachmentSegments: [attachment] }));
  const firstKey = projected.evidence.occurrences[0]!.requirementKey;
  const model = composeOperationalReviewDay(
    facts({
      attachmentSegments: [attachment],
      evidenceRecords: [
        evidence({
          id: "ev-1",
          requirementKey: firstKey,
          status: "COMPLETED_WITH_CORRECTIVE_ACTION",
        }),
      ],
    }),
  );
  const hit = model.evidence.occurrences.find((row) => row.requirementKey === firstKey);
  assert.equal(hit?.state, "completed_with_corrective_action");
  assert.equal(hit?.recordId, "ev-1");
});

test("late recording stays on the occurred service date and retains recordedAt", () => {
  const attachment = coolerAttachment();
  const projected = composeOperationalReviewDay(facts({ attachmentSegments: [attachment] }));
  const firstKey = projected.evidence.occurrences[0]!.requirementKey;
  const model = composeOperationalReviewDay(
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
  );
  const hit = model.evidence.occurrences.find((row) => row.requirementKey === firstKey);
  assert.equal(hit?.operationalDateKey, "2026-09-01");
  assert.equal(hit?.occurredAt, "2026-09-01T15:00:00.000Z");
  assert.equal(hit?.recordedAt, "2026-09-02T13:00:00.000Z");
});

test("legacy-only date makes evidence expectation unavailable", () => {
  const model = composeOperationalReviewDay(
    facts({
      attachmentSegments: [],
      legacySubmissionPresent: true,
    }),
  );
  assert.equal(model.evidence.availability.status, "unavailable");
  assert.equal(model.evidence.availability.reason, "legacy_only_date");
  assert.equal(model.evidence.occurrences.length, 0);
});

test("facility timezone controls service-date identity in the model", () => {
  const now = new Date("2026-09-02T03:30:00.000Z");
  const serviceDate = toServiceDateKey(getFacilityServiceDate(TZ, now));
  assert.equal(serviceDate, "2026-09-01");
  const model = composeOperationalReviewDay(facts({ serviceDate, now, todayKey: serviceDate }));
  assert.equal(model.serviceDate, "2026-09-01");
  assert.equal(model.timezone, TZ);
});

test("Work historical expectation is deferred", () => {
  const model = composeOperationalReviewDay(facts());
  assert.equal(model.work.availability.status, "unavailable");
  assert.equal(model.work.availability.reason, "unsupported_work_history");
});

test("milestone expected stays distinct from actual", () => {
  const model = composeOperationalReviewDay(
    facts({
      cycles: [cycle()],
      serveryMilestoneActuals: [
        {
          unitId: "unit-1",
          mealType: "BREAKFAST",
          milestone: "READY",
          occurredAt: new Date("2026-09-01T11:10:00.000Z"),
          recordedAt: new Date("2026-09-01T11:12:00.000Z"),
        },
      ],
    }),
  );
  const ready = model.milestones.items.find((row) => row.kind === "SERVERY_READY");
  assert.equal(ready?.expectedTimeLocal, "07:00");
  assert.equal(ready?.actualOccurredAt, "2026-09-01T11:10:00.000Z");
  assert.equal(ready?.actualRecordedAt, "2026-09-01T11:12:00.000Z");
});
