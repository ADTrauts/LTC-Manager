import assert from "node:assert/strict";
import test from "node:test";

import type { LogRequirement } from "@/lib/logs-architecture/types";
import type { KeyTimeDayTiming } from "@/lib/operational-cycles/key-time-day-expectation";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import type {
  CoverageAssignmentActual,
  CoverageTemplateVersionRow,
} from "@/lib/scheduling/coverage-expectations";

import {
  composeRuntimeLocationStates,
  type RuntimeLocationComposeInput,
  type RuntimePublishedRunModel,
  type RuntimeSpaceIdentityRow,
} from "./compose";
import { exceptionSortRank } from "./exceptions";
import { deriveRuntimeNextEvent } from "./next-event";
import { resolveEvidenceRequirementsForSpaces, summarizeRuntimeEvidence } from "./evidence";
import type { RuntimeAssetIssueFact, RuntimeLocationState } from "./types";

const TZ = "UTC";
const DATE_KEY = "2026-08-17";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

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
    description: null,
    cycleType: "CUSTOM",
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
          : "10:00",
    overnight: false,
    applicableDaysOfWeek: ALL_DAYS,
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: partial.mealType ?? null,
    locationMode: partial.locationMode ?? "EXPLICIT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    applicableOperationalTypeKeys: partial.applicableOperationalTypeKeys,
    roomTypeKey: null,
    expectedMilestones: [],
    status: "PUBLISHED",
    unitIds: partial.unitIds ?? [],
    spaceIds: partial.spaceIds ?? [],
    milestoneTimes: [],
    keyTimeGroups: partial.keyTimeGroups ?? [],
  };
}

function space(
  partial: Partial<RuntimeSpaceIdentityRow> & Pick<RuntimeSpaceIdentityRow, "spaceId" | "departmentId">,
): RuntimeSpaceIdentityRow {
  return {
    name: partial.name ?? partial.spaceId,
    unitId: partial.unitId ?? "unit-1",
    unitName: partial.unitName ?? "1A",
    departmentLabel: partial.departmentLabel ?? "Dietary",
    floorName: partial.floorName ?? "Floor 1",
    neighborhoodName: partial.neighborhoodName ?? null,
    roomTypeKey: partial.roomTypeKey ?? null,
    roomTypeLabel: partial.roomTypeLabel ?? null,
    ...partial,
  };
}

function timing(
  partial: Partial<KeyTimeDayTiming> & Pick<KeyTimeDayTiming, "spaceId" | "cycleStableKey" | "configuredDueLocal">,
): KeyTimeDayTiming {
  return {
    expectationId: partial.expectationId ?? `${partial.spaceId}-${partial.cycleStableKey}`,
    spaceId: partial.spaceId,
    cycleId: partial.cycleId ?? partial.cycleStableKey,
    cycleStableKey: partial.cycleStableKey,
    cycleVersion: 1,
    cycleLabel: partial.cycleLabel ?? "Tray Line Start",
    parentCycleLabel: "Breakfast",
    displayPath: "Breakfast → Tray Line Start",
    keyTimeGroupId: partial.keyTimeGroupId ?? "g1",
    configuredDueLocal: partial.configuredDueLocal,
    adjustedDueLocal: partial.adjustedDueLocal ?? null,
    expectedToday: partial.expectedToday ?? partial.adjustedDueLocal ?? partial.configuredDueLocal,
    actualDueLocal: partial.actualDueLocal ?? null,
    completedAt: partial.completedAt ?? null,
    adjustedAt: partial.adjustedAt ?? null,
  };
}

function requirement(
  partial: Partial<LogRequirement> & Pick<LogRequirement, "requirementKey" | "productState" | "catalogName">,
): LogRequirement {
  return {
    attachmentId: partial.attachmentId ?? "att-1",
    attachmentStableKey: "att_food_temp",
    catalogStableKey: "food_temperature_log",
    catalogVersion: 1,
    purposeType: "LOG",
    facilityId: "fac-1",
    departmentId: "dept-1",
    operationalDateKey: DATE_KEY,
    timingSource: "OPERATIONAL_CYCLE",
    scheduleKind: "OPERATIONAL_CYCLE",
    cycleStableKey: partial.cycleStableKey ?? "breakfast",
    cycleLabel: "Breakfast",
    windowStartLocal: "06:00",
    windowEndLocal: "10:00",
    windowStartsAt: at("06:00"),
    windowEndsAt: at("10:00"),
    target: { kind: "SPACE", spaceId: "servery-a" },
    productStateLabel: partial.productState,
    needsSupervisorReview: false,
    recordId: null,
    recordStatus: null,
    fields: [],
    instructions: null,
    ...partial,
  };
}

