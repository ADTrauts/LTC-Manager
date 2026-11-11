import assert from "node:assert/strict";
import test from "node:test";

import { buildCyclesByStableKey } from "./effective-cycle-spaces";
import { cycleAppliesToSpace, cycleAppliesToUnit, resolveOperationalCycle } from "./resolve-operational-cycle";
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
    locationMode: "EXPLICIT_UNITS",
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

function effectiveOnDate(cycle: OperationalCycleDefinition, dateKey: string): boolean {
  if (cycle.status !== "PUBLISHED" && cycle.status !== "RETIRED") return false;
  const fromKey = toServiceDateKey(cycle.effectiveFrom);
  const toKey = cycle.effectiveTo ? toServiceDateKey(cycle.effectiveTo) : null;
  if (fromKey > dateKey) return false;
  if (toKey && toKey < dateKey) return false;
  return true;
}

test("draft cycles do not affect current Run while published current versions do", () => {
  const draft = cycle({
    id: "breakfast-draft",
    label: "Breakfast draft",
    status: "DRAFT",
    spaceIds: ["s1"],
  });
  const published = cycle({
    id: "breakfast-pub",
    label: "Breakfast",
    spaceIds: ["s1"],
  });
  const future = cycle({
    id: "breakfast-future",
    label: "Breakfast next week",
    effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
    spaceIds: ["s1"],
  });
  const now = new Date("2026-09-21T08:30:00.000Z");
  const draftCtx = resolveOperationalCycle({
    cycles: [draft],
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-09-21",
    spaceId: "s1",
  });
  const publishedCtx = resolveOperationalCycle({
    cycles: [published],
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-09-21",
    spaceId: "s1",
  });
  const futureOnToday = resolveOperationalCycle({
    cycles: [future].filter((row) => effectiveOnDate(row, "2026-09-21")),
    now,
    facilityTimezone: "UTC",
    operationalDateKey: "2026-09-21",
    spaceId: "s1",
  });
  const futureOnEffectiveDate = resolveOperationalCycle({
    cycles: [future].filter((row) => effectiveOnDate(row, "2026-10-01")),
    now: new Date("2026-10-01T08:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-10-01",
    spaceId: "s1",
  });

  assert.equal(draftCtx.state, "NOT_CONFIGURED");
  assert.equal(publishedCtx.state, "ACTIVE");
  assert.equal(futureOnToday.state, "NOT_CONFIGURED");
  assert.equal(futureOnEffectiveDate.state, "ACTIVE");
});

test("a Phase inherits the published Cycle's scope and a Key Point keeps its selected rooms", () => {
  const root = cycle({ id: "root", label: "Service", locationMode: "ALL_DEPARTMENT_UNITS" });
  const phase = cycle({
    id: "phase", label: "Opening", parentStableKey: root.stableKey, locationInheritFromParent: true,
  });
  const keyPoint = cycle({
    id: "key-point", label: "Open", nodeKind: "KEY_TIME", parentStableKey: root.stableKey,
    keyTimeGroups: [{ dueLocal: "08:00", spaceIds: ["assigned-room"] }],
  });
  const byKey = buildCyclesByStableKey([root, phase, keyPoint]);
  const unit = { id: "new-neighborhood", unitType: "OTHER" as const, spaceIds: ["new-room"] };

  assert.equal(cycleAppliesToUnit(phase, unit, byKey), true);
  assert.equal(cycleAppliesToSpace(phase, "new-room", byKey), true);
  assert.equal(cycleAppliesToSpace(keyPoint, "new-room", byKey), false);
  assert.equal(cycleAppliesToSpace(keyPoint, "assigned-room", byKey), true);
  assert.equal(cycleAppliesToUnit(phase, unit, buildCyclesByStableKey([phase])), false);
});

test("explicit Neighborhood placement does not expand to every room under it", () => {
  const placed = cycle({ id: "placed", label: "Service", unitIds: ["unit"] });
  const byKey = buildCyclesByStableKey([placed]);
  assert.equal(
    cycleAppliesToUnit(placed, { id: "unit", unitType: "OTHER", spaceIds: ["child"] }, byKey),
    true,
  );
  assert.equal(cycleAppliesToSpace(placed, "child", byKey), false);
});
