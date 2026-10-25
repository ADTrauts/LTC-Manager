import assert from "node:assert/strict";
import test from "node:test";

import { decideCycleAuthority } from "./cycle-authority";
import { isCycleEffectiveOnDate } from "./cycle-lifecycle";
import { resolveOperationalCycle } from "./resolve-operational-cycle";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { isDepartmentOperationalCyclesEnabled } from "@/lib/department-operations";
import {
  describeDepartmentCycleConfiguration,
  detectRunModelProvenance,
  isCurrentPeriodModel,
  presentDepartmentRunOperation,
  presentLocationRunOperation,
  presentationContainsLegacyMealCopy,
  publishedPeriodHasParticipatingLocations,
} from "./present-run-operation";
import type { OperationalCycleDefinition } from "./types";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const TZ = "UTC";
const DATE_KEY = "2026-08-17";
const NAVAL = "naval-park-servery";
const LIGHTHOUSE = "lighthouse-servery";

function restoreEnv(name: string, previous: string | undefined) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

function at(hhMm: string): Date {
  const [h, m] = hhMm.split(":").map(Number);
  return new Date(Date.UTC(2026, 7, 17, h, m, 0, 0));
}

function cycle(
  partial: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "stableKey">,
): OperationalCycleDefinition {
  return {
    id: partial.id ?? partial.stableKey,
    stableKey: partial.stableKey,
    parentStableKey: partial.parentStableKey ?? null,
    nodeKind: partial.nodeKind ?? "PERIOD",
    version: partial.version ?? 1,
    label: partial.label ?? partial.stableKey,
    description: partial.description ?? null,
    cycleType: partial.cycleType ?? "CUSTOM",
    displaySequence: partial.displaySequence ?? 10,
    startLocal:
      partial.startLocal !== undefined
        ? partial.startLocal
        : partial.nodeKind === "KEY_TIME"
          ? null
          : "06:00",
    endLocal:
      partial.endLocal !== undefined
        ? partial.endLocal
        : partial.nodeKind === "KEY_TIME"
          ? null
          : "09:00",
    overnight: partial.overnight ?? false,
    applicableDaysOfWeek: partial.applicableDaysOfWeek ?? ALL_DAYS,
    effectiveFrom: partial.effectiveFrom ?? new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: partial.effectiveTo ?? null,
    mealType: partial.mealType ?? null,
    locationMode: partial.locationMode ?? "EXPLICIT_UNITS",
    locationInheritFromParent: partial.locationInheritFromParent ?? false,
    applicableUnitTypes: partial.applicableUnitTypes ?? [],
    roomTypeKey: partial.roomTypeKey ?? null,
    expectedMilestones: partial.expectedMilestones ?? [],
    status: partial.status ?? "PUBLISHED",
    unitIds: partial.unitIds ?? [],
    spaceIds: partial.spaceIds ?? [],
    milestoneTimes: partial.milestoneTimes ?? [],
    keyTimeGroups: partial.keyTimeGroups ?? [],
  };
}

function mealDay(rooms: string[]) {
  return [
    cycle({
      stableKey: "breakfast",
      label: "Breakfast",
      startLocal: "06:00",
      endLocal: "09:00",
      displaySequence: 10,
      spaceIds: rooms,
    }),
    cycle({
      stableKey: "breakfast_prep",
      label: "Prep",
      parentStableKey: "breakfast",
      startLocal: "06:00",
      endLocal: "07:00",
      displaySequence: 11,
      locationInheritFromParent: true,
    }),
    cycle({
      stableKey: "lunch",
      label: "Lunch",
      startLocal: "11:30",
      endLocal: "13:30",
      displaySequence: 20,
      spaceIds: rooms,
    }),
    cycle({
      stableKey: "dinner",
      label: "Dinner",
      startLocal: "17:00",
      endLocal: "19:00",
      displaySequence: 30,
      spaceIds: rooms,
    }),
  ];
}

function presentDept(hhMm: string, rooms: string[] = [NAVAL, LIGHTHOUSE]) {
  return presentDepartmentRunOperation({
    cycles: mealDay(rooms),
    timings: [],
    now: at(hhMm),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    nowLocalHhMm: hhMm,
  });
}

