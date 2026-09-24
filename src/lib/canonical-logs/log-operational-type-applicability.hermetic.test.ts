import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildLogRequirementKey } from "@/lib/logs-architecture/requirement-key";
import { assignmentsFromBindings } from "@/lib/operational-cycles/load-operational-type-targets";
import { resolveLogRequirementsForAttachment } from "./resolve-log-requirements";
import {
  bindOperationalTypeRequirementToSpace,
  dedupeLocationLogMatches,
  dedupeLocationLogRequirements,
  describeLogApplicability,
  expandOperationalTypeSpaces,
  matchLogAttachmentToLocation,
  operationalTypeAssignId,
  parseOperationalTypeAssignId,
  type LocationLogAttachmentRow,
  type LocationLogMatchContext,
} from "./log-operational-type-applicability";

const dietary = "dietary";
const evs = "evs";

function ctx(
  overrides: Partial<LocationLogMatchContext> & Pick<LocationLogMatchContext, "spaceId" | "operationalTypeKey">,
): LocationLogMatchContext {
  return {
    facilityId: "fac-1",
    departmentId: dietary,
    unitId: "unit-3a",
    operationalTypeName:
      overrides.operationalTypeKey === "servery"
        ? "Servery"
        : overrides.operationalTypeKey === "retail"
          ? "Retail"
          : overrides.operationalTypeKey === "main_kitchen"
            ? "Main Kitchen"
            : null,
    ...overrides,
  };
}

function att(
  overrides: Partial<LocationLogAttachmentRow> &
    Pick<LocationLogAttachmentRow, "id" | "catalogStableKey" | "targetKind">,
): LocationLogAttachmentRow {
  return {
    departmentId: dietary,
    catalogVersion: 1,
    label: overrides.label ?? overrides.catalogStableKey,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    assetId: null,
    status: "ACTIVE",
    ...overrides,
  };
}

const cooler = att({
  id: "att-cooler",
  catalogStableKey: "cooler_temperature",
  label: "Cooler Temperature",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "servery",
});
const dishwasher = att({
  id: "att-dishwasher",
  catalogStableKey: "dishwasher_check",
  label: "Dishwasher Check",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "servery",
});
const foodTemp = att({
  id: "att-food",
  catalogStableKey: "food_temperature",
  label: "Food Temperature",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "servery",
});
const sanitizer = att({
  id: "att-sanitizer",
  catalogStableKey: "sanitizer",
  label: "Sanitizer",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "servery",
});
const retailCooler = att({
  id: "att-retail-cooler",
  catalogStableKey: "retail_cooler_temperature",
  label: "Retail Cooler Temperature",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "retail",
});
const opening = att({
  id: "att-opening",
  catalogStableKey: "retail_opening_checklist",
  label: "Opening Checklist",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "retail",
});
const closing = att({
  id: "att-closing",
  catalogStableKey: "retail_closing_checklist",
  label: "Closing Checklist",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "retail",
});
const productionCooler = att({
  id: "att-prod-cooler",
  catalogStableKey: "production_cooler_temperature",
  label: "Production Cooler Temperature",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "main_kitchen",
});
const kitchenFood = att({
  id: "att-kitchen-food",
  catalogStableKey: "kitchen_food_temperature",
  label: "Food Temperature",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "main_kitchen",
});
const closeout = att({
  id: "att-closeout",
  catalogStableKey: "kitchen_closeout",
  label: "Cleaning / Closeout",
  targetKind: "OPERATIONAL_TYPE",
  operationalTypeKey: "main_kitchen",
});

const catalog = [
  cooler,
  dishwasher,
  foodTemp,
  sanitizer,
  retailCooler,
  opening,
  closing,
  productionCooler,
  kitchenFood,
  closeout,
];

function labelsFor(context: LocationLogMatchContext) {
  return catalog
    .map((row) => matchLogAttachmentToLocation(row, context))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => row.attachment.label)
    .sort();
}

