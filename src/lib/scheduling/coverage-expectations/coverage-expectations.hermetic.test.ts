import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  assignmentCoversLocation,
  dayBefore,
  evaluateCoverageSlotState,
  evaluateCoverageSlots,
  flattenCoverageTemplateItems,
  matchingAssignmentsForSlot,
  planLifecycleFromStatus,
  resolveCoverageExpectationsForLocation,
  resolveCoveragePublishEffectiveFromKey,
  selectHistoricalCoverageTemplates,
  selectRuntimeCoverageTemplates,
  selectWorkingCoverageTemplates,
  type CoverageAssignmentActual,
  type CoverageExpectationItemInput,
  type CoverageLocationContext,
  type CoverageTemplateVersionRow,
  type ResolvedCoverageExpectation,
} from "@/lib/scheduling/coverage-expectations";

function item(
  overrides: Partial<CoverageExpectationItemInput> &
    Pick<CoverageExpectationItemInput, "id" | "roleKey">,
): CoverageExpectationItemInput {
  return {
    templateId: "tpl-1",
    templateStableKey: "servery-meals",
    templateVersion: 1,
    templateStatus: "PUBLISHED",
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
    roleLabel: overrides.roleKey === "SERVER" ? "Server" : overrides.roleKey,
    requiredCount: 1,
    unitId: null,
    applicableOperationalTypeKeys: [],
    applicableOperationalCycleStableKeys: [],
    ...overrides,
  };
}

function serveryBreakfastServer(overrides: Partial<CoverageExpectationItemInput> = {}) {
  return item({
    id: "item-servery-server",
    roleKey: "SERVER",
    roleLabel: "Server",
    requiredCount: 1,
    applicableOperationalTypeKeys: ["servery"],
    applicableOperationalCycleStableKeys: ["breakfast", "lunch", "dinner"],
    ...overrides,
  });
}

function retailLunchServer() {
  return item({
    id: "item-retail-server",
    roleKey: "SERVER",
    roleLabel: "Server",
    requiredCount: 1,
    templateStableKey: "retail-lunch",
    applicableOperationalTypeKeys: ["retail"],
    applicableOperationalCycleStableKeys: ["lunch"],
  });
}

function mainKitchenBreakfast() {
  return [
    item({
      id: "item-cook",
      roleKey: "COOK",
      roleLabel: "Cook",
      requiredCount: 2,
      applicableOperationalTypeKeys: ["main_kitchen"],
      applicableOperationalCycleStableKeys: ["breakfast_production"],
    }),
    item({
      id: "item-hot",
      roleKey: "HOT_PREP",
      roleLabel: "Hot Prep",
      requiredCount: 1,
      applicableOperationalTypeKeys: ["main_kitchen"],
      applicableOperationalCycleStableKeys: ["breakfast_production"],
    }),
    item({
      id: "item-porter",
      roleKey: "PORTER",
      roleLabel: "Porter",
      requiredCount: 1,
      applicableOperationalTypeKeys: ["main_kitchen"],
      applicableOperationalCycleStableKeys: ["breakfast_production"],
    }),
  ];
}

const cycles = [
  { stableKey: "breakfast", label: "Breakfast" },
  { stableKey: "lunch", label: "Lunch" },
  { stableKey: "dinner", label: "Dinner" },
  { stableKey: "breakfast_production", label: "Breakfast Production" },
];

function serveryContext(spaceId = "space-3a"): CoverageLocationContext {
  return {
    departmentId: "dietary",
    spaceId,
    unitId: "unit-3a",
    operationalTypeKey: "servery",
    operationalTypeName: "Servery",
  };
}

function roles(rows: ResolvedCoverageExpectation[]) {
  return rows.map((row) => `${row.roleKey}×${row.requiredCount}@${row.cycleStableKey ?? "any"}`);
}

function assignment(
  overrides: Partial<CoverageAssignmentActual> & Pick<CoverageAssignmentActual, "id" | "roleKey">,
): CoverageAssignmentActual {
  return {
    status: "PLANNED",
    unitId: "unit-3a",
    coveredSpaceIds: ["space-3a"],
    startsAt: new Date("2026-09-21T11:00:00.000Z"),
    endsAt: new Date("2026-09-21T13:00:00.000Z"),
    ...overrides,
  };
}

const breakfastWindow = {
  startsAt: new Date("2026-09-21T11:00:00.000Z"),
  endsAt: new Date("2026-09-21T13:00:00.000Z"),
};
const lunchWindow = {
  startsAt: new Date("2026-09-21T16:30:00.000Z"),
  endsAt: new Date("2026-09-21T18:30:00.000Z"),
};

