import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkRequirements } from "@/lib/department-work/resolve-requirements";

import {
  appendKeyPointActual,
  applyCanonicalKeyPointOccurrence,
  canonicalParentRejection,
  containmentRejection,
  cycleServiceDateKey,
  displayParentStableKey,
  instantContainedInCycle,
  presentKeyPointRuntime,
  projectReviewKeyTimeOccurrences,
  validateStarterStructure,
  validateTimingAdjustment,
  windowContainedInCycle,
} from "./cycle-canonical";
import { effectiveCycleSpaceIds } from "./effective-cycle-spaces";
import { buildDietaryDefaultCyclePlans, buildEvsDefaultCyclePlans } from "./defaults";
import { resolveOperationalCycle } from "./resolve-operational-cycle";
import type { OperationalCycleDefinition } from "./types";
import { validateCycle } from "./validate-cycle";

const root = {
  stableKey: "breakfast",
  parentStableKey: null,
  nodeKind: "PERIOD" as const,
  startLocal: "05:00",
  endLocal: "10:00",
  overnight: false,
};

test("a Phase directly under a Cycle is valid", () => {
  assert.equal(
    canonicalParentRejection({
      nodeKind: "PERIOD",
      parent: root,
    }),
    null,
  );
  const result = validateCycle({
    label: "Prep",
    cycleType: "PREPARATION",
    nodeKind: "PERIOD",
    parentStableKey: "breakfast",
    parentNode: root,
    startLocal: "05:00",
    endLocal: "07:00",
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-10-01",
    locationMode: "ALL_DEPARTMENT_UNITS",
  });
  assert.equal(result.valid, true);
});

test("a Phase under another Phase is rejected for new configuration", () => {
  const message = canonicalParentRejection({
    nodeKind: "PERIOD",
    parent: {
      stableKey: "service",
      parentStableKey: "breakfast",
      nodeKind: "PERIOD",
    },
  });
  assert.match(message ?? "", /cannot contain another Phase/);
});

test("a Key Point directly under a Cycle is valid", () => {
  assert.equal(
    canonicalParentRejection({ nodeKind: "KEY_TIME", parent: root }),
    null,
  );
});

test("a Key Point parented to a Phase is rejected for new configuration", () => {
  const message = canonicalParentRejection({
    nodeKind: "KEY_TIME",
    parent: {
      stableKey: "service",
      parentStableKey: "breakfast",
      nodeKind: "PERIOD",
    },
  });
  assert.match(message ?? "", /not on a Phase/);
});

