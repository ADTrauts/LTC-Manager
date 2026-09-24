import assert from "node:assert/strict";
import test from "node:test";

import {
  describeCycleApplicability,
  matchCycleApplicability,
  primaryCycleApplicabilitySource,
} from "./cycle-applicability";
import { buildCyclesByStableKey } from "./effective-cycle-spaces";
import { cycleAppliesToSpace, resolveOperationalCycle } from "./resolve-operational-cycle";
import { toServiceDateKey } from "@/lib/operational-time";
import type { OperationalCycleDefinition } from "./types";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function cycle(
  overrides: Partial<OperationalCycleDefinition> &
    Pick<OperationalCycleDefinition, "id" | "label">,
): OperationalCycleDefinition {
  return {
    stableKey: overrides.stableKey ?? overrides.id,
    parentStableKey: overrides.parentStableKey ?? null,
    nodeKind: "PERIOD",
    version: 1,
    description: null,
    cycleType: "SERVICE",
    displaySequence: 100,
    startLocal: "07:00",
    endLocal: "10:00",
    overnight: false,
    applicableDaysOfWeek: ALL_DAYS,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: "BREAKFAST",
    locationMode: "OPERATIONAL_TYPES",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    applicableOperationalTypeKeys: [],
    expectedMilestones: [],
    status: "PUBLISHED",
    roomTypeKey: null,
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
    ...overrides,
  };
}

function publishedSet(rows: OperationalCycleDefinition[]) {
  return buildCyclesByStableKey(rows);
}

function effectiveOnDate(cycle: OperationalCycleDefinition, dateKey: string): boolean {
  if (cycle.status !== "PUBLISHED" && cycle.status !== "RETIRED") return false;
  const fromKey = toServiceDateKey(cycle.effectiveFrom);
  const toKey = cycle.effectiveTo ? toServiceDateKey(cycle.effectiveTo) : null;
  if (fromKey > dateKey) return false;
  if (toKey && toKey < dateKey) return false;
  return true;
}

test("one cycle applies to one Operational Type and not to other types or untyped rooms", () => {
  const breakfast = cycle({
    id: "breakfast",
    label: "Breakfast",
    applicableOperationalTypeKeys: ["servery"],
  });
  const byKey = publishedSet([breakfast]);
  const servery = matchCycleApplicability({
    cycle: breakfast,
    allCyclesByStableKey: byKey,
    context: { spaceId: "s1", operationalTypeKey: "servery", operationalTypeName: "Servery" },
  });
  const retail = matchCycleApplicability({
    cycle: breakfast,
    allCyclesByStableKey: byKey,
    context: { spaceId: "r1", operationalTypeKey: "retail", operationalTypeName: "Retail" },
  });
  const untyped = matchCycleApplicability({
    cycle: breakfast,
    allCyclesByStableKey: byKey,
    context: { spaceId: "u1", operationalTypeKey: null },
  });

  assert.deepEqual(servery?.sources, ["OPERATIONAL_TYPE_DEFAULT"]);
  assert.equal(
    describeCycleApplicability(servery!),
    "Inherited from Operational Type: Servery",
  );
  assert.equal(retail, null);
  assert.equal(untyped, null);
  assert.equal(cycleAppliesToSpace(breakfast, "s1", byKey, { operationalTypeKey: "servery" }), true);
  assert.equal(cycleAppliesToSpace(breakfast, "r1", byKey, { operationalTypeKey: "retail" }), false);
  assert.equal(cycleAppliesToSpace(breakfast, "u1", byKey, { operationalTypeKey: null }), false);
});

test("one cycle can target multiple Operational Types", () => {
  const lunch = cycle({
    id: "lunch",
    label: "Lunch",
    mealType: "LUNCH",
    applicableOperationalTypeKeys: ["servery", "retail"],
  });
  const byKey = publishedSet([lunch]);
  assert.ok(
    matchCycleApplicability({
      cycle: lunch,
      allCyclesByStableKey: byKey,
      context: { spaceId: "s1", operationalTypeKey: "servery", operationalTypeName: "Servery" },
    }),
  );
  assert.ok(
    matchCycleApplicability({
      cycle: lunch,
      allCyclesByStableKey: byKey,
      context: { spaceId: "r1", operationalTypeKey: "retail", operationalTypeName: "Retail" },
    }),
  );
  assert.equal(
    matchCycleApplicability({
      cycle: lunch,
      allCyclesByStableKey: byKey,
      context: { spaceId: "k1", operationalTypeKey: "main_kitchen", operationalTypeName: "Main Kitchen" },
    }),
    null,
  );
});