describe("coverage expectation applicability", () => {
  it("applies one Servery SERVER requirement to every Servery room without copied rows", () => {
    const items = [serveryBreakfastServer()];
    const threeA = resolveCoverageExpectationsForLocation({
      items,
      context: serveryContext("space-3a"),
      cycles,
      cycleStableKey: "breakfast",
    });
    const threeB = resolveCoverageExpectationsForLocation({
      items,
      context: serveryContext("space-3b"),
      cycles,
      cycleStableKey: "breakfast",
    });
    assert.deepEqual(roles(threeA), ["SERVER×1@breakfast"]);
    assert.deepEqual(roles(threeB), ["SERVER×1@breakfast"]);
    assert.equal(threeA[0]?.provenance, "OPERATIONAL_TYPE_DEFAULT");
    assert.match(threeA[0]?.detail ?? "", /Inherited from Operational Type: Servery/);
  });

  it("isolates Retail lunch from Servery breakfast", () => {
    const items = [serveryBreakfastServer(), retailLunchServer()];
    const serveryBreakfast = resolveCoverageExpectationsForLocation({
      items,
      context: serveryContext(),
      cycles,
      cycleStableKey: "breakfast",
    });
    const retailLunch = resolveCoverageExpectationsForLocation({
      items,
      context: {
        departmentId: "dietary",
        spaceId: "space-retail",
        unitId: "unit-retail",
        operationalTypeKey: "retail",
        operationalTypeName: "Retail",
      },
      cycles,
      cycleStableKey: "lunch",
    });
    const retailBreakfast = resolveCoverageExpectationsForLocation({
      items,
      context: {
        departmentId: "dietary",
        spaceId: "space-retail",
        unitId: "unit-retail",
        operationalTypeKey: "retail",
        operationalTypeName: "Retail",
      },
      cycles,
      cycleStableKey: "breakfast",
    });
    assert.deepEqual(roles(serveryBreakfast), ["SERVER×1@breakfast"]);
    assert.deepEqual(roles(retailLunch), ["SERVER×1@lunch"]);
    assert.deepEqual(roles(retailBreakfast), []);
  });

  it("splits Main Kitchen breakfast production by valid registry roles", () => {
    const kitchen = resolveCoverageExpectationsForLocation({
      items: mainKitchenBreakfast(),
      context: {
        departmentId: "dietary",
        spaceId: "space-kitchen",
        unitId: "unit-kitchen",
        operationalTypeKey: "main_kitchen",
        operationalTypeName: "Main Kitchen",
      },
      cycles,
      cycleStableKey: "breakfast_production",
    });
    assert.deepEqual(roles(kitchen), [
      "COOK×2@breakfast_production",
      "HOT_PREP×1@breakfast_production",
      "PORTER×1@breakfast_production",
    ]);
  });

  it("does not invent OT-derived requirements for an untyped room", () => {
    const resolved = resolveCoverageExpectationsForLocation({
      items: [serveryBreakfastServer(), ...mainKitchenBreakfast()],
      context: {
        departmentId: "dietary",
        spaceId: "space-untyped",
        unitId: "unit-3a",
        operationalTypeKey: null,
        operationalTypeName: null,
      },
      cycles,
      cycleStableKey: "breakfast",
    });
    assert.deepEqual(roles(resolved), []);
  });

  it("uses the caller-supplied Operational Type so draft OT cannot leak into runtime resolution", () => {
    const items = [serveryBreakfastServer(), retailLunchServer()];
    const runtimeServery = resolveCoverageExpectationsForLocation({
      items,
      context: serveryContext(),
      cycles,
      cycleStableKey: "breakfast",
    });
    const workingRetail = resolveCoverageExpectationsForLocation({
      items,
      context: {
        departmentId: "dietary",
        spaceId: "space-3a",
        unitId: "unit-3a",
        operationalTypeKey: "retail",
        operationalTypeName: "Retail",
      },
      cycles,
      cycleStableKey: "breakfast",
    });
    assert.deepEqual(roles(runtimeServery), ["SERVER×1@breakfast"]);
    assert.deepEqual(roles(workingRetail), []);
  });

  it("retains a legacy unit-targeted item as EXPLICIT_LOCATION", () => {
    const resolved = resolveCoverageExpectationsForLocation({
      items: [
        item({
          id: "legacy-unit",
          roleKey: "SERVER",
          unitId: "unit-3a",
        }),
      ],
      context: serveryContext(),
      cycles,
    });
    assert.equal(resolved[0]?.provenance, "EXPLICIT_LOCATION");
  });
});

