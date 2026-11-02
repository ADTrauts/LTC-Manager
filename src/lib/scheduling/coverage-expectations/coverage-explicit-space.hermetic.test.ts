import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateCoverageSlots,
  flattenCoverageTemplateItems,
  resolveCoverageExpectationsForLocation,
  selectHistoricalCoverageTemplates,
  selectRuntimeCoverageTemplates,
  validateCoverageOperationalTypeKeys,
  type CoverageAssignmentActual,
  type CoverageExpectationItemInput,
  type CoverageLocationContext,
  type CoverageTemplateVersionRow,
} from "@/lib/scheduling/coverage-expectations";

const cycles = [
  { stableKey: "breakfast", label: "Breakfast" },
  { stableKey: "lunch", label: "Lunch" },
  { stableKey: "morning_clean", label: "Morning Clean" },
];

function room(spaceId: string, departmentId = "dietary"): CoverageLocationContext {
  return {
    departmentId,
    spaceId,
    unitId: "unit-1",
    operationalTypeKey: "servery",
    operationalTypeName: "Servery",
  };
}

function need(
  overrides: Partial<CoverageExpectationItemInput> &
    Pick<CoverageExpectationItemInput, "id" | "spaceId" | "roleKey">,
): CoverageExpectationItemInput {
  return {
    templateId: "tpl-1",
    templateStableKey: "coverage",
    templateVersion: 1,
    templateStatus: "PUBLISHED",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    roleLabel: overrides.roleKey,
    requiredCount: 2,
    unitId: null,
    applicableOperationalTypeKeys: ["servery"],
    applicableOperationalCycleStableKeys: ["breakfast"],
    ...overrides,
  };
}

function assignment(
  overrides: Partial<CoverageAssignmentActual> & Pick<CoverageAssignmentActual, "id">,
): CoverageAssignmentActual {
  return {
    roleKey: "SERVER",
    status: "ACTIVE",
    unitId: "unit-1",
    coveredSpaceIds: ["space-a"],
    startsAt: new Date("2026-03-15T11:00:00.000Z"),
    endsAt: new Date("2026-03-15T15:00:00.000Z"),
    ...overrides,
  };
}

const window = {
  startsAt: new Date("2026-03-15T11:00:00.000Z"),
  endsAt: new Date("2026-03-15T15:00:00.000Z"),
};