test("published PERIOD roots are current model without Key Times", () => {
  assert.equal(detectRunModelProvenance(mealDay([NAVAL])), "NEW_PERIOD_KEY_TIME");
  assert.equal(isCurrentPeriodModel("NEW_PERIOD_KEY_TIME"), true);
});

test("published PERIOD + Due KEY_TIME is still current model", () => {
  const cycles = [
    ...mealDay([NAVAL]),
    cycle({
      stableKey: "breakfast_due",
      label: "Breakfast Due",
      parentStableKey: "breakfast",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      keyTimeGroups: [{ id: "g", dueLocal: "07:00", spaceIds: [NAVAL] }],
    }),
  ];
  assert.equal(detectRunModelProvenance(cycles), "NEW_PERIOD_KEY_TIME");
});

test("legacy SERVICE_STARTED period remains leftover meal-service", () => {
  const legacy = [
    cycle({
      stableKey: "lunch",
      label: "Lunch",
      startLocal: "10:00",
      endLocal: "14:00",
      cycleType: "SERVICE",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      locationMode: "ALL_DEPARTMENT_UNITS",
    }),
  ];
  assert.equal(detectRunModelProvenance(legacy), "LEGACY_MEAL_SERVICE");
});

test("draft PERIOD does not become runtime configuration", () => {
  const drafts = [
    cycle({
      stableKey: "breakfast",
      label: "Breakfast",
      startLocal: "06:00",
      endLocal: "09:00",
      status: "DRAFT",
      spaceIds: [NAVAL],
    }),
  ];
  assert.equal(describeDepartmentCycleConfiguration(drafts), "not_configured");
  const dept = presentDepartmentRunOperation({
    cycles: drafts,
    timings: [],
    now: at("06:30"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    nowLocalHhMm: "06:30",
  });
  assert.equal(dept.configuration, "not_configured");
  assert.equal(dept.currentOperations.length, 0);
});

test("future published cycle is not today's runtime when omitted from the loaded set", () => {
  const tomorrow = cycle({
    stableKey: "breakfast",
    label: "Breakfast",
    startLocal: "06:00",
    endLocal: "09:00",
    effectiveFrom: new Date("2026-08-18T00:00:00.000Z"),
    spaceIds: [NAVAL],
  });
  assert.equal(isCycleEffectiveOnDate(tomorrow, DATE_KEY), false);
  assert.equal(describeDepartmentCycleConfiguration([]), "not_configured");
});

test("department current/next follows published Breakfast Lunch Dinner windows", () => {
  const before = presentDept("05:30");
  assert.equal(before.configuration, "configured");
  assert.equal(before.currentOperations.length, 0);
  assert.equal(before.nextOperation?.label, "Breakfast");

  const duringBreakfast = presentDept("06:30");
  assert.equal(duringBreakfast.currentOperations[0]?.parentLabel, "Breakfast");
  assert.equal(duringBreakfast.nextOperation?.label, "Lunch");

  const between = presentDept("10:00");
  assert.equal(between.currentOperations.length, 0);
  assert.equal(between.nextOperation?.label, "Lunch");
  assert.equal(between.configuration, "configured");

  const duringLunch = presentDept("12:00");
  assert.equal(duringLunch.currentOperations[0]?.parentLabel, "Lunch");
  assert.equal(duringLunch.nextOperation?.label, "Dinner");

  const afternoon = presentDept("15:00");
  assert.equal(afternoon.currentOperations.length, 0);
  assert.equal(afternoon.nextOperation?.label, "Dinner");

  const duringDinner = presentDept("17:30");
  assert.equal(duringDinner.currentOperations[0]?.parentLabel, "Dinner");

  const after = presentDept("20:00");
  assert.equal(after.currentOperations.length, 0);
  assert.equal(after.nextOperation, null);
});

test("current/next copy does not invent leftover meal-period language", () => {
  const dept = presentDept("06:30");
  const blob = JSON.stringify(dept);
  assert.equal(presentationContainsLegacyMealCopy(blob), false);
  assert.doesNotMatch(blob, /FALLBACK_OPERATION_CONTEXT|this meal period/i);
});

test("published rhythm with zero rooms is missing participation, not healthy quiet", () => {
  const cycles = mealDay([]);
  assert.equal(publishedPeriodHasParticipatingLocations(cycles), false);
  assert.equal(describeDepartmentCycleConfiguration(cycles), "missing_participation");
  const dept = presentDepartmentRunOperation({
    cycles,
    timings: [],
    now: at("10:00"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    nowLocalHhMm: "10:00",
  });
  assert.equal(dept.configuration, "missing_participation");
});

test("linked room gets current PERIOD; unlinked Dietary room does not", () => {
  const cycles = mealDay([NAVAL]);
  const naval = presentLocationRunOperation({
    cycles,
    timings: [],
    now: at("06:30"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: NAVAL,
    location: {
      title: "Naval Park Servery",
      roomTypeLabel: "Servery",
      contextLabel: null,
      spaceId: NAVAL,
      unitId: "unit-1a",
    },
    nowLocalHhMm: "06:30",
  });
  assert.equal(naval.currentOperation.state, "ACTIVE");
  assert.match(naval.currentOperation.hierarchyLabel ?? "", /Breakfast/);

  const between = presentLocationRunOperation({
    cycles,
    timings: [],
    now: at("10:00"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: NAVAL,
    location: {
      title: "Naval Park Servery",
      roomTypeLabel: "Servery",
      contextLabel: null,
      spaceId: NAVAL,
      unitId: "unit-1a",
    },
    nowLocalHhMm: "10:00",
  });
  assert.equal(between.currentOperation.state, "NONE");
  const betweenResolved = resolveOperationalCycle({
    cycles,
    now: at("10:00"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: NAVAL,
  });
  assert.ok(betweenResolved.state === "BETWEEN" || betweenResolved.state === "UPCOMING");
  assert.match(betweenResolved.next.label, /Lunch/);

  const other = presentLocationRunOperation({
    cycles,
    timings: [],
    now: at("06:30"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: LIGHTHOUSE,
    location: {
      title: "Lighthouse Servery",
      roomTypeLabel: "Servery",
      contextLabel: null,
      spaceId: LIGHTHOUSE,
      unitId: "unit-1b",
    },
    nowLocalHhMm: "06:30",
  });
  assert.equal(other.currentOperation.state, "NONE");
});

test("PERIOD awareness is derived from published cycles alone", () => {
  const dept = presentDept("06:30");
  assert.equal(isCurrentPeriodModel(dept.provenance), true);
  assert.equal(dept.currentOperations[0]?.parentLabel, "Breakfast");
  assert.equal(dept.nextOperation?.label, "Lunch");
  assert.equal(dept.keyTimeSummaries.length, 0);
});

test("a Department key keeps Operational Cycles without an env switch", () => {
  assert.equal(isDepartmentOperationalCyclesEnabled("DIETARY"), true);
  assert.equal(isDepartmentOperationalCyclesEnabled("EVS"), true);
  assert.equal(isDepartmentOperationalCyclesEnabled(null), false);
});

test("PERIOD awareness does not require neighboring capability switches", () => {
  const previous = process.env.CANONICAL_LOGS_ENABLED;
  delete process.env.CANONICAL_LOGS_ENABLED;
  try {
    assert.equal(isCanonicalLogsEnabled(), false);
    assert.equal(isDepartmentOperationalCyclesEnabled("DIETARY"), true);
    const dept = presentDept("12:00");
    assert.equal(dept.currentOperations[0]?.parentLabel, "Lunch");
    assert.equal(dept.nextOperation?.label, "Dinner");
  } finally {
    restoreEnv("CANONICAL_LOGS_ENABLED", previous);
  }
});

test("enabling runtime does not grant Quick PIN Build authority", () => {
  const pin = decideCycleAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "QUICK_PIN",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(pin.canViewRuntime, true);
  assert.equal(pin.canManage, false);
  assert.equal(pin.canPublish, false);

  const staff = decideCycleAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(staff.canViewRuntime, true);
  assert.equal(staff.canViewDepartment, false);
  assert.equal(staff.canManage, false);

  const supervisor = decideCycleAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(supervisor.canViewRuntime, true);
  assert.equal(supervisor.canViewDepartment, true);
  assert.equal(supervisor.canManage, false);
  assert.equal(supervisor.canPublish, false);

  const manager = decideCycleAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    primaryDepartmentId: "d1",
  });
  assert.equal(manager.canManage, true);
  assert.equal(manager.canPublish, true);
});