test("Servery, Retail, and Main Kitchen cycle sets stay isolated", () => {
  const breakfast = cycle({
    id: "breakfast",
    label: "Breakfast",
    applicableOperationalTypeKeys: ["servery"],
  });
  const retailOpen = cycle({
    id: "retail-open",
    label: "Retail Opening",
    startLocal: "06:00",
    endLocal: "07:00",
    mealType: null,
    cycleType: "PREPARATION",
    applicableOperationalTypeKeys: ["retail"],
  });
  const production = cycle({
    id: "production",
    label: "Production Start",
    startLocal: "04:00",
    endLocal: "06:00",
    mealType: null,
    cycleType: "PREPARATION",
    applicableOperationalTypeKeys: ["main_kitchen"],
  });
  const rows = [breakfast, retailOpen, production];
  const byKey = publishedSet(rows);

  function labels(ot: string | null, spaceId: string) {
    return rows
      .filter((row) =>
        matchCycleApplicability({
          cycle: row,
          allCyclesByStableKey: byKey,
          context: { spaceId, operationalTypeKey: ot },
        }),
      )
      .map((row) => row.label);
  }

  assert.deepEqual(labels("servery", "s1"), ["Breakfast"]);
  assert.deepEqual(labels("retail", "r1"), ["Retail Opening"]);
  assert.deepEqual(labels("main_kitchen", "k1"), ["Production Start"]);
  assert.deepEqual(labels(null, "u1"), []);
});

test("changing Operational Type changes resolved cycles without copying cycle rows", () => {
  const breakfast = cycle({
    id: "breakfast",
    label: "Breakfast",
    applicableOperationalTypeKeys: ["servery"],
  });
  const retailClose = cycle({
    id: "retail-close",
    label: "Retail Close",
    startLocal: "18:00",
    endLocal: "20:00",
    mealType: null,
    cycleType: "CLOSEOUT",
    applicableOperationalTypeKeys: ["retail"],
  });
  const byKey = publishedSet([breakfast, retailClose]);
  const before = matchCycleApplicability({
    cycle: breakfast,
    allCyclesByStableKey: byKey,
    context: { spaceId: "temp", operationalTypeKey: "servery", operationalTypeName: "Servery" },
  });
  const afterBreakfast = matchCycleApplicability({
    cycle: breakfast,
    allCyclesByStableKey: byKey,
    context: { spaceId: "temp", operationalTypeKey: "retail", operationalTypeName: "Retail" },
  });
  const afterRetail = matchCycleApplicability({
    cycle: retailClose,
    allCyclesByStableKey: byKey,
    context: { spaceId: "temp", operationalTypeKey: "retail", operationalTypeName: "Retail" },
  });

  assert.equal(before?.sources[0], "OPERATIONAL_TYPE_DEFAULT");
  assert.equal(afterBreakfast, null);
  assert.equal(afterRetail?.sources[0], "OPERATIONAL_TYPE_DEFAULT");
  assert.deepEqual(breakfast.spaceIds, []);
  assert.deepEqual(retailClose.spaceIds, []);
});