function template(input: {
  stableKey?: string;
  ot: string;
  cycle: string;
  items: Array<{ roleKey: string; roleLabel: string; requiredCount: number }>;
}): CoverageTemplateVersionRow {
  return {
    id: input.stableKey ?? "tmpl-1",
    stableKey: input.stableKey ?? "dietary-coverage",
    version: 1,
    status: "PUBLISHED",
    isActive: true,
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
    items: input.items.map((item, index) => ({
      id: `${item.roleKey}-${index}`,
      roleKey: item.roleKey,
      roleLabel: item.roleLabel,
      requiredCount: item.requiredCount,
      unitId: null,
      applicableOperationalTypeKeys: [input.ot],
      applicableOperationalCycleStableKeys: [input.cycle],
    })),
  };
}

function assignment(
  partial: Partial<CoverageAssignmentActual> & Pick<CoverageAssignmentActual, "id" | "roleKey">,
): CoverageAssignmentActual {
  return {
    status: "ACTIVE",
    unitId: "unit-1",
    coveredSpaceIds: partial.coveredSpaceIds ?? ["servery-a"],
    startsAt: at("06:00"),
    endsAt: at("10:00"),
    ...partial,
  };
}

function runModel(input: {
  cycles: OperationalCycleDefinition[];
  timings?: KeyTimeDayTiming[];
  now?: Date;
}): RuntimePublishedRunModel {
  const now = input.now ?? at("07:30");
  return {
    cycles: input.cycles,
    timings: input.timings ?? [],
    provenance: "NEW_PERIOD_KEY_TIME",
    timezone: TZ,
    operationalDateKey: DATE_KEY,
    now,
    nowLocalHhMm: `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function composeInput(
  overrides: Partial<RuntimeLocationComposeInput> & {
    spaces: RuntimeSpaceIdentityRow[];
  },
): RuntimeLocationComposeInput {
  return {
    facilityId: "fac-1",
    facilityName: "Harbor",
    now: at("07:30"),
    operationalDateKey: DATE_KEY,
    timezone: TZ,
    nowLocalHhMm: "07:30",
    operationalAssignmentsEnabled: true,
    profilesByDepartmentId: new Map([
      ["dept-1", { id: "profile-1", version: 3, status: "ACTIVE" }],
    ]),
    operationalTypesBySpaceId: new Map(),
    runModelsByDepartmentId: new Map(),
    coverageTemplatesByDepartmentId: new Map(),
    coveragePlanByDepartmentId: new Map([["dept-1", "CONFIRMED"]]),
    assignmentsByDepartmentId: new Map(),
    evidenceBySpaceId: new Map(),
    assetsBySpaceId: new Map(),
    issuesBySpaceId: new Map(),
    serveryEventsByUnitId: new Map(),
    ...overrides,
  };
}

function breakfastCycles(spaceId: string): OperationalCycleDefinition[] {
  return [
    cycle({
      stableKey: "breakfast",
      label: "Breakfast",
      startLocal: "06:00",
      endLocal: "10:00",
      spaceIds: [spaceId],
      mealType: "BREAKFAST",
    }),
    cycle({
      stableKey: "tray_line",
      label: "Tray Line Start",
      nodeKind: "KEY_TIME",
      parentStableKey: "breakfast",
      startLocal: null,
      endLocal: null,
      spaceIds: [spaceId],
      keyTimeGroups: [{ id: "g-tray", dueLocal: "07:45", spaceIds: [spaceId] }],
    }),
  ];
}

test("healthy Servery: Breakfast active, covered, no exceptions, no readiness exception", () => {
  const states = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "servery-a", departmentId: "dept-1", name: "Naval Park Servery" })],
      operationalTypesBySpaceId: new Map([
        ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
      ]),
      runModelsByDepartmentId: new Map([
        [
          "dept-1",
          runModel({
            cycles: breakfastCycles("servery-a"),
            timings: [
              timing({
                spaceId: "servery-a",
                cycleStableKey: "tray_line",
                configuredDueLocal: "07:45",
              }),
            ],
          }),
        ],
      ]),
      coverageTemplatesByDepartmentId: new Map([
        [
          "dept-1",
          [
            template({
              ot: "SERVERY",
              cycle: "breakfast",
              items: [{ roleKey: "SERVER", roleLabel: "Server", requiredCount: 1 }],
            }),
          ],
        ],
      ]),
      assignmentsByDepartmentId: new Map([
        ["dept-1", [assignment({ id: "oa-1", roleKey: "SERVER" })]],
      ]),
      evidenceBySpaceId: new Map([
        [
          "servery-a",
          [
            requirement({
              requirementKey: "food-temp-complete",
              catalogName: "Food Temperature",
              productState: "COMPLETED",
            }),
          ],
        ],
      ]),
    }),
  );

  const state = states[0]!;
  assert.equal(state.identity.location.kind, "SPACE");
  assert.equal(state.program.operationalType.key, "SERVERY");
  assert.equal(state.program.operationalType.profileVersion, 3);
  assert.equal(state.operation.state, "ACTIVE");
  assert.equal(state.operation.current?.cycleStableKey, "breakfast");
  assert.equal(state.coverage.availability, "evaluated");
  assert.equal(state.coverage.slots[0]?.state, "COVERED");
  assert.deepEqual(state.coverage.slots[0]?.assignmentRefs, [
    { assignmentId: "oa-1", employeeId: null, employeeDisplayName: null },
  ]);
  assert.equal(state.evidence.overdue.length, 0);
  assert.equal(state.exceptions.length, 0);
  assert.equal(state.readiness.availability, "deferred_legacy_engine");
  assert.equal(
    state.exceptions.some((row) => row.source === "coverage" && row.state === "readiness"),
    false,
  );
  assert.ok(!("summary" in state));
  assert.equal(state.milestones.items.some((item) => item.kind === "KEY_TIME" && item.canonical), true);
});

test("Servery needing attention: UNCOVERED + overdue evidence exceptions", () => {
  const states = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "servery-a", departmentId: "dept-1" })],
      operationalTypesBySpaceId: new Map([
        ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
      ]),
      runModelsByDepartmentId: new Map([
        ["dept-1", runModel({ cycles: breakfastCycles("servery-a") })],
      ]),
      coverageTemplatesByDepartmentId: new Map([
        [
          "dept-1",
          [
            template({
              ot: "SERVERY",
              cycle: "breakfast",
              items: [{ roleKey: "SERVER", roleLabel: "Server", requiredCount: 1 }],
            }),
          ],
        ],
      ]),
      assignmentsByDepartmentId: new Map([["dept-1", []]]),
      evidenceBySpaceId: new Map([
        [
          "servery-a",
          [
            requirement({
              requirementKey: "food-temp-overdue",
              catalogName: "Food Temperature",
              productState: "OVERDUE",
            }),
          ],
        ],
      ]),
    }),
  );

  const state = states[0]!;
  assert.equal(state.coverage.slots[0]?.state, "UNCOVERED");
  assert.deepEqual(
    state.exceptions.map((row) => `${row.source}:${row.state}`).sort(),
    ["coverage:UNCOVERED", "evidence:OVERDUE"],
  );
  assert.equal(
    state.exceptions.some((row) => row.source === "milestone" && row.state === "readiness"),
    false,
  );
});

test("Retail uses its own OT / cycle / logs — no Servery leakage", () => {
  const retailCycles = [
    cycle({
      stableKey: "retail_day",
      label: "Retail Service",
      startLocal: "07:00",
      endLocal: "19:00",
      spaceIds: ["retail-1"],
    }),
  ];
  const states = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "retail-1", departmentId: "dept-1", name: "Cafe" })],
      operationalTypesBySpaceId: new Map([
        ["retail-1", { key: "RETAIL", name: "Retail", id: "ot-retail" }],
      ]),
      runModelsByDepartmentId: new Map([["dept-1", runModel({ cycles: retailCycles })]]),
      coverageTemplatesByDepartmentId: new Map([
        [
          "dept-1",
          [
            template({
              ot: "RETAIL",
              cycle: "retail_day",
              items: [{ roleKey: "CASHIER", roleLabel: "Cashier", requiredCount: 1 }],
            }),
            template({
              stableKey: "servery-only",
              ot: "SERVERY",
              cycle: "breakfast",
              items: [{ roleKey: "SERVER", roleLabel: "Server", requiredCount: 1 }],
            }),
          ],
        ],
      ]),
      assignmentsByDepartmentId: new Map([
        [
          "dept-1",
          [assignment({ id: "oa-r", roleKey: "CASHIER", coveredSpaceIds: ["retail-1"] })],
        ],
      ]),
      evidenceBySpaceId: new Map([
        [
          "retail-1",
          [
            requirement({
              requirementKey: "retail-close",
              catalogName: "Retail Close",
              productState: "UPCOMING",
              cycleStableKey: "retail_day",
              target: { kind: "SPACE", spaceId: "retail-1" },
            }),
          ],
        ],
      ]),
      serveryEventsByUnitId: new Map([
        [
          "unit-1",
          [
            {
              id: "ev-1",
              unitId: "unit-1",
              mealType: "BREAKFAST",
              mealServiceReadyAt: at("06:50"),
              mealServiceStartedAt: at("07:00"),
              readyRecordedAt: at("06:51"),
              startedRecordedAt: at("07:01"),
            },
          ],
        ],
      ]),
    }),
  );

  const state = states[0]!;
  assert.equal(state.program.operationalType.key, "RETAIL");
  assert.equal(state.operation.current?.cycleStableKey, "retail_day");
  assert.equal(state.coverage.slots.length, 1);
  assert.equal(state.coverage.slots[0]?.roleKey, "CASHIER");
  assert.equal(state.coverage.slots.some((slot) => slot.roleKey === "SERVER"), false);
  assert.equal(state.evidence.items[0]?.displayName, "Retail Close");
  assert.equal(
    state.milestones.items.some((item) => item.kind === "SERVERY_READY"),
    false,
  );
});

test("Main Kitchen: multiple coverage slots and assets, not treated as Servery", () => {
  const kitchenCycles = [
    cycle({
      stableKey: "production",
      label: "Production",
      startLocal: "05:00",
      endLocal: "14:00",
      spaceIds: ["kitchen-1"],
    }),
  ];
  const states = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "kitchen-1", departmentId: "dept-1", name: "Main Kitchen" })],
      operationalTypesBySpaceId: new Map([
        ["kitchen-1", { key: "MAIN_KITCHEN", name: "Main Kitchen", id: "ot-kitchen" }],
      ]),
      runModelsByDepartmentId: new Map([["dept-1", runModel({ cycles: kitchenCycles })]]),
      coverageTemplatesByDepartmentId: new Map([
        [
          "dept-1",
          [
            template({
              ot: "MAIN_KITCHEN",
              cycle: "production",
              items: [
                { roleKey: "COOK", roleLabel: "Cook", requiredCount: 2 },
                { roleKey: "PREP", roleLabel: "Prep", requiredCount: 1 },
              ],
            }),
          ],
        ],
      ]),
      assignmentsByDepartmentId: new Map([
        [
          "dept-1",
          [
            assignment({ id: "oa-c1", roleKey: "COOK", coveredSpaceIds: ["kitchen-1"] }),
            assignment({ id: "oa-c2", roleKey: "COOK", coveredSpaceIds: ["kitchen-1"] }),
            assignment({ id: "oa-p1", roleKey: "PREP", coveredSpaceIds: ["kitchen-1"] }),
          ],
        ],
      ]),
      assetsBySpaceId: new Map([
        [
          "kitchen-1",
          [
            {
              assetId: "oven-1",
              name: "Combi Oven",
              status: "OPERATIONAL",
              openIssueCount: 0,
              openWorkOrderCount: 1,
            },
            {
              assetId: "mixer-1",
              name: "Mixer",
              status: "DEGRADED",
              openIssueCount: 1,
              openWorkOrderCount: 0,
            },
          ],
        ],
      ]),
      issuesBySpaceId: new Map([
        [
          "kitchen-1",
          [
            {
              issueId: "iss-1",
              assetId: "mixer-1",
              impact: "NO_IMMEDIATE_IMPACT",
              summary: "Mixer noisy",
              href: "/asset-issues/iss-1",
            },
          ],
        ],
      ]),
    }),
  );

  const state = states[0]!;
  assert.equal(state.program.operationalType.key, "MAIN_KITCHEN");
  assert.equal(state.operation.current?.cycleStableKey, "production");
  assert.equal(state.coverage.slots.length, 2);
  assert.ok(state.coverage.slots.every((slot) => slot.state === "COVERED"));
  assert.equal(state.assets.assets.length, 2);
  assert.equal(state.assets.issuesAffectingOperation.length, 0);
  assert.equal(state.exceptions.length, 0);
  assert.equal(state.assets.assets[0]?.openWorkOrderCount, 1);
});

test("no active cycle is NONE, not failure", () => {
  const states = composeRuntimeLocationStates(
    composeInput({
      now: at("15:00"),
      nowLocalHhMm: "15:00",
      spaces: [space({ spaceId: "servery-a", departmentId: "dept-1" })],
      operationalTypesBySpaceId: new Map([
        ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
      ]),
      runModelsByDepartmentId: new Map([
        [
          "dept-1",
          runModel({
            now: at("15:00"),
            cycles: breakfastCycles("servery-a"),
          }),
        ],
      ]),
    }),
  );

  const state = states[0]!;
  assert.equal(state.operation.state, "NONE");
  assert.equal(state.exceptions.length, 0);
  assert.equal(state.program.operationalType.state, "assigned");
});

test("untyped space has unassigned program and no invented cycle", () => {
  const states = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "closet-1", departmentId: "dept-1", name: "Closet" })],
      runModelsByDepartmentId: new Map([
        ["dept-1", runModel({ cycles: breakfastCycles("servery-a") })],
      ]),
    }),
  );
  const state = states[0]!;
  assert.equal(state.program.operationalType.state, "unassigned");
  assert.equal(state.operation.state, "NONE");
});

test("OA disabled: coverage feature_disabled, no schedule-derived slots or exceptions", () => {
  const states = composeRuntimeLocationStates(
    composeInput({
      operationalAssignmentsEnabled: false,
      spaces: [space({ spaceId: "servery-a", departmentId: "dept-1" })],
      operationalTypesBySpaceId: new Map([
        ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
      ]),
      runModelsByDepartmentId: new Map([
        ["dept-1", runModel({ cycles: breakfastCycles("servery-a") })],
      ]),
      coverageTemplatesByDepartmentId: new Map([
        [
          "dept-1",
          [
            template({
              ot: "SERVERY",
              cycle: "breakfast",
              items: [{ roleKey: "SERVER", roleLabel: "Server", requiredCount: 1 }],
            }),
          ],
        ],
      ]),
      assignmentsByDepartmentId: new Map([
        ["dept-1", [assignment({ id: "oa-1", roleKey: "SERVER" })]],
      ]),
    }),
  );

  const state = states[0]!;
  assert.equal(state.coverage.availability, "feature_disabled");
  assert.deepEqual(state.coverage.slots, []);
  assert.equal(state.coverage.planLifecycle, null);
  assert.equal(state.exceptions.some((row) => row.source === "coverage"), false);
  assert.equal(state.operation.state, "ACTIVE");
});

test("coverage states: AT_RISK, NOT_YET_ASSIGNED, NOT_CONFIRMED", () => {
  const templates = [
    template({
      ot: "SERVERY",
      cycle: "breakfast",
      items: [{ roleKey: "SERVER", roleLabel: "Server", requiredCount: 2 }],
    }),
  ];
  const cycles = breakfastCycles("servery-a");
  const base = {
    spaces: [space({ spaceId: "servery-a", departmentId: "dept-1" })],
    operationalTypesBySpaceId: new Map([
      ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
    ]),
    runModelsByDepartmentId: new Map([["dept-1", runModel({ cycles })]]),
    coverageTemplatesByDepartmentId: new Map([["dept-1", templates]]),
  } satisfies Partial<RuntimeLocationComposeInput>;

  const atRisk = composeRuntimeLocationStates(
    composeInput({
      ...base,
      assignmentsByDepartmentId: new Map([
        ["dept-1", [assignment({ id: "oa-1", roleKey: "SERVER" })]],
      ]),
    }),
  )[0]!;
  assert.equal(atRisk.coverage.slots[0]?.state, "AT_RISK");

  const notYet = composeRuntimeLocationStates(
    composeInput({
      ...base,
      coveragePlanByDepartmentId: new Map([["dept-1", "DRAFT"]]),
      assignmentsByDepartmentId: new Map([["dept-1", []]]),
    }),
  )[0]!;
  assert.equal(notYet.coverage.slots[0]?.state, "NOT_YET_ASSIGNED");

  const notConfirmed = composeRuntimeLocationStates(
    composeInput({
      ...base,
      coveragePlanByDepartmentId: new Map([["dept-1", "DRAFT"]]),
      assignmentsByDepartmentId: new Map([
        ["dept-1", [assignment({ id: "oa-1", roleKey: "SERVER" })]],
      ]),
    }),
  )[0]!;
  assert.equal(notConfirmed.coverage.slots[0]?.state, "NOT_CONFIRMED");
});

test("coverage assignment refs carry employee identity already present on OA actuals", () => {
  const state = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "servery-a", departmentId: "dept-1" })],
      operationalTypesBySpaceId: new Map([
        ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
      ]),
      runModelsByDepartmentId: new Map([
        ["dept-1", runModel({ cycles: breakfastCycles("servery-a") })],
      ]),
      coverageTemplatesByDepartmentId: new Map([
        [
          "dept-1",
          [
            template({
              ot: "SERVERY",
              cycle: "breakfast",
              items: [{ roleKey: "SERVER", roleLabel: "Server", requiredCount: 1 }],
            }),
          ],
        ],
      ]),
      assignmentsByDepartmentId: new Map([
        [
          "dept-1",
          [
            assignment({
              id: "oa-1",
              roleKey: "SERVER",
              employeeId: "emp-1",
              employeeDisplayName: "Jordan Lee",
            }),
          ],
        ],
      ]),
    }),
  )[0]!;

  assert.deepEqual(state.coverage.slots[0]?.assignmentRefs, [
    {
      assignmentId: "oa-1",
      employeeId: "emp-1",
      employeeDisplayName: "Jordan Lee",
    },
  ]);
});

test("evidence summary maps due / upcoming / completed / overdue / exception", () => {
  const summary = summarizeRuntimeEvidence([
    requirement({ requirementKey: "due", catalogName: "Due", productState: "DUE" }),
    requirement({
      requirementKey: "up",
      catalogName: "Upcoming",
      productState: "UPCOMING",
    }),
    requirement({
      requirementKey: "done",
      catalogName: "Done",
      productState: "COMPLETED",
    }),
    requirement({
      requirementKey: "late",
      catalogName: "Late",
      productState: "OVERDUE",
    }),
    requirement({
      requirementKey: "exc",
      catalogName: "Exception",
      productState: "COMPLETED_WITH_EXCEPTION",
      needsSupervisorReview: true,
    }),
  ]);
  assert.equal(summary.requiredToday, 5);
  assert.deepEqual(summary.dueNow, ["due"]);
  assert.deepEqual(summary.upcoming, ["up"]);
  assert.deepEqual(summary.completed.sort(), ["done", "exc"]);
  assert.deepEqual(summary.overdue, ["late"]);
  assert.deepEqual(summary.correctiveOpen, ["exc"]);
  assert.deepEqual(summary.needsReview, ["exc"]);
  assert.equal(summary.items.every((item) => item.catalogStableKey === "food_temperature_log"), true);
});

test("Harbor catalogStableKey survives RLS evidence summarization", () => {
  const summary = summarizeRuntimeEvidence([
    requirement({
      requirementKey: "cooler-due",
      catalogName: "Cooler Temperature",
      productState: "DUE",
      catalogStableKey: "cooler_temperature_log",
    }),
  ]);
  assert.equal(summary.items[0]?.catalogStableKey, "cooler_temperature_log");
  assert.notEqual(summary.items[0]?.catalogStableKey, null);
});

test("assets: factual status; only SERVICE_AT_RISK / EQUIPMENT_UNAVAILABLE become exceptions", () => {
  const issues: RuntimeAssetIssueFact[] = [
    {
      issueId: "i1",
      assetId: "a1",
      impact: "NO_IMMEDIATE_IMPACT",
      summary: "Scratch",
      href: null,
    },
    {
      issueId: "i2",
      assetId: "a2",
      impact: "SERVICE_AT_RISK",
      summary: "Hot well down",
      href: "/asset-issues/i2",
    },
    {
      issueId: "i3",
      assetId: "a3",
      impact: "EQUIPMENT_UNAVAILABLE",
      summary: "Steam table unavailable",
      href: "/asset-issues/i3",
    },
  ];
  const state = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "servery-a", departmentId: "dept-1" })],
      operationalTypesBySpaceId: new Map([
        ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
      ]),
      assetsBySpaceId: new Map([
        [
          "servery-a",
          [
            {
              assetId: "a1",
              name: "Well A",
              status: "OPERATIONAL",
              openIssueCount: 1,
              openWorkOrderCount: 2,
            },
            {
              assetId: "a2",
              name: "Well B",
              status: "DEGRADED",
              openIssueCount: 1,
              openWorkOrderCount: 0,
            },
            {
              assetId: "a3",
              name: "Steam",
              status: "OUT_OF_SERVICE",
              openIssueCount: 1,
              openWorkOrderCount: 1,
            },
          ],
        ],
      ]),
      issuesBySpaceId: new Map([["servery-a", issues]]),
    }),
  )[0]!;

  assert.equal(state.assets.openIssues.length, 3);
  assert.equal(state.assets.issuesAffectingOperation.length, 2);
  assert.deepEqual(
    state.exceptions.filter((row) => row.source === "asset_issue").map((row) => row.state).sort(),
    ["EQUIPMENT_UNAVAILABLE", "SERVICE_AT_RISK"],
  );
});

test("milestones: Key Time statuses stay canonical; Servery events are legacy", () => {
  const state = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "servery-a", departmentId: "dept-1" })],
      operationalTypesBySpaceId: new Map([
        ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
      ]),
      runModelsByDepartmentId: new Map([
        [
          "dept-1",
          runModel({
            cycles: breakfastCycles("servery-a"),
            timings: [
              timing({
                spaceId: "servery-a",
                cycleStableKey: "tray_line",
                configuredDueLocal: "07:00",
                actualDueLocal: "07:20",
                completedAt: at("07:21"),
              }),
              timing({
                spaceId: "servery-a",
                cycleId: "kt-upcoming",
                cycleStableKey: "second_round",
                cycleLabel: "Second Round",
                configuredDueLocal: "08:30",
              }),
            ],
          }),
        ],
      ]),
      serveryEventsByUnitId: new Map([
        [
          "unit-1",
          [
            {
              id: "ev-1",
              unitId: "unit-1",
              mealType: "BREAKFAST",
              mealServiceReadyAt: at("06:40"),
              mealServiceStartedAt: null,
              readyRecordedAt: at("06:41"),
              startedRecordedAt: null,
            },
          ],
        ],
      ]),
    }),
  )[0]!;

  const keyTimes = state.milestones.items.filter((item) => item.kind === "KEY_TIME");
  assert.ok(keyTimes.every((item) => item.canonical === true));
  assert.ok(keyTimes.some((item) => item.statusKey === "completed_late"));
  assert.ok(keyTimes.some((item) => item.statusKey === "upcoming"));
  const ready = state.milestones.items.find((item) => item.kind === "SERVERY_READY");
  const started = state.milestones.items.find((item) => item.kind === "MEAL_SERVICE_STARTED");
  assert.equal(ready?.canonical, false);
  assert.equal(started?.canonical, false);
  assert.equal(started?.statusKey, "not_recorded");
  assert.notEqual(ready?.timing.actual, started?.timing.actual);
});

test("next event is the earliest canonical instant >= now", () => {
  const state = composeRuntimeLocationStates(
    composeInput({
      spaces: [space({ spaceId: "servery-a", departmentId: "dept-1" })],
      operationalTypesBySpaceId: new Map([
        ["servery-a", { key: "SERVERY", name: "Servery", id: "ot-servery" }],
      ]),
      runModelsByDepartmentId: new Map([
        [
          "dept-1",
          runModel({
            cycles: [
              ...breakfastCycles("servery-a"),
              cycle({
                stableKey: "lunch",
                label: "Lunch",
                startLocal: "10:30",
                endLocal: "14:00",
                spaceIds: ["servery-a"],
                displaySequence: 20,
              }),
            ],
            timings: [
              timing({
                spaceId: "servery-a",
                cycleStableKey: "tray_line",
                configuredDueLocal: "07:45",
              }),
            ],
          }),
        ],
      ]),
    }),
  )[0]!;

  assert.ok(state.next);
  assert.ok(state.next!.at.getTime() >= state.asOf.now.getTime());
  const again = deriveRuntimeNextEvent(state);
  assert.equal(again?.sourceId, state.next?.sourceId);
});

test("exception sort rank prefers UNCOVERED over asset risk over overdue", () => {
  const uncovered: RuntimeLocationState["exceptions"] = [
    {
      source: "coverage",
      state: "UNCOVERED",
      location: {
        kind: "SPACE",
        spaceId: "a",
        unitId: null,
        departmentId: "d",
        facilityId: "f",
      },
      operationalContext: { cycleStableKey: null, operationalTypeKey: null },
      label: "x",
      href: null,
    },
  ];
  const asset = [
    {
      ...uncovered[0]!,
      source: "asset_issue" as const,
      state: "SERVICE_AT_RISK",
    },
  ];
  const overdue = [
    {
      ...uncovered[0]!,
      source: "evidence" as const,
      state: "OVERDUE",
    },
  ];
  assert.ok(exceptionSortRank(uncovered) < exceptionSortRank(asset));
  assert.ok(exceptionSortRank(asset) < exceptionSortRank(overdue));
  assert.ok(exceptionSortRank(overdue) < exceptionSortRank([]));
});

test("performance contract: compose is in-memory over N spaces with no per-space loader", () => {
  const cycles = [
    ...breakfastCycles("a"),
    cycle({
      stableKey: "breakfast-b",
      label: "Breakfast",
      startLocal: "06:00",
      endLocal: "10:00",
      spaceIds: ["b"],
    }),
    cycle({
      stableKey: "breakfast-c",
      label: "Breakfast",
      startLocal: "06:00",
      endLocal: "10:00",
      spaceIds: ["c"],
    }),
  ];
  const input = composeInput({
    spaces: [
      space({ spaceId: "a", departmentId: "dept-1" }),
      space({ spaceId: "b", departmentId: "dept-1" }),
      space({ spaceId: "c", departmentId: "dept-1" }),
    ],
    operationalTypesBySpaceId: new Map([
      ["a", { key: "SERVERY", name: "Servery", id: "1" }],
      ["b", { key: "SERVERY", name: "Servery", id: "1" }],
      ["c", { key: "SERVERY", name: "Servery", id: "1" }],
    ]),
    runModelsByDepartmentId: new Map([["dept-1", runModel({ cycles })]]),
  });
  const states = composeRuntimeLocationStates(input);
  assert.equal(states.length, 3);
  assert.equal(input.runModelsByDepartmentId.size, 1);
});

test("evidence OT applicability expands to matching spaces only; SPACE attachment stays direct", () => {
  const attachmentBase = {
    stableKey: "att_food",
    facilityId: "fac-1",
    departmentId: "dept-1",
    catalogStableKey: "food_temperature_log",
    catalogVersion: 1,
    status: "ACTIVE" as const,
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS" as const,
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [] as number[],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: "Food Temperature",
    localInstructions: null,
    assetId: null,
    unitId: null,
    targetDepartmentId: null,
    dailyWindows: [
      { label: "Breakfast", startLocal: "06:00", endLocal: "10:00", displaySequence: 10 },
    ],
    cycleSelections: [],
    catalogDefinition: {
      id: "cat-food",
      name: "Food Temperature",
      purposeType: "LOG" as const,
      instructions: null,
      status: "PUBLISHED" as const,
      fields: [],
    },
  };

  const resolved = resolveEvidenceRequirementsForSpaces({
    attachments: [
      {
        ...attachmentBase,
        id: "att-ot",
        targetKind: "OPERATIONAL_TYPE",
        spaceId: null,
        operationalTypeKey: "SERVERY",
      },
      {
        ...attachmentBase,
        id: "att-space",
        targetKind: "SPACE",
        spaceId: "retail-1",
        operationalTypeKey: null,
        localDisplayLabel: "Retail Close",
        catalogDefinition: { ...attachmentBase.catalogDefinition, name: "Retail Close" },
      },
    ],
    spaces: [
      {
        spaceId: "servery-a",
        departmentId: "dept-1",
        unitId: "unit-1",
        operationalTypeKey: "SERVERY",
        operationalTypeName: "Servery",
        facilityId: "fac-1",
      },
      {
        spaceId: "retail-1",
        departmentId: "dept-1",
        unitId: "unit-1",
        operationalTypeKey: "RETAIL",
        operationalTypeName: "Retail",
        facilityId: "fac-1",
      },
    ],
    operationalDateKey: DATE_KEY,
    now: at("07:30"),
    facilityTimezone: TZ,
    publishedCyclesByDepartmentId: new Map(),
    existingRecords: [],
  });

  const servery = resolved.get("servery-a") ?? [];
  const retail = resolved.get("retail-1") ?? [];
  assert.ok(servery.some((row) => row.attachmentId === "att-ot"));
  assert.equal(servery.some((row) => row.attachmentId === "att-space"), false);
  assert.ok(retail.some((row) => row.attachmentId === "att-space"));
  assert.equal(retail.some((row) => row.attachmentId === "att-ot"), false);
});