test("one log applies to one Operational Type", () => {
  const match = matchLogAttachmentToLocation(cooler, ctx({ spaceId: "3a", operationalTypeKey: "servery" }));
  assert.equal(match?.source, "OPERATIONAL_TYPE_DEFAULT");
  assert.equal(
    match?.detail,
    "Inherited from Operational Type: Servery",
  );
  assert.equal(
    matchLogAttachmentToLocation(cooler, ctx({ spaceId: "retail-1", operationalTypeKey: "retail" })),
    null,
  );
});

test("one log can target multiple Operational Types via separate attachments", () => {
  const serveryAndRetail = [
    cooler,
    att({
      id: "att-cooler-retail",
      catalogStableKey: "cooler_temperature",
      label: "Cooler Temperature",
      targetKind: "OPERATIONAL_TYPE",
      operationalTypeKey: "retail",
    }),
  ];
  assert.equal(
    matchLogAttachmentToLocation(serveryAndRetail[0]!, ctx({ spaceId: "3a", operationalTypeKey: "servery" }))
      ?.attachment.catalogStableKey,
    "cooler_temperature",
  );
  assert.equal(
    matchLogAttachmentToLocation(serveryAndRetail[1]!, ctx({ spaceId: "r1", operationalTypeKey: "retail" }))
      ?.attachment.catalogStableKey,
    "cooler_temperature",
  );
});

test("multiple logs apply to one Operational Type", () => {
  assert.deepEqual(labelsFor(ctx({ spaceId: "3a", operationalTypeKey: "servery" })), [
    "Cooler Temperature",
    "Dishwasher Check",
    "Food Temperature",
    "Sanitizer",
  ]);
});

test("Servery, Retail, and Main Kitchen stay isolated; untyped rooms get no OT logs", () => {
  assert.deepEqual(labelsFor(ctx({ spaceId: "retail-1", operationalTypeKey: "retail" })), [
    "Closing Checklist",
    "Opening Checklist",
    "Retail Cooler Temperature",
  ]);
  assert.deepEqual(labelsFor(ctx({ spaceId: "mk", operationalTypeKey: "main_kitchen" })), [
    "Cleaning / Closeout",
    "Food Temperature",
    "Production Cooler Temperature",
  ]);
  assert.deepEqual(labelsFor(ctx({ spaceId: "office", operationalTypeKey: null })), []);
});

test("OT applicability is department-scoped", () => {
  assert.equal(
    matchLogAttachmentToLocation(
      cooler,
      ctx({ spaceId: "evs-servery", departmentId: evs, operationalTypeKey: "servery" }),
    ),
    null,
  );
});

test("direct location and department attachments still match alongside OT", () => {
  const direct = att({
    id: "att-special",
    catalogStableKey: "special_cleaning",
    label: "Special Infection Control Check",
    targetKind: "SPACE",
    spaceId: "3a",
  });
  const departmentWide = att({
    id: "att-dept",
    catalogStableKey: "dept_walk",
    label: "Department Walk",
    targetKind: "DEPARTMENT",
    targetDepartmentId: dietary,
  });
  const context = ctx({ spaceId: "3a", operationalTypeKey: "servery" });
  assert.equal(matchLogAttachmentToLocation(direct, context)?.source, "EXPLICIT_LOCATION");
  assert.equal(matchLogAttachmentToLocation(departmentWide, context)?.source, "DEPARTMENT_WIDE");
  assert.equal(matchLogAttachmentToLocation(cooler, context)?.source, "OPERATIONAL_TYPE_DEFAULT");
});

test("duplicate OT + direct applicability collapses to one inspector row", () => {
  const context = ctx({ spaceId: "3a", operationalTypeKey: "servery" });
  const direct = att({
    id: "att-cooler-direct",
    catalogStableKey: "cooler_temperature",
    label: "Cooler Temperature",
    targetKind: "SPACE",
    spaceId: "3a",
  });
  const deduped = dedupeLocationLogMatches([
    matchLogAttachmentToLocation(cooler, context)!,
    matchLogAttachmentToLocation(direct, context)!,
  ]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.source, "EXPLICIT_LOCATION");
  assert.match(deduped[0]!.detail, /Applied directly to this location/);
  assert.match(deduped[0]!.detail, /inherited from Operational Type/i);
});