test("a Cycle with no Phases and no Key Points still validates", () => {
  const result = validateCycle({
    label: "Night Operations",
    cycleType: "CUSTOM",
    nodeKind: "PERIOD",
    startLocal: "22:00",
    endLocal: "06:00",
    overnight: true,
    applicableDaysOfWeek: [1, 2, 3, 4, 5],
    effectiveFrom: "2026-10-01",
    locationMode: "ALL_DEPARTMENT_UNITS",
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("overnight containment accepts an interior Phase and Key Point and rejects outsiders", () => {
  const cycle = {
    cycleStartLocal: "22:00",
    cycleEndLocal: "06:00",
    overnight: true,
  };
  assert.equal(
    windowContainedInCycle({ ...cycle, startLocal: "23:00", endLocal: "02:00" }),
    true,
  );
  assert.equal(
    windowContainedInCycle({ ...cycle, startLocal: "20:00", endLocal: "23:00" }),
    false,
  );
  assert.equal(instantContainedInCycle({ ...cycle, dueLocal: "01:00" }), true);
  assert.equal(instantContainedInCycle({ ...cycle, dueLocal: "08:00" }), false);
  assert.match(
    containmentRejection({
      nodeKind: "KEY_TIME",
      parent: {
        stableKey: "night",
        parentStableKey: null,
        nodeKind: "PERIOD",
        startLocal: "22:00",
        endLocal: "06:00",
        overnight: true,
      },
      dueLocals: ["08:00"],
    }) ?? "",
    /inside its Operational Cycle/,
  );
});

test("overnight Cycle service date is the facility-local start date", () => {
  const resolved = cycleServiceDateKey({
    operationalDateKey: "2026-10-01",
    startLocal: "22:00",
    endLocal: "06:00",
    overnight: true,
    facilityTimezone: "UTC",
  });
  assert.ok(resolved);
  assert.equal(resolved?.serviceDateKey, "2026-10-01");
  assert.ok(resolved && resolved.endsAt.getTime() > resolved.startsAt.getTime());
  assert.equal(resolved?.endsAt.toISOString().slice(0, 10), "2026-10-02");
});

test("historical Key Point stored under a Phase displays on the Cycle", () => {
  const byKey = new Map([
    ["breakfast", { stableKey: "breakfast", parentStableKey: null, nodeKind: "PERIOD" as const }],
    ["service", { stableKey: "service", parentStableKey: "breakfast", nodeKind: "PERIOD" as const }],
    ["due", { stableKey: "due", parentStableKey: "service", nodeKind: "KEY_TIME" as const }],
  ]);
  assert.equal(displayParentStableKey(byKey.get("due")!, byKey), "breakfast");
  assert.equal(byKey.get("due")?.parentStableKey, "service");
});

test("NONE does not require an actual, OPTIONAL may have one, REQUIRED reports absence without a row", () => {
  const none = presentKeyPointRuntime({
    tracking: "NONE",
    plannedDueLocal: "08:00",
    nowLocal: "08:30",
  });
  assert.equal(none.requiresActual, false);
  assert.equal(none.state, "past");
  assert.equal(none.actualLocal, null);

  const optional = presentKeyPointRuntime({
    tracking: "OPTIONAL",
    plannedDueLocal: "08:00",
    nowLocal: "07:00",
    actuals: [
      {
        id: "a1",
        actualLocal: "08:17",
        recordedAt: "2026-10-01T12:20:00.000Z",
        correctionReason: null,
        correctsActualId: null,
      },
    ],
  });
  assert.equal(optional.requiresActual, false);
  assert.equal(optional.state, "recorded");
  assert.equal(optional.actualLocal, "08:17");

  const required = presentKeyPointRuntime({
    tracking: "REQUIRED",
    plannedDueLocal: "08:00",
    nowLocal: "08:30",
  });
  assert.equal(required.requiresActual, true);
  assert.equal(required.state, "absent");
  assert.equal(required.actualLocal, null);
});

test("adjustment keeps planned time distinct and requires reason and actor", () => {
  assert.equal(validateTimingAdjustment({ reason: "", actorId: "u1", adjustedDueLocal: "08:15" }).ok, false);
  assert.equal(validateTimingAdjustment({ reason: "service delayed", actorId: "", adjustedDueLocal: "08:15" }).ok, false);
  const view = presentKeyPointRuntime({
    tracking: "REQUIRED",
    plannedDueLocal: "08:00",
    adjustedDueLocal: "08:15",
    nowLocal: "08:20",
    actuals: [
      {
        id: "a1",
        actualLocal: "08:17",
        recordedAt: "2026-10-01T12:30:00.000Z",
        correctionReason: null,
        correctsActualId: null,
      },
    ],
  });
  assert.equal(view.plannedLocal, "08:00");
  assert.equal(view.adjustedLocal, "08:15");
  assert.equal(view.actualLocal, "08:17");
  assert.equal(view.recordedAt, "2026-10-01T12:30:00.000Z");
});

test("a correction keeps the original actual", () => {
  const first = appendKeyPointActual({
    existing: [],
    id: "a1",
    actualLocal: "08:17",
    recordedAt: "2026-10-01T12:30:00.000Z",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const corrected = appendKeyPointActual({
    existing: first.facts,
    id: "a2",
    actualLocal: "08:15",
    recordedAt: "2026-10-01T13:00:00.000Z",
    correctionReason: "entry error",
  });
  assert.equal(corrected.ok, true);
  if (!corrected.ok) return;
  assert.equal(corrected.facts[0]?.actualLocal, "08:17");
  assert.equal(corrected.facts[1]?.actualLocal, "08:15");
  assert.equal(corrected.facts[1]?.correctsActualId, "a1");
});

test("Phase participation replaces or inherits and does not union", () => {
  const breakfast = {
    stableKey: "breakfast",
    parentStableKey: null,
    nodeKind: "PERIOD" as const,
    locationMode: "EXPLICIT_UNITS" as const,
    locationInheritFromParent: false,
    spaceIds: ["food-service"],
    keyTimeGroups: [],
  };
  const prep = {
    ...breakfast,
    stableKey: "prep",
    parentStableKey: "breakfast",
    locationInheritFromParent: false,
    spaceIds: ["production", "food-service"],
  };
  const service = {
    ...breakfast,
    stableKey: "service",
    parentStableKey: "breakfast",
    locationInheritFromParent: true,
    spaceIds: ["production"],
  };
  const byKey = new Map<string, Parameters<typeof effectiveCycleSpaceIds>[0]>();
  byKey.set(breakfast.stableKey, breakfast);
  byKey.set(prep.stableKey, prep);
  byKey.set(service.stableKey, service);
  assert.deepEqual(effectiveCycleSpaceIds(prep, byKey), ["production", "food-service"]);
  assert.deepEqual(effectiveCycleSpaceIds(service, byKey), ["food-service"]);
});

function period(partial: Partial<OperationalCycleDefinition> & { id: string; label: string; startLocal: string; endLocal: string }): OperationalCycleDefinition {
  return {
    stableKey: partial.stableKey ?? partial.id,
    parentStableKey: partial.parentStableKey ?? null,
    nodeKind: "PERIOD",
    version: 1,
    description: null,
    cycleType: "CUSTOM",
    displaySequence: partial.displaySequence ?? 10,
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: null,
    locationMode: "ALL_DEPARTMENT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    expectedMilestones: [],
    status: "PUBLISHED",
    roomTypeKey: null,
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
    ...partial,
  };
}

test("overlapping Cycles and Phases can both be active", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      period({ id: "breakfast", label: "Breakfast", startLocal: "05:00", endLocal: "10:00", displaySequence: 10 }),
      period({ id: "retail", label: "Retail Morning", startLocal: "06:00", endLocal: "11:00", displaySequence: 20 }),
      period({
        id: "prep",
        stableKey: "prep",
        label: "Prep",
        parentStableKey: "breakfast",
        startLocal: "05:00",
        endLocal: "08:00",
        displaySequence: 11,
      }),
      period({
        id: "service",
        stableKey: "service",
        label: "Service",
        parentStableKey: "breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
        displaySequence: 12,
      }),
    ],
    now: new Date("2026-10-01T07:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-10-01",
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state !== "ACTIVE") return;
  const keys = ctx.activeCycles.map((cycle) => cycle.stableKey).sort();
  assert.deepEqual(keys, ["breakfast", "prep", "retail", "service"]);
});

test("a Cycle can be active while no Phase is active", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      period({ id: "breakfast", label: "Breakfast", startLocal: "05:00", endLocal: "10:00" }),
      period({
        id: "prep",
        stableKey: "prep",
        label: "Prep",
        parentStableKey: "breakfast",
        startLocal: "05:00",
        endLocal: "07:00",
      }),
      period({
        id: "service",
        stableKey: "service",
        label: "Service",
        parentStableKey: "breakfast",
        startLocal: "07:30",
        endLocal: "09:00",
      }),
    ],
    now: new Date("2026-10-01T07:15:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-10-01",
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state !== "ACTIVE") return;
  assert.deepEqual(
    ctx.activeCycles.map((cycle) => cycle.stableKey),
    ["breakfast"],
  );
});

test("Dietary and EVS starters obey one Phase level and Cycle-parented Key Points", () => {
  assert.deepEqual(validateStarterStructure(buildDietaryDefaultCyclePlans()), []);
  assert.deepEqual(validateStarterStructure(buildEvsDefaultCyclePlans()), []);
});

test("Key Points are not Work schedule targets", () => {
  const requirements = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dietary",
    operationalDateKey: "2026-10-01",
    now: new Date("2026-10-01T12:00:00.000Z"),
    facilityTimezone: "UTC",
    candidateUnitIds: ["unit-a"],
    spaces: [{ id: "room-a", spaceType: "SERVICE_AREA", unitId: "unit-a" }],
    publishedPlans: [
      {
        id: "plan",
        stableKey: "plan",
        version: 1,
        name: "Due work",
        status: "PUBLISHED",
        effectiveStartDate: null,
        effectiveEndDate: null,
        weekdays: [],
        applicabilities: [
          {
            kind: "DEPARTMENT_UNIT",
            unitId: null,
            spaceId: null,
            spaceType: null,
            assetId: null,
            assetType: null,
          },
        ],
        items: [
          {
            id: "item",
            itemKey: "item",
            label: "Marker",
            instructions: null,
            displaySequence: 1,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["breakfast_due", "breakfast"],
            windowStartLocal: null,
            windowEndLocal: null,
            dueOffsetKind: null,
            dueOffsetMinutes: null,
            roleKeys: [],
            unitId: null,
            spaceId: null,
            assetId: null,
            knowledgeArticleId: null,
            procedureTitleSnapshot: null,
            linkedTemplateStableKey: null,
            linkedTemplateId: null,
            supervisorVisible: true,
          },
        ],
      },
    ],
    publishedCycles: [
      {
        stableKey: "breakfast",
        label: "Breakfast",
        nodeKind: "PERIOD",
        startLocal: "05:00",
        endLocal: "10:00",
        startsAt: new Date("2026-10-01T05:00:00.000Z"),
        endsAt: new Date("2026-10-01T10:00:00.000Z"),
        departmentWide: true,
        participatingSpaceIds: ["room-a"],
      },
      {
        stableKey: "breakfast_due",
        label: "Breakfast Due",
        nodeKind: "KEY_TIME",
        startLocal: "08:00",
        endLocal: "08:00",
        startsAt: new Date("2026-10-01T08:00:00.000Z"),
        endsAt: new Date("2026-10-01T08:00:00.000Z"),
        departmentWide: true,
        participatingSpaceIds: ["room-a"],
      },
    ],
    confirmedAssignments: [],
    existingOccurrences: [],
  });
  assert.ok(requirements.every((row) => row.cycleStableKey !== "breakfast_due"));
  assert.ok(requirements.some((row) => row.cycleStableKey === "breakfast"));
});

