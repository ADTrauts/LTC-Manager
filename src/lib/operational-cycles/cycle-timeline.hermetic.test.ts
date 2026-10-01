/**
 * Cycle → Phase → Key Point hermetic certification.
 * Shared runtime must remain generic (no Dietary meal-key branching).
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildDietaryDefaultCyclePlans } from "./defaults";
import {
  presentDepartmentRunOperation,
  presentLocationRunOperation,
} from "./present-run-operation";
import type { OperationalCycleDefinition } from "./types";

const TZ = "America/New_York";
const DATE_KEY = "2026-09-28";
const SPACE = "space-1";

function at(hhmm: string): Date {
  return new Date(`${DATE_KEY}T${hhmm}:00.000-04:00`);
}

function period(partial: Partial<OperationalCycleDefinition> & {
  stableKey: string;
  label: string;
  startLocal: string;
  endLocal: string;
}): OperationalCycleDefinition {
  return {
    id: partial.id ?? `id-${partial.stableKey}`,
    stableKey: partial.stableKey,
    parentStableKey: partial.parentStableKey ?? null,
    nodeKind: partial.nodeKind ?? "PERIOD",
    version: 1,
    label: partial.label,
    description: null,
    cycleType: partial.cycleType ?? "CUSTOM",
    displaySequence: partial.displaySequence ?? 10,
    startLocal: partial.startLocal,
    endLocal: partial.endLocal,
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: partial.mealType ?? null,
    expectedMilestones: partial.expectedMilestones ?? [],
    locationMode: "EXPLICIT_UNITS",
    locationInheritFromParent: partial.locationInheritFromParent ?? false,
    applicableUnitTypes: [],
    applicableOperationalTypeKeys: [],
    roomTypeKey: null,
    status: "PUBLISHED",
    unitIds: [],
    spaceIds: partial.spaceIds ?? [SPACE],
    milestoneTimes: [],
    keyTimeGroups: partial.keyTimeGroups ?? [],
  };
}

function keyTime(partial: {
  stableKey: string;
  label: string;
  parentStableKey: string;
  dueLocal: string;
}): OperationalCycleDefinition {
  const groupId = `g-${partial.stableKey}`;
  return period({
    stableKey: partial.stableKey,
    label: partial.label,
    parentStableKey: partial.parentStableKey,
    nodeKind: "KEY_TIME",
    startLocal: "",
    endLocal: "",
    cycleType: "CUSTOM",
    spaceIds: [],
    keyTimeGroups: [{ id: groupId, dueLocal: partial.dueLocal, spaceIds: [SPACE] }],
  });
}

function breakfastHierarchy(opts?: { includeService?: boolean }) {
  const includeService = opts?.includeService ?? false;
  const cycles: OperationalCycleDefinition[] = [
    period({
      stableKey: "breakfast",
      label: "Breakfast",
      startLocal: "05:30",
      endLocal: "10:00",
      mealType: "BREAKFAST",
      displaySequence: 10,
    }),
    period({
      stableKey: "breakfast_prep",
      label: "Prep",
      parentStableKey: "breakfast",
      startLocal: "05:30",
      endLocal: "06:30",
      cycleType: "PREPARATION",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 11,
    }),
  ];
  if (includeService) {
    cycles.push(
      period({
        stableKey: "breakfast_service",
        label: "Service",
        parentStableKey: "breakfast",
        startLocal: "06:30",
        endLocal: "09:00",
        cycleType: "SERVICE",
        locationInheritFromParent: true,
        spaceIds: [],
        displaySequence: 12,
      }),
    );
  }
  cycles.push(
    keyTime({
      stableKey: "breakfast_due",
      label: "Hotboxes complete",
      parentStableKey: "breakfast",
      dueLocal: "06:15",
    }),
    period({
      stableKey: "breakfast_cleanup",
      label: "Cleanup",
      parentStableKey: "breakfast",
      startLocal: "09:00",
      endLocal: "10:00",
      cycleType: "CLOSEOUT",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 14,
    }),
    period({
      stableKey: "lunch",
      label: "Lunch",
      startLocal: "11:00",
      endLocal: "14:00",
      mealType: "LUNCH",
      displaySequence: 20,
    }),
  );
  return cycles;
}

function genericMorningOps(): OperationalCycleDefinition[] {
  return [
    period({
      stableKey: "morning_operations",
      label: "Morning Operations",
      startLocal: "07:00",
      endLocal: "12:00",
      displaySequence: 10,
    }),
    period({
      stableKey: "morning_setup",
      label: "Setup",
      parentStableKey: "morning_operations",
      startLocal: "07:00",
      endLocal: "07:30",
      cycleType: "PREPARATION",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 11,
    }),
    period({
      stableKey: "morning_routine",
      label: "Routine Operations",
      parentStableKey: "morning_operations",
      startLocal: "07:30",
      endLocal: "11:00",
      cycleType: "CUSTOM",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 12,
    }),
    period({
      stableKey: "morning_closeout",
      label: "Closeout",
      parentStableKey: "morning_operations",
      startLocal: "11:00",
      endLocal: "12:00",
      cycleType: "CLOSEOUT",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 13,
    }),
    keyTime({
      stableKey: "morning_inspection",
      label: "Inspection",
      parentStableKey: "morning_operations",
      dueLocal: "09:00",
    }),
  ];
}

function locationAt(cycles: OperationalCycleDefinition[], hhmm: string) {
  return presentLocationRunOperation({
    cycles,
    timings: cycles
      .filter((c) => c.nodeKind === "KEY_TIME")
      .flatMap((c) =>
        c.keyTimeGroups.map((g) => {
          const groupId = g.id ?? `g-${c.stableKey}`;
          return {
            expectationId: `exp-${groupId}`,
            cycleId: c.id,
            cycleStableKey: c.stableKey,
            cycleVersion: 1,
            cycleLabel: c.label,
            parentCycleLabel: null as string | null,
            displayPath: c.label,
            keyTimeGroupId: groupId,
            spaceId: SPACE,
            configuredDueLocal: g.dueLocal,
            adjustedDueLocal: null as string | null,
            expectedToday: g.dueLocal,
            actualDueLocal: null as string | null,
            completedAt: null as Date | null,
            adjustedAt: null as Date | null,
          };
        }),
      ),
    now: at(hhmm),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: SPACE,
    location: {
      title: "Test Room",
      roomTypeLabel: null,
      contextLabel: null,
      spaceId: SPACE,
      unitId: "unit-1",
    },
    nowLocalHhMm: hhmm,
  });
}

function deptAt(cycles: OperationalCycleDefinition[], hhmm: string) {
  return presentDepartmentRunOperation({
    cycles,
    timings: [],
    now: at(hhmm),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    nowLocalHhMm: hhmm,
  });
}

test("Scenario A — Prep: Current Cycle + Current Phase", () => {
  const view = locationAt(breakfastHierarchy(), "05:45");
  assert.equal(view.currentOperation.state, "ACTIVE");
  assert.equal(view.currentOperation.cycleLabel, "Breakfast");
  assert.equal(view.currentOperation.phaseLabel, "Prep");
  assert.equal(view.currentOperation.parentLabel, "Breakfast");
});

test("Scenario B — Service phase from starter with explicit Service", () => {
  const view = locationAt(breakfastHierarchy({ includeService: true }), "07:30");
  assert.equal(view.currentOperation.cycleLabel, "Breakfast");
  assert.equal(view.currentOperation.phaseLabel, "Service");
});

test("Scenario C — Cleanup phase preserved as Phase of Cycle", () => {
  const view = locationAt(breakfastHierarchy(), "09:20");
  assert.equal(view.currentOperation.cycleLabel, "Breakfast");
  assert.equal(view.currentOperation.phaseLabel, "Cleanup");
  assert.ok(!view.currentOperation.cycleLabel?.includes("Cleanup"));
});

test("Scenario D — existing facility without Service: Cycle active, Phase none", () => {
  const view = locationAt(breakfastHierarchy({ includeService: false }), "08:00");
  assert.equal(view.currentOperation.state, "ACTIVE");
  assert.equal(view.currentOperation.cycleLabel, "Breakfast");
  assert.equal(view.currentOperation.phaseLabel, null);
});

test("Scenario E — between Cycles is healthy quiet", () => {
  const dept = deptAt(breakfastHierarchy(), "10:30");
  assert.equal(dept.currentOperations.length, 0);
  assert.equal(dept.nextOperation?.label, "Lunch");
});

test("Scenario F — generic non-Dietary Cycle → Phase semantics", () => {
  const setup = locationAt(genericMorningOps(), "07:15");
  assert.equal(setup.currentOperation.cycleLabel, "Morning Operations");
  assert.equal(setup.currentOperation.phaseLabel, "Setup");

  const routine = locationAt(genericMorningOps(), "09:00");
  assert.equal(routine.currentOperation.cycleLabel, "Morning Operations");
  assert.equal(routine.currentOperation.phaseLabel, "Routine Operations");
  assert.ok(routine.nextKeyPoint);
  assert.equal(routine.nextKeyPoint?.label, "Inspection");
});

test("overlapping Phases keep Cycle and expose multiple active Phase labels", () => {
  const cycles = [
    period({
      stableKey: "ops",
      label: "Day Ops",
      startLocal: "05:00",
      endLocal: "12:00",
    }),
    period({
      stableKey: "production",
      label: "Production",
      parentStableKey: "ops",
      startLocal: "05:30",
      endLocal: "07:30",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 11,
    }),
    period({
      stableKey: "service",
      label: "Service",
      parentStableKey: "ops",
      startLocal: "07:00",
      endLocal: "09:00",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 12,
    }),
  ];
  const view = locationAt(cycles, "07:15");
  assert.equal(view.currentOperation.cycleLabel, "Day Ops");
  assert.ok(view.currentOperation.phaseLabel);
  assert.ok(view.currentOperation.activePhaseLabels.includes("Production"));
  assert.ok(view.currentOperation.activePhaseLabels.includes("Service"));
});

test("renamed Phase label does not change stable identity in starter keys", () => {
  const plans = buildDietaryDefaultCyclePlans();
  const cleanup = plans.find((p) => p.stableKey === "breakfast_cleanup");
  assert.ok(cleanup);
  assert.equal(cleanup!.stableKey, "breakfast_cleanup");
  assert.equal(cleanup!.label, "Cleanup");
  // Facility may rename label; Work binds to stableKey, not label.
  assert.notEqual(cleanup!.stableKey, cleanup!.label.toLowerCase());
});

test("Dietary starter adds explicit Service Phases without rewriting Prep/Cleanup keys", () => {
  const plans = buildDietaryDefaultCyclePlans();
  for (const meal of ["breakfast", "lunch", "dinner"] as const) {
    assert.ok(plans.some((p) => p.stableKey === `${meal}_prep` && p.cycleType === "PREPARATION"));
    assert.ok(plans.some((p) => p.stableKey === `${meal}_service` && p.cycleType === "SERVICE"));
    assert.ok(plans.some((p) => p.stableKey === `${meal}_cleanup` && p.cycleType === "CLOSEOUT"));
    assert.ok(plans.some((p) => p.stableKey === `${meal}_due` && p.nodeKind === "KEY_TIME"));
  }
  const breakfastService = plans.find((p) => p.stableKey === "breakfast_service")!;
  assert.equal(breakfastService.startLocal, "07:10");
  assert.equal(breakfastService.endLocal, "09:00");
  assert.equal(breakfastService.parentStableKey, "breakfast");
});

test("shared presenter source has no Dietary meal-key branching", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(process.cwd(), "src/lib/operational-cycles/present-run-operation.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /breakfast_cleanup|breakfast_prep|DIETARY/);
  const timeline = require("node:fs").readFileSync(
    require("node:path").join(process.cwd(), "src/lib/operational-cycles/cycle-timeline.ts"),
    "utf8",
  );
  assert.doesNotMatch(timeline, /breakfast|lunch|dinner|servery|Dietary/i);
});