describe("coverage publication boundary", () => {
  const published: CoverageTemplateVersionRow = {
    id: "pub-1",
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
        requiredCount: 1,
        unitId: null,
        applicableOperationalTypeKeys: ["servery"],
        applicableOperationalCycleStableKeys: ["breakfast"],
      },
    ],
  };
  const draft: CoverageTemplateVersionRow = {
    ...published,
    id: "draft-2",
    version: 2,
    status: "DRAFT",
    items: [
      {
        ...published.items[0]!,
        id: "item-2",
        requiredCount: 2,
      },
    ],
  };

  it("Build working preview uses the draft count", () => {
    const working = flattenCoverageTemplateItems(selectWorkingCoverageTemplates([published, draft]));
    assert.equal(working[0]?.requiredCount, 2);
    assert.equal(working[0]?.templateStatus, "DRAFT");
  });

  it("Run keeps the published count until the draft is effective", () => {
    const runtime = flattenCoverageTemplateItems(
      selectRuntimeCoverageTemplates([published, draft], "2026-09-21"),
    );
    assert.equal(runtime[0]?.requiredCount, 1);
    assert.equal(runtime[0]?.templateStatus, "PUBLISHED");
  });

  it("future effective published versions wait", () => {
    const future: CoverageTemplateVersionRow = {
      ...published,
      id: "pub-2",
      version: 2,
      effectiveFrom: "2026-10-01",
      items: [{ ...published.items[0]!, requiredCount: 2 }],
    };
    const today = flattenCoverageTemplateItems(
      selectRuntimeCoverageTemplates([published, future], "2026-09-21"),
    );
    const later = flattenCoverageTemplateItems(
      selectRuntimeCoverageTemplates([published, future], "2026-10-01"),
    );
    assert.equal(today[0]?.requiredCount, 1);
    assert.equal(later[0]?.requiredCount, 2);
  });

  it("historical effective versions remain queryable", () => {
    const closed: CoverageTemplateVersionRow = {
      ...published,
      effectiveTo: "2026-09-20",
    };
    const current: CoverageTemplateVersionRow = {
      ...published,
      id: "pub-2",
      version: 2,
      effectiveFrom: "2026-09-21",
      items: [{ ...published.items[0]!, requiredCount: 2 }],
    };
    const yesterday = flattenCoverageTemplateItems(
      selectRuntimeCoverageTemplates([closed, current], "2026-09-20"),
    );
    const today = flattenCoverageTemplateItems(
      selectRuntimeCoverageTemplates([closed, current], "2026-09-21"),
    );
    assert.equal(yesterday[0]?.requiredCount, 1);
    assert.equal(today[0]?.requiredCount, 2);
    assert.equal(dayBefore("2026-09-21"), "2026-09-20");
  });

  it("Run still hides inactive templates even when the interval covers the date", () => {
    const inactive: CoverageTemplateVersionRow = {
      ...published,
      isActive: false,
      effectiveTo: "2026-09-04",
    };
    const runtime = selectRuntimeCoverageTemplates([inactive], "2026-09-03");
    assert.equal(runtime.length, 0);
  });
});

describe("historical coverage selection", () => {
  const v1: CoverageTemplateVersionRow = {
    id: "cov-v1",
    stableKey: "servery-meals",
    version: 1,
    status: "PUBLISHED",
    isActive: false,
    effectiveFrom: "2026-09-01",
    effectiveTo: "2026-09-04",
    items: [
      {
        id: "item-v1",
        roleKey: "SERVER",
        roleLabel: "Server",
        requiredCount: 2,
        unitId: null,
        applicableOperationalTypeKeys: ["servery"],
        applicableOperationalCycleStableKeys: ["breakfast"],
      },
    ],
  };
  const v2: CoverageTemplateVersionRow = {
    ...v1,
    id: "cov-v2",
    version: 2,
    isActive: true,
    effectiveFrom: "2026-09-05",
    effectiveTo: null,
    items: [{ ...v1.items[0]!, id: "item-v2", requiredCount: 1 }],
  };

  it("keeps an inactive superseded template as historical expectation on a covered date", () => {
    const selected = selectHistoricalCoverageTemplates([v1, v2], "2026-09-03");
    assert.equal(selected.status, "evaluated");
    if (selected.status !== "evaluated") return;
    assert.equal(selected.templates[0]?.id, "cov-v1");
    assert.equal(selected.templates[0]?.isActive, false);
    assert.equal(flattenCoverageTemplateItems(selected.templates)[0]?.requiredCount, 2);
  });

  it("does not use latest-row-wins when two published intervals overlap", () => {
    const overlap: CoverageTemplateVersionRow = {
      ...v2,
      effectiveFrom: "2026-09-03",
    };
    const selected = selectHistoricalCoverageTemplates([v1, overlap], "2026-09-03");
    assert.equal(selected.status, "unavailable");
    if (selected.status !== "unavailable") return;
    assert.equal(selected.reason, "coverage_interval_ambiguous");
  });
});