test("a Key Time expectation pointer does not prove the occurrence", () => {
  const recordedAt = new Date("2026-10-05T11:17:00.000Z");
  const correctedAt = new Date("2026-10-05T11:25:00.000Z");
  const timings = applyCanonicalKeyPointOccurrence(
    [
      {
        cycleId: "cycle-ready",
        spaceId: "room-a",
        actualDueLocal: "07:40",
        completedAt: new Date("2026-10-05T11:40:00.000Z"),
      },
      {
        cycleId: "cycle-open",
        spaceId: "room-a",
        actualDueLocal: null,
        completedAt: null,
      },
      {
        cycleId: "cycle-pointer",
        spaceId: "room-a",
        actualDueLocal: "09:00",
        completedAt: new Date("2026-10-05T13:00:00.000Z"),
      },
    ],
    [
      {
        cycleId: "cycle-ready",
        spaceId: "room-a",
        actualLocal: "07:10",
        recordedAt,
      },
      {
        cycleId: "cycle-ready",
        spaceId: "room-a",
        actualLocal: "07:12",
        recordedAt: correctedAt,
      },
      {
        cycleId: "cycle-open",
        spaceId: "room-b",
        actualLocal: "08:00",
        recordedAt,
      },
    ],
  );
  assert.equal(timings[0]?.actualDueLocal, "07:12");
  assert.equal(timings[0]?.completedAt, correctedAt);
  assert.equal(timings[1]?.actualDueLocal, null);
  assert.equal(timings[1]?.completedAt, null);
  assert.equal(timings[2]?.actualDueLocal, null);
  assert.equal(timings[2]?.completedAt, null);
});

test("review occurrence follows the Key Point actual, including an actual with no expectation row", () => {
  const recordedAt = new Date("2026-10-05T11:10:00.000Z");
  const projected = projectReviewKeyTimeOccurrences(
    [
      {
        spaceId: "room-a",
        cycleStableKey: "breakfast_ready",
        cycleVersion: 4,
        cycleLabel: "Ready",
        configuredDueLocal: "07:05",
        adjustedDueLocal: null,
      },
    ],
    [
      {
        spaceId: "room-a",
        cycleStableKey: "breakfast_ready",
        cycleVersion: 4,
        recordedAt,
      },
      {
        spaceId: "room-b",
        cycleStableKey: "breakfast_service_started",
        cycleVersion: 4,
        recordedAt,
      },
    ],
  );
  assert.equal(projected[0]?.completedAt, recordedAt);
  assert.equal(projected[1]?.spaceId, "room-b");
  assert.equal(projected[1]?.completedAt, recordedAt);
  assert.equal(projected[1]?.configuredDueLocal, "");
});