test("asset requirements stay distinct from Operational Type location requirements", () => {
  const asset = att({
    id: "att-fridge",
    catalogStableKey: "fridge_3_temp",
    label: "Refrigerator #3 Temperature",
    targetKind: "ASSET",
    assetId: "fridge-3",
    assetName: "Refrigerator #3",
  });
  assert.equal(
    matchLogAttachmentToLocation(asset, ctx({ spaceId: "3a", operationalTypeKey: "servery" })),
    null,
  );
  assert.equal(
    describeLogApplicability({ source: "ASSET", assetName: "Refrigerator #3" }),
    "Asset requirement: Refrigerator #3",
  );
});

test("draft OT assignment does not change Run matching", () => {
  const runtime = ctx({ spaceId: "3a", operationalTypeKey: "servery", operationalTypeName: "Servery" });
  const working = ctx({ spaceId: "3a", operationalTypeKey: "retail", operationalTypeName: "Retail" });
  assert.deepEqual(labelsFor(working), [
    "Closing Checklist",
    "Opening Checklist",
    "Retail Cooler Temperature",
  ]);
  assert.deepEqual(labelsFor(runtime), [
    "Cooler Temperature",
    "Dishwasher Check",
    "Food Temperature",
    "Sanitizer",
  ]);
});

test("after activation Run follows the newly active Operational Type", () => {
  const after = ctx({ spaceId: "3a", operationalTypeKey: "retail", operationalTypeName: "Retail" });
  assert.ok(labelsFor(after).includes("Opening Checklist"));
  assert.equal(labelsFor(after).includes("Cooler Temperature"), false);
});

test("display-name rename does not break attachment identity", () => {
  const renamed = ctx({
    spaceId: "3a",
    operationalTypeKey: "servery",
    operationalTypeName: "Resident Servery",
  });
  const match = matchLogAttachmentToLocation(cooler, renamed);
  assert.equal(match?.detail, "Inherited from Operational Type: Resident Servery");
});

test("retired Operational Type fails safely with no physical or UnitType fallback", () => {
  const retired = assignmentsFromBindings([
    { unitSpaceId: "3a", archetype: { key: "servery", name: "Servery", isActive: false } },
  ]);
  assert.equal(retired.get("3a"), undefined);
  const context = ctx({ spaceId: "3a", operationalTypeKey: null });
  assert.equal(matchLogAttachmentToLocation(cooler, context), null);
  assert.equal(labelsFor(context).length, 0);
});

test("unpublished draft-only type does not become runtime-effective", () => {
  const runtime = assignmentsFromBindings([
    { unitSpaceId: "3a", archetype: { key: "servery", name: "Servery", isActive: true } },
  ]);
  const draft = assignmentsFromBindings([
    {
      unitSpaceId: "3a",
      archetype: { key: "temporary_service", name: "Temporary Service", isActive: true },
    },
  ]);
  assert.equal(runtime.get("3a")?.key, "servery");
  assert.equal(draft.get("3a")?.key, "temporary_service");
  const temp = att({
    id: "att-temp",
    catalogStableKey: "temp_service_log",
    label: "Temporary Service Log",
    targetKind: "OPERATIONAL_TYPE",
    operationalTypeKey: "temporary_service",
  });
  assert.equal(
    matchLogAttachmentToLocation(temp, ctx({ spaceId: "3a", operationalTypeKey: runtime.get("3a")!.key })),
    null,
  );
});

test("no attachment rows are copied onto the room", () => {
  assert.equal(cooler.spaceId, null);
  assert.equal(opening.spaceId, null);
});