describe("same-day coverage publication policy", () => {
  it("bumps today and omitted dates to the next facility service day", () => {
    assert.equal(
      resolveCoveragePublishEffectiveFromKey({
        requestedEffectiveFromKey: "2026-09-23",
        currentFacilityServiceDateKey: "2026-09-23",
      }),
      "2026-09-24",
    );
    assert.equal(
      resolveCoveragePublishEffectiveFromKey({
        requestedEffectiveFromKey: null,
        currentFacilityServiceDateKey: "2026-09-23",
      }),
      "2026-09-24",
    );
    assert.equal(
      resolveCoveragePublishEffectiveFromKey({
        requestedEffectiveFromKey: "2026-09-20",
        currentFacilityServiceDateKey: "2026-09-23",
      }),
      "2026-09-24",
    );
  });

  it("preserves a requested future effective date", () => {
    assert.equal(
      resolveCoveragePublishEffectiveFromKey({
        requestedEffectiveFromKey: "2026-10-01",
        currentFacilityServiceDateKey: "2026-09-23",
      }),
      "2026-10-01",
    );
  });

  it("publishCoverageExpectation uses the facility-service-day policy", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/scheduling/coverage-expectations/service.ts"), "utf8");
    assert.match(src, /resolveCoveragePublishEffectiveFromKey/);
    assert.match(src, /getFacilityServiceDate/);
    assert.doesNotMatch(src, /toServiceDateKey\(new Date\(\)\)/);
  });
});