describe("explicit space coverage", () => {
  it("matches the stored room and leaves the next servery unmatched", () => {
    const items = [need({ id: "a", spaceId: "space-a", roleKey: "SERVER" })];
    const matched = resolveCoverageExpectationsForLocation({
      items,
      context: room("space-a"),
      cycles,
      cycleStableKey: "breakfast",
    });
    const other = resolveCoverageExpectationsForLocation({
      items,
      context: room("space-b"),
      cycles,
      cycleStableKey: "breakfast",
    });
    assert.equal(matched[0]?.requiredCount, 2);
    assert.equal(matched[0]?.roleKey, "SERVER");
    assert.deepEqual(other, []);
  });

  it("does not give a new servery an existing servery need", () => {
    const items = [
      need({ id: "a", spaceId: "space-a", roleKey: "SERVER" }),
      need({ id: "b", spaceId: "space-b", roleKey: "SERVER" }),
      need({ id: "c", spaceId: "space-c", roleKey: "SERVER" }),
    ];
    const created = resolveCoverageExpectationsForLocation({
      items,
      context: room("space-d"),
      cycles,
      cycleStableKey: "breakfast",
    });
    assert.deepEqual(created, []);
  });

  it("resolves bulk-authored rooms from their own space ids", () => {
    const items = ["space-a", "space-b", "space-c"].map((spaceId) =>
      need({ id: spaceId, spaceId, roleKey: "SERVER", requiredCount: 2 }),
    );
    for (const spaceId of ["space-a", "space-b", "space-c"]) {
      const resolved = resolveCoverageExpectationsForLocation({
        items,
        context: room(spaceId),
        cycles,
        cycleStableKey: "breakfast",
      });
      assert.equal(resolved.length, 1);
      assert.equal(resolved[0]?.id, `${spaceId}:breakfast`);
    }
  });

  it("resolves two departments on one room from their own items", () => {
    const dietary = [
      need({
        id: "fn",
        spaceId: "space-shared",
        roleKey: "SERVER",
        requiredCount: 2,
        applicableOperationalCycleStableKeys: ["lunch"],
      }),
    ];
    const evs = [
      need({
        id: "evs",
        templateStableKey: "evs-coverage",
        spaceId: "space-shared",
        roleKey: "CLEANING_ROUND",
        requiredCount: 1,
        applicableOperationalCycleStableKeys: ["morning_clean"],
      }),
    ];
    const lunch = resolveCoverageExpectationsForLocation({
      items: dietary,
      context: room("space-shared", "dietary"),
      cycles,
      cycleStableKey: "lunch",
    });
    const clean = resolveCoverageExpectationsForLocation({
      items: evs,
      context: room("space-shared", "evs"),
      cycles,
      cycleStableKey: "morning_clean",
    });
    assert.equal(lunch[0]?.requiredCount, 2);
    assert.equal(lunch[0]?.roleKey, "SERVER");
    assert.equal(clean[0]?.requiredCount, 1);
    assert.equal(clean[0]?.roleKey, "CLEANING_ROUND");
  });

  it("uses the template effective interval and ignores Location Function keys", () => {
    const shared = {
      stableKey: "servery-meals",
      isActive: true,
      items: [
        {
          id: "item",
          roleKey: "SERVER",
          roleLabel: "Server",
          requiredCount: 2,
          unitId: null,
          spaceId: "space-a",
          applicableOperationalTypeKeys: ["servery"],
          applicableOperationalCycleStableKeys: ["lunch"],
        },
      ],
    } satisfies Omit<CoverageTemplateVersionRow, "id" | "version" | "status" | "effectiveFrom" | "effectiveTo">;
    const earlier: CoverageTemplateVersionRow = {
      ...shared,
      id: "v1",
      version: 1,
      status: "RETIRED",
      isActive: false,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-06-30",
    };
    const later: CoverageTemplateVersionRow = {
      ...shared,
      id: "v2",
      version: 2,
      status: "PUBLISHED",
      effectiveFrom: "2026-07-01",
      effectiveTo: null,
      items: [{ ...shared.items[0]!, id: "item-2", requiredCount: 1 }],
    };

    const march = selectHistoricalCoverageTemplates([earlier, later], "2026-03-15");
    const august = selectHistoricalCoverageTemplates([earlier, later], "2026-08-15");
    assert.equal(march.status, "evaluated");
    assert.equal(august.status, "evaluated");
    if (march.status !== "evaluated" || august.status !== "evaluated") return;

    const marchNeed = resolveCoverageExpectationsForLocation({
      items: flattenCoverageTemplateItems(march.templates),
      context: room("space-a"),
      cycles,
      cycleStableKey: "lunch",
    });
    const augustNeed = resolveCoverageExpectationsForLocation({
      items: flattenCoverageTemplateItems(august.templates),
      context: room("space-a"),
      cycles,
      cycleStableKey: "lunch",
    });
    const otherServery = resolveCoverageExpectationsForLocation({
      items: flattenCoverageTemplateItems(march.templates),
      context: room("space-d"),
      cycles,
      cycleStableKey: "lunch",
    });
    assert.equal(marchNeed[0]?.requiredCount, 2);
    assert.equal(augustNeed[0]?.requiredCount, 1);
    assert.deepEqual(otherServery, []);
  });

  it("keeps a draft off the runtime date", () => {
    const published: CoverageTemplateVersionRow = {
      id: "pub",
      stableKey: "servery-meals",
      version: 1,
      status: "PUBLISHED",
      isActive: true,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      items: [
        {
          id: "pub-item",
          roleKey: "SERVER",
          roleLabel: "Server",
          requiredCount: 2,
          unitId: null,
          spaceId: "space-a",
          applicableOperationalCycleStableKeys: ["breakfast"],
        },
      ],
    };
    const draft: CoverageTemplateVersionRow = {
      ...published,
      id: "draft",
      version: 2,
      status: "DRAFT",
      items: [{ ...published.items[0]!, id: "draft-item", requiredCount: 9 }],
    };
    const runtime = flattenCoverageTemplateItems(
      selectRuntimeCoverageTemplates([published, draft], "2026-03-15"),
    );
    assert.equal(runtime[0]?.requiredCount, 2);
    assert.equal(runtime[0]?.templateStatus, "PUBLISHED");
  });

  it("counts operational assignments on this room, and a call-down stays filled", () => {
    const expectations = resolveCoverageExpectationsForLocation({
      items: [need({ id: "a", spaceId: "space-a", roleKey: "SERVER", requiredCount: 2 })],
      context: room("space-a"),
      cycles,
      cycleStableKey: "breakfast",
    });
    const covered = evaluateCoverageSlots({
      expectations,
      assignments: [assignment({ id: "one" }), assignment({ id: "two" })],
      spaceId: "space-a",
      unitId: "unit-1",
      plan: "RUNTIME_VISIBLE",
      cycleWindows: new Map([["breakfast", window]]),
    });
    assert.equal(covered[0]?.filledCount, 2);
    assert.equal(covered[0]?.state, "COVERED");

    const calledDown = evaluateCoverageSlots({
      expectations,
      assignments: [
        assignment({ id: "one" }),
        assignment({ id: "two", hasCallDown: true }),
      ],
      spaceId: "space-a",
      unitId: "unit-1",
      plan: "RUNTIME_VISIBLE",
      cycleWindows: new Map([["breakfast", window]]),
    });
    assert.equal(calledDown[0]?.filledCount, 2);
    assert.equal(calledDown[0]?.state, "AT_RISK");
  });

  it("does not count a server assigned to a different room", () => {
    const expectations = resolveCoverageExpectationsForLocation({
      items: [need({ id: "a", spaceId: "space-a", roleKey: "SERVER", requiredCount: 2 })],
      context: room("space-a"),
      cycles,
      cycleStableKey: "breakfast",
    });
    const slots = evaluateCoverageSlots({
      expectations,
      assignments: [
        assignment({ id: "here", coveredSpaceIds: ["space-a"] }),
        assignment({ id: "elsewhere", coveredSpaceIds: ["space-b"] }),
      ],
      spaceId: "space-a",
      unitId: "unit-1",
      plan: "RUNTIME_VISIBLE",
      cycleWindows: new Map([["breakfast", window]]),
    });
    assert.equal(slots[0]?.filledCount, 1);
    assert.equal(slots[0]?.state, "AT_RISK");
  });

  it("does not let a unit or department-wide row cover a room", () => {
    const items = [
      need({ id: "unit", spaceId: null, unitId: "unit-1", roleKey: "SERVER" }),
      need({
        id: "dept",
        spaceId: null,
        unitId: null,
        roleKey: "COOK",
        applicableOperationalCycleStableKeys: ["breakfast"],
      }),
    ];
    const onRoom = resolveCoverageExpectationsForLocation({
      items,
      context: room("space-a"),
      cycles,
      cycleStableKey: "breakfast",
    });
    const onUnit = resolveCoverageExpectationsForLocation({
      items,
      context: { ...room(""), spaceId: "", unitId: "unit-1" },
      cycles,
      cycleStableKey: "breakfast",
    });
    assert.deepEqual(onRoom, []);
    assert.equal(onUnit.length, 1);
    assert.equal(onUnit[0]?.roleKey, "SERVER");
  });

  it("refuses a Location Function key as a coverage target", () => {
    assert.throws(
      () =>
        validateCoverageOperationalTypeKeys({
          submittedKeys: ["servery"],
          allowedKeys: new Set(["servery"]),
        }),
      /rooms this coverage need applies to/,
    );
  });
});