test("cycle-aware Food Temperature is WHERE=Servery and WHEN=selected cycles", () => {
  const attachment = {
    id: "att-food-cycle",
    stableKey: "att_food_cycle",
    facilityId: "fac-1",
    departmentId: dietary,
    catalogStableKey: "food_temperature",
    catalogVersion: 1,
    status: "ACTIVE" as const,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "OPERATIONAL_CYCLE" as const,
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [] as number[],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: "Food Temperature",
    localInstructions: null,
    targetKind: "OPERATIONAL_TYPE" as const,
    assetId: null,
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: "servery",
    resolvedSpaceId: "3a",
    dailyWindows: [],
    cycleSelections: [
      { cycleStableKey: "breakfast", displaySequence: 10 },
      { cycleStableKey: "lunch", displaySequence: 20 },
      { cycleStableKey: "dinner", displaySequence: 30 },
    ],
    catalogDefinition: {
      id: "cat-food",
      name: "Food Temperature",
      purposeType: "LOG" as const,
      instructions: null,
      status: "PUBLISHED" as const,
      fields: [],
    },
  };
  const publishedCycles = [
    {
      stableKey: "breakfast",
      label: "Breakfast",
      startLocal: "07:00",
      endLocal: "10:00",
      overnight: false,
      startsAt: new Date("2026-09-21T07:00:00.000Z"),
      endsAt: new Date("2026-09-21T10:00:00.000Z"),
    },
    {
      stableKey: "lunch",
      label: "Lunch",
      startLocal: "11:00",
      endLocal: "13:00",
      overnight: false,
      startsAt: new Date("2026-09-21T11:00:00.000Z"),
      endsAt: new Date("2026-09-21T13:00:00.000Z"),
    },
    {
      stableKey: "dinner",
      label: "Dinner",
      startLocal: "16:00",
      endLocal: "19:00",
      overnight: false,
      startsAt: new Date("2026-09-21T16:00:00.000Z"),
      endsAt: new Date("2026-09-21T19:00:00.000Z"),
    },
  ];
  const resolved = resolveLogRequirementsForAttachment({
    attachment,
    operationalDateKey: "2026-09-21",
    now: new Date("2026-09-21T08:30:00.000Z"),
    publishedCycles,
    existingRecords: [],
  });
  assert.deepEqual(
    resolved.map((row) => row.cycleLabel),
    ["Breakfast", "Lunch", "Dinner"],
  );
  assert.equal(resolved[0]!.target.kind, "OPERATIONAL_TYPE");
  assert.equal(matchLogAttachmentToLocation(foodTemp, ctx({ spaceId: "3a", operationalTypeKey: "servery" }))?.source, "OPERATIONAL_TYPE_DEFAULT");
  assert.equal(matchLogAttachmentToLocation(foodTemp, ctx({ spaceId: "r1", operationalTypeKey: "retail" })), null);
});

test("dedupe keeps one required submission when OT and SPACE both match", () => {
  const otReq = {
    requirementKey: "ot-key",
    attachmentId: "att-ot",
    attachmentStableKey: "att_ot",
    catalogStableKey: "cooler_temperature",
    catalogVersion: 1,
    catalogName: "Cooler Temperature",
    purposeType: "LOG" as const,
    facilityId: "fac-1",
    departmentId: dietary,
    operationalDateKey: "2026-09-21",
    timingSource: "DAILY_WINDOWS" as const,
    scheduleKind: "FIXED_DAILY_WINDOW" as const,
    cycleStableKey: null,
    cycleLabel: null,
    windowStartLocal: "05:00",
    windowEndLocal: "11:00",
    windowStartsAt: null,
    windowEndsAt: null,
    target: { kind: "OPERATIONAL_TYPE" as const, operationalTypeKey: "servery", resolvedSpaceId: "3a" },
    productState: "DUE" as const,
    productStateLabel: "Due",
    needsSupervisorReview: false,
    recordId: null,
    recordStatus: null,
    fields: [],
    instructions: null,
  };
  const spaceReq = {
    ...otReq,
    requirementKey: "space-key",
    attachmentId: "att-space",
    attachmentStableKey: "att_space",
    target: { kind: "SPACE" as const, spaceId: "3a" },
    recordId: "rec-1",
    productState: "COMPLETED" as const,
    productStateLabel: "Completed",
  };
  const deduped = dedupeLocationLogRequirements([otReq, spaceReq]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.attachmentId, "att-space");
  assert.equal(deduped[0]!.recordId, "rec-1");
});