describe("canonical coverage states", () => {
  it("maps plan lifecycle and quantity to the locked states", () => {
    assert.equal(planLifecycleFromStatus(null), "MISSING");
    assert.equal(planLifecycleFromStatus("DRAFT"), "DRAFT");
    assert.equal(planLifecycleFromStatus("CONFIRMED"), "RUNTIME_VISIBLE");
    assert.equal(
      evaluateCoverageSlotState({
        plan: "MISSING",
        requiredCount: 1,
        filledCount: 0,
        hasCallDownRisk: false,
      }),
      "NOT_YET_ASSIGNED",
    );
    assert.equal(
      evaluateCoverageSlotState({
        plan: "DRAFT",
        requiredCount: 1,
        filledCount: 1,
        hasCallDownRisk: false,
      }),
      "NOT_CONFIRMED",
    );
    assert.equal(
      evaluateCoverageSlotState({
        plan: "RUNTIME_VISIBLE",
        requiredCount: 2,
        filledCount: 2,
        hasCallDownRisk: false,
      }),
      "COVERED",
    );
    assert.equal(
      evaluateCoverageSlotState({
        plan: "RUNTIME_VISIBLE",
        requiredCount: 2,
        filledCount: 1,
        hasCallDownRisk: false,
      }),
      "AT_RISK",
    );
    assert.equal(
      evaluateCoverageSlotState({
        plan: "RUNTIME_VISIBLE",
        requiredCount: 2,
        filledCount: 0,
        hasCallDownRisk: false,
      }),
      "UNCOVERED",
    );
    assert.equal(
      evaluateCoverageSlotState({
        plan: "RUNTIME_VISIBLE",
        requiredCount: 1,
        filledCount: 1,
        hasCallDownRisk: true,
      }),
      "AT_RISK",
    );
  });

  it("counts two distinct COOK assignments as covered and does not double-count one OA", () => {
    const expectation = resolveCoverageExpectationsForLocation({
      items: mainKitchenBreakfast().filter((row) => row.roleKey === "COOK"),
      context: {
        departmentId: "dietary",
        spaceId: "space-kitchen",
        unitId: "unit-kitchen",
        operationalTypeKey: "main_kitchen",
        operationalTypeName: "Main Kitchen",
      },
      cycles,
      cycleStableKey: "breakfast_production",
    })[0]!;
    const twoCooks = [
      assignment({
        id: "oa-a",
        roleKey: "COOK",
        coveredSpaceIds: ["space-kitchen"],
        unitId: "unit-kitchen",
      }),
      assignment({
        id: "oa-b",
        roleKey: "COOK",
        coveredSpaceIds: ["space-kitchen"],
        unitId: "unit-kitchen",
      }),
      assignment({
        id: "oa-a",
        roleKey: "COOK",
        coveredSpaceIds: ["space-kitchen"],
        unitId: "unit-kitchen",
      }),
    ];
    const matches = matchingAssignmentsForSlot({
      expectation,
      assignments: twoCooks,
      spaceId: "space-kitchen",
      unitId: "unit-kitchen",
      cycleStartsAt: breakfastWindow.startsAt,
      cycleEndsAt: breakfastWindow.endsAt,
    });
    assert.equal(matches.length, 2);
  });

  it("requires location inclusion and cycle overlap", () => {
    const expectation = resolveCoverageExpectationsForLocation({
      items: [serveryBreakfastServer()],
      context: serveryContext(),
      cycles,
      cycleStableKey: "breakfast",
    })[0]!;
    const outsideCycle = assignment({
      id: "oa-lunch",
      roleKey: "SERVER",
      startsAt: lunchWindow.startsAt,
      endsAt: lunchWindow.endsAt,
    });
    const otherRoom = assignment({
      id: "oa-other",
      roleKey: "SERVER",
      coveredSpaceIds: ["space-retail"],
      unitId: "unit-retail",
    });
    const cook = assignment({ id: "oa-cook", roleKey: "COOK" });
    assert.equal(
      matchingAssignmentsForSlot({
        expectation,
        assignments: [outsideCycle],
        spaceId: "space-3a",
        unitId: "unit-3a",
        cycleStartsAt: breakfastWindow.startsAt,
        cycleEndsAt: breakfastWindow.endsAt,
      }).length,
      0,
    );
    assert.equal(
      matchingAssignmentsForSlot({
        expectation,
        assignments: [otherRoom],
        spaceId: "space-3a",
        unitId: "unit-3a",
        cycleStartsAt: breakfastWindow.startsAt,
        cycleEndsAt: breakfastWindow.endsAt,
      }).length,
      0,
    );
    assert.equal(
      matchingAssignmentsForSlot({
        expectation,
        assignments: [cook],
        spaceId: "space-3a",
        unitId: "unit-3a",
        cycleStartsAt: breakfastWindow.startsAt,
        cycleEndsAt: breakfastWindow.endsAt,
      }).length,
      0,
    );
    const unitWide = assignment({
      id: "oa-unit",
      roleKey: "SERVER",
      coveredSpaceIds: [],
      unitId: "unit-3a",
      startsAt: null,
      endsAt: null,
    });
    assert.equal(assignmentCoversLocation(unitWide, "space-3a", "unit-3a"), true);
    assert.equal(assignmentCoversLocation(unitWide, "space-retail", "unit-retail"), false);
  });

  it("does not treat schedule or team membership as a fill", () => {
    const expectation = resolveCoverageExpectationsForLocation({
      items: [serveryBreakfastServer()],
      context: serveryContext(),
      cycles,
      cycleStableKey: "breakfast",
    })[0]!;
    const empty = evaluateCoverageSlots({
      expectations: [expectation],
      assignments: [],
      spaceId: "space-3a",
      unitId: "unit-3a",
      plan: "RUNTIME_VISIBLE",
      cycleWindows: new Map([["breakfast", breakfastWindow]]),
    });
    assert.equal(empty[0]?.state, "UNCOVERED");
    assert.equal(empty[0]?.filledCount, 0);
  });
});

describe("coverage source contracts", () => {
  it("keeps Locations as an inspector and Coverage as the editor", () => {
    const client = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/locations-programming-client.tsx",
      ),
      "utf8",
    );
    const workspace = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/coverage-workspace.tsx",
      ),
      "utf8",
    );
    const summary = readFileSync(
      join(
        process.cwd(),
        "src/lib/scheduling/operational-assignments/build-coverage-summary.ts",
      ),
      "utf8",
    );
    assert.match(client, /Manage Coverage/);
    assert.match(client, /Staffing \/ Coverage Expectations/);
    assert.doesNotMatch(client, /Mary assigned/);
    assert.match(workspace, /Draft edits do not change/);
    assert.match(workspace, /Operational Types/);
    assert.match(workspace, /Operational Cycles/);
    assert.match(summary, /Never falls back to/);
    assert.match(summary, /engine: "canonical-oa"/);
    assert.doesNotMatch(summary, /from ["']@\/lib\/scheduling\/schedule/);
    assert.doesNotMatch(summary, /prisma\.scheduleEntry/);
  });

  it("does not re-export coverage writes that import auth/next/headers", () => {
    const barrel = readFileSync(
      join(process.cwd(), "src/lib/scheduling/coverage-expectations/index.ts"),
      "utf8",
    );
    assert.doesNotMatch(barrel, /from ["']\.\/service["']/);
  });
});
