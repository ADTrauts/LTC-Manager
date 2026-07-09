import assert from "node:assert/strict";
import test from "node:test";

import { MealType, ShiftType, UnitType } from "@prisma/client";

import type { OperationsCenterUnitCard } from "@/lib/operations-center";
import {
  buildCoverageItems,
  buildStaffingHref,
  resolveCoverageLevel,
  resolveCoverageReason,
  summarizeCoverage,
} from "@/lib/todays-work/coverage-list";

function card(partial: Partial<OperationsCenterUnitCard> & Pick<OperationsCenterUnitCard, "id" | "name">): OperationsCenterUnitCard {
  return {
    unitType: UnitType.KITCHEN,
    hasDietary: true,
    expected: 0,
    completed: 0,
    failed: 0,
    missed: 0,
    pending: 0,
    mealTimes: [],
    staffingCount: 1,
    openRepairCount: 0,
    ...partial,
  };
}

test("buildCoverageItems orders gaps before thin before covered", () => {
  const items = buildCoverageItems({
    unitCards: [
      card({ id: "covered", name: "Covered Kitchen", staffingCount: 2 }),
      card({ id: "gap", name: "Gap Kitchen", staffingCount: 0 }),
      card({
        id: "thin",
        name: "Thin Servery",
        unitType: UnitType.SERVERY,
        staffingCount: 1,
      }),
    ],
    schedules: [
      {
        employeeId: "e1",
        unitId: "covered",
        shift: ShiftType.FULL_DAY,
        employeeFirstName: "Casey",
        employeeLastName: "Cook",
      },
      {
        employeeId: "e2",
        unitId: "covered",
        shift: ShiftType.FULL_DAY,
        employeeFirstName: "Alex",
        employeeLastName: "Prep",
      },
      {
        employeeId: "e3",
        unitId: "thin",
        shift: ShiftType.LUNCH,
        employeeFirstName: "Sam",
        employeeLastName: "Server",
      },
    ],
    overrides: [],
    dateIso: "2026-07-08",
  });

  assert.deepEqual(
    items.map((item) => item.unitId),
    ["gap", "thin", "covered"],
  );
  assert.equal(items[0]?.level, "none");
  assert.equal(items[1]?.level, "thin");
  assert.equal(items[2]?.level, "covered");
});

test("resolveCoverageLevel treats partial servery slots as thin", () => {
  const servery = card({
    id: "s1",
    name: "West Servery",
    unitType: UnitType.SERVERY,
    staffingCount: 1,
  });
  assert.equal(
    resolveCoverageLevel(servery, [{ shift: ShiftType.BREAKFAST, employeeName: "Pat Server" }]),
    "thin",
  );
  assert.equal(
    resolveCoverageLevel(servery, [
      { shift: ShiftType.BREAKFAST, employeeName: "Pat Server" },
      { shift: ShiftType.LUNCH, employeeName: "Lee Server" },
      { shift: ShiftType.DINNER, employeeName: "Kim Server" },
    ]),
    "covered",
  );
});

test("buildCoverageItems applies overrides when grouping assignments", () => {
  const items = buildCoverageItems({
    unitCards: [
      card({ id: "a", name: "Servery A", unitType: UnitType.SERVERY, staffingCount: 1 }),
      card({ id: "b", name: "Servery B", unitType: UnitType.SERVERY, staffingCount: 1 }),
    ],
    schedules: [
      {
        employeeId: "e1",
        unitId: "a",
        shift: ShiftType.LUNCH,
        employeeFirstName: "Flo",
        employeeLastName: "Float",
      },
    ],
    overrides: [
      {
        employeeId: "e1",
        oldUnitId: "a",
        newUnitId: "b",
        mealType: null,
      },
    ],
    dateIso: "2026-07-08",
  });

  const serveryA = items.find((item) => item.unitId === "a");
  const serveryB = items.find((item) => item.unitId === "b");
  assert.equal(serveryA?.assignments.length, 0);
  assert.equal(serveryB?.assignments.length, 1);
  assert.equal(serveryB?.assignments[0]?.employeeName, "Flo Float");
});

test("resolveCoverageReason describes missing servery slots", () => {
  const servery = card({
    id: "s1",
    name: "East Servery",
    unitType: UnitType.SERVERY,
    staffingCount: 1,
  });
  assert.match(
    resolveCoverageReason(servery, "thin", [ShiftType.BREAKFAST, ShiftType.DINNER], 0),
    /missing breakfast, dinner coverage/i,
  );
});

test("summarizeCoverage counts coverage buckets", () => {
  const summary = summarizeCoverage([
    {
      unitId: "1",
      unitName: "One",
      unitType: UnitType.KITCHEN,
      level: "none",
      staffingCount: 0,
      expectedSlots: null,
      missingShifts: [],
      assignments: [],
      overrideCount: 0,
      reason: "No staff scheduled today",
      staffingHref: buildStaffingHref("2026-07-08", "1"),
      unitHref: "/unit/1",
    },
    {
      unitId: "2",
      unitName: "Two",
      unitType: UnitType.SERVERY,
      level: "thin",
      staffingCount: 1,
      expectedSlots: 3,
      missingShifts: [ShiftType.DINNER],
      assignments: [],
      overrideCount: 0,
      reason: "Missing dinner coverage",
      staffingHref: buildStaffingHref("2026-07-08", "2"),
      unitHref: "/unit/2",
    },
    {
      unitId: "3",
      unitName: "Three",
      unitType: UnitType.RETAIL,
      level: "covered",
      staffingCount: 2,
      expectedSlots: null,
      missingShifts: [],
      assignments: [],
      overrideCount: 0,
      reason: "2 scheduled today",
      staffingHref: buildStaffingHref("2026-07-08", "3"),
      unitHref: "/unit/3",
    },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.gaps, 1);
  assert.equal(summary.thin, 1);
  assert.equal(summary.covered, 1);
});

test("buildStaffingHref includes date and unit anchor", () => {
  assert.equal(buildStaffingHref("2026-07-08", "unit-123"), "/staffing?date=2026-07-08#staffing-unit-unit-123");
});

test("buildCoverageItems evaluates only scoped servery meal when mealScope is set", () => {
  const items = buildCoverageItems({
    unitCards: [
      card({ id: "servery", name: "4A Servery", unitType: UnitType.SERVERY, staffingCount: 1 }),
    ],
    schedules: [
      {
        employeeId: "e1",
        unitId: "servery",
        shift: ShiftType.LUNCH,
        employeeFirstName: "Alex",
        employeeLastName: "Lee",
      },
    ],
    overrides: [],
    dateIso: "2026-07-08",
    mealScope: MealType.LUNCH,
  });

  const servery = items[0];
  assert.equal(servery?.level, "covered");
  assert.equal(servery?.expectedSlots, 1);
  assert.deepEqual(servery?.missingShifts, []);
});