test("expanding an OT attachment does not copy it onto the room", () => {
  const assignments = new Map([
    ["3a", { key: "servery" }],
    ["3b", { key: "servery" }],
    ["r1", { key: "retail" }],
  ]);
  assert.deepEqual(expandOperationalTypeSpaces(assignments, "servery").sort(), ["3a", "3b"]);
  const bound = bindOperationalTypeRequirementToSpace(
    {
      requirementKey: "base",
      attachmentId: cooler.id,
      attachmentStableKey: "att_cooler",
      catalogStableKey: cooler.catalogStableKey,
      catalogVersion: 1,
      catalogName: cooler.label,
      purposeType: "LOG",
      facilityId: "fac-1",
      departmentId: dietary,
      operationalDateKey: "2026-09-21",
      timingSource: "DAILY_WINDOWS",
      scheduleKind: "FIXED_DAILY_WINDOW",
      cycleStableKey: null,
      cycleLabel: null,
      windowStartLocal: "05:00",
      windowEndLocal: "11:00",
      windowStartsAt: null,
      windowEndsAt: null,
      target: { kind: "OPERATIONAL_TYPE", operationalTypeKey: "servery" },
      productState: "DUE",
      productStateLabel: "Due",
      needsSupervisorReview: false,
      recordId: null,
      recordStatus: null,
      fields: [],
      instructions: null,
    },
    "3a",
  );
  assert.equal(bound.target.kind, "OPERATIONAL_TYPE");
  if (bound.target.kind === "OPERATIONAL_TYPE") {
    assert.equal(bound.target.resolvedSpaceId, "3a");
  }
  assert.notEqual(bound.requirementKey, "base");
  assert.match(
    buildLogRequirementKey({
      attachmentStableKey: "att_cooler",
      catalogStableKey: "cooler_temperature",
      scheduleKind: "FIXED_DAILY_WINDOW",
      windowStartLocal: "05:00",
      windowEndLocal: "11:00",
      target: { kind: "OPERATIONAL_TYPE", operationalTypeKey: "servery", resolvedSpaceId: "3a" },
      operationalDateKey: "2026-09-21",
    }),
    /ot:servery/,
  );
});

test("assign keys stay department-scoped", () => {
  assert.equal(operationalTypeAssignId("dept-1", "servery"), "dept-1:servery");
  assert.deepEqual(parseOperationalTypeAssignId("dept-1:servery"), {
    departmentId: "dept-1",
    operationalTypeKey: "servery",
  });
});

test("runtime loaders request runtime OT; Log Builder uses working types", () => {
  const run = readFileSync(join(process.cwd(), "src/lib/canonical-logs/load-target-run-logs.ts"), "utf8");
  const book = readFileSync(join(process.cwd(), "src/lib/canonical-logs/load-run-requirements.ts"), "utf8");
  const assign = readFileSync(join(process.cwd(), "src/lib/canonical-logs/catalog-assign.ts"), "utf8");
  const actions = readFileSync(join(process.cwd(), "src/app/(protected)/build/logs/actions.ts"), "utf8");
  assert.match(run, /perspective:\s*"runtime"/);
  assert.match(book, /perspective:\s*"runtime"/);
  assert.match(assign, /perspective:\s*"working"/);
  assert.match(assign, /OPERATIONAL_TYPE/);
  assert.match(assign, /Operational Types/);
  assert.match(actions, /QUICK_PIN/);
  assert.match(actions, /Manager password access is required to assign Logs/);
  assert.doesNotMatch(run, /model LocationProgram/);
  assert.doesNotMatch(book, /LogAssignment/);
});

test("existing requirement keys for non-OT targets stay unchanged", () => {
  const key = buildLogRequirementKey({
    attachmentStableKey: "att_space",
    catalogStableKey: "cooler_temperature",
    scheduleKind: "FIXED_DAILY_WINDOW",
    windowStartLocal: "05:00",
    windowEndLocal: "11:00",
    target: { kind: "SPACE", spaceId: "3a" },
    operationalDateKey: "2026-09-21",
  });
  assert.doesNotMatch(key, /\|ot:/);
});