test("draft cycles do not affect current Run while published current versions do", () => {
  const draft = cycle({
    id: "breakfast-draft",
    label: "Breakfast draft",
    status: "DRAFT",
    applicableOperationalTypeKeys: ["servery"],
  });
  const published = cycle({
    id: "breakfast-pub",
    label: "Breakfast",
    applicableOperationalTypeKeys: ["servery"],
  });
  const future = cycle({
    id: "breakfast-future",
    label: "Breakfast next week",
    effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
    applicableOperationalTypeKeys: ["servery"],
  });
  const now = new Date("2026-09-21T08:30:00.000Z");
  const draftCtx = resolveOperationalCycle({
    cycles: [draft],
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-09-21",
    spaceId: "s1",
    operationalTypeKey: "servery",
  });
  const publishedCtx = resolveOperationalCycle({
    cycles: [published],
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-09-21",
    spaceId: "s1",
    operationalTypeKey: "servery",
  });
  const futureOnToday = resolveOperationalCycle({
    cycles: [future].filter((row) => effectiveOnDate(row, "2026-09-21")),
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-09-21",
    spaceId: "s1",
    operationalTypeKey: "servery",
  });
  const futureOnEffectiveDate = resolveOperationalCycle({
    cycles: [future].filter((row) => effectiveOnDate(row, "2026-10-01")),
    now: new Date("2026-10-01T08:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-10-01",
    spaceId: "s1",
    operationalTypeKey: "servery",
  });

  assert.equal(draftCtx.state, "NOT_CONFIGURED");
  assert.equal(publishedCtx.state, "ACTIVE");
  assert.equal(futureOnToday.state, "NOT_CONFIGURED");
  assert.equal(futureOnEffectiveDate.state, "ACTIVE");
});

test("resolver provenance distinguishes OT, explicit, department-wide, and legacy physical", () => {
  const ot = cycle({
    id: "ot",
    label: "Breakfast",
    applicableOperationalTypeKeys: ["servery"],
  });
  const explicit = cycle({
    id: "explicit",
    label: "Special Event Service",
    locationMode: "EXPLICIT_UNITS",
    spaceIds: ["s1"],
  });
  const department = cycle({
    id: "dept",
    label: "Department Standup",
    locationMode: "ALL_DEPARTMENT_UNITS",
    startLocal: "06:00",
    endLocal: "06:30",
    mealType: null,
    cycleType: "CUSTOM",
  });
  const physical = cycle({
    id: "physical",
    label: "Servery Physical",
    locationMode: "ROOM_TYPE",
    roomTypeKey: "servery",
  });
  const byKey = publishedSet([ot, explicit, department, physical]);
  const context = {
    spaceId: "s1",
    operationalTypeKey: "servery",
    operationalTypeName: "Servery",
    physicalRoomTypeKey: "servery",
  };

  assert.equal(
    describeCycleApplicability(
      matchCycleApplicability({ cycle: ot, allCyclesByStableKey: byKey, context })!,
    ),
    "Inherited from Operational Type: Servery",
  );
  assert.equal(
    describeCycleApplicability(
      matchCycleApplicability({ cycle: explicit, allCyclesByStableKey: byKey, context })!,
    ),
    "Applied directly to this location",
  );
  assert.equal(
    describeCycleApplicability(
      matchCycleApplicability({ cycle: department, allCyclesByStableKey: byKey, context })!,
    ),
    "Applies to the entire department",
  );
  assert.equal(
    describeCycleApplicability(
      matchCycleApplicability({ cycle: physical, allCyclesByStableKey: byKey, context })!,
    ),
    "Legacy applicability: Physical Room Type",
  );
  assert.notEqual(physical.locationMode, "OPERATIONAL_TYPES");
});

test("duplicate OT + explicit applicability collapses to one cycle with both sources", () => {
  const breakfast = cycle({
    id: "breakfast",
    label: "Breakfast",
    applicableOperationalTypeKeys: ["servery"],
    spaceIds: ["s1"],
  });
  const byKey = publishedSet([breakfast]);
  const match = matchCycleApplicability({
    cycle: breakfast,
    allCyclesByStableKey: byKey,
    context: {
      spaceId: "s1",
      operationalTypeKey: "servery",
      operationalTypeName: "Servery",
    },
  });
  assert.deepEqual(match?.sources, ["OPERATIONAL_TYPE_DEFAULT", "EXPLICIT_LOCATION"]);
  assert.equal(primaryCycleApplicabilitySource(match!.sources), "OPERATIONAL_TYPE_DEFAULT");
  assert.match(describeCycleApplicability(match!), /Inherited from Operational Type: Servery/);
  assert.match(describeCycleApplicability(match!), /Applied directly to this location/);
});

test("physical ROOM_TYPE never masquerades as Operational Type", () => {
  const physical = cycle({
    id: "physical",
    label: "Breakfast",
    locationMode: "ROOM_TYPE",
    roomTypeKey: "servery",
  });
  const byKey = publishedSet([physical]);
  const match = matchCycleApplicability({
    cycle: physical,
    allCyclesByStableKey: byKey,
    context: {
      spaceId: "s1",
      operationalTypeKey: "retail",
      operationalTypeName: "Retail",
      physicalRoomTypeKey: "servery",
    },
  });
  assert.deepEqual(match?.sources, ["LEGACY_PHYSICAL_ROOM_TYPE"]);
  assert.equal(match?.operationalTypeKey, null);
  assert.equal(
    cycleAppliesToSpace(physical, "s1", byKey, { operationalTypeKey: "servery" }),
    false,
  );
});
