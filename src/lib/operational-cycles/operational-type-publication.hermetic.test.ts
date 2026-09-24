import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  describeCycleApplicability,
  matchCycleApplicability,
} from "./cycle-applicability";
import { buildCyclesByStableKey } from "./effective-cycle-spaces";
import {
  assignmentsFromBindings,
  selectProfileIdForOperationalTypes,
} from "./load-operational-type-targets";
import type { OperationalCycleDefinition } from "./types";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function cycle(
  overrides: Partial<OperationalCycleDefinition> &
    Pick<OperationalCycleDefinition, "id" | "label" | "applicableOperationalTypeKeys">,
): OperationalCycleDefinition {
  return {
    stableKey: overrides.stableKey ?? overrides.id,
    parentStableKey: null,
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

const breakfast = cycle({
  id: "breakfast",
  label: "Breakfast",
  applicableOperationalTypeKeys: ["servery"],
});
const retailOpening = cycle({
  id: "retail-open",
  label: "Retail Opening",
  startLocal: "06:00",
  endLocal: "07:00",
  mealType: null,
  cycleType: "PREPARATION",
  applicableOperationalTypeKeys: ["retail"],
});
const published = [breakfast, retailOpening];
const byKey = buildCyclesByStableKey(published);

function labelsFor(otKey: string | null) {
  return published
    .filter((row) =>
      matchCycleApplicability({
        cycle: row,
        allCyclesByStableKey: byKey,
        context: {
          spaceId: "3a-servery",
          operationalTypeKey: otKey,
          operationalTypeName: otKey === "servery" ? "Servery" : otKey === "retail" ? "Retail" : null,
        },
      }),
    )
    .map((row) => row.label);
}

test("runtime uses ACTIVE only; working prefers DRAFT", () => {
  const profiles = [
    { id: "draft", status: "DRAFT" as const },
    { id: "active", status: "ACTIVE" as const },
    { id: "certified", status: "CERTIFIED" as const },
  ];
  assert.equal(selectProfileIdForOperationalTypes(profiles, "working"), "draft");
  assert.equal(selectProfileIdForOperationalTypes(profiles, "runtime"), "active");
  assert.equal(
    selectProfileIdForOperationalTypes(
      profiles.filter((row) => row.status !== "ACTIVE"),
      "runtime",
    ),
    null,
  );
  assert.equal(
    selectProfileIdForOperationalTypes([{ id: "certified", status: "CERTIFIED" }], "runtime"),
    null,
  );
});

test("draft OT change is visible to Build preview and isolated from Run", () => {
  const activeBindings = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "servery", name: "Servery", isActive: true },
    },
  ]);
  const draftBindings = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "retail", name: "Retail", isActive: true },
    },
  ]);

  const buildKey = draftBindings.get("3a-servery")?.key ?? null;
  const runKey = activeBindings.get("3a-servery")?.key ?? null;

  assert.equal(buildKey, "retail");
  assert.equal(runKey, "servery");
  assert.deepEqual(labelsFor(buildKey), ["Retail Opening"]);
  assert.deepEqual(labelsFor(runKey), ["Breakfast"]);
  assert.equal(breakfast.spaceIds.length, 0);
  assert.equal(retailOpening.spaceIds.length, 0);
});

test("after activation Run follows the newly active assignment", () => {
  const afterActivation = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "retail", name: "Retail", isActive: true },
    },
  ]);
  assert.deepEqual(labelsFor(afterActivation.get("3a-servery")?.key ?? null), ["Retail Opening"]);
  assert.equal(labelsFor(afterActivation.get("3a-servery")?.key ?? null).includes("Breakfast"), false);
});

test("display-name rename does not break published cycle keys", () => {
  const renamed = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "servery", name: "Resident Servery", isActive: true },
    },
  ]);
  const assignment = renamed.get("3a-servery");
  assert.equal(assignment?.key, "servery");
  assert.equal(assignment?.name, "Resident Servery");
  const match = matchCycleApplicability({
    cycle: breakfast,
    allCyclesByStableKey: byKey,
    context: {
      spaceId: "3a-servery",
      operationalTypeKey: assignment.key,
      operationalTypeName: assignment.name,
    },
  });
  assert.equal(
    describeCycleApplicability(match!),
    "Inherited from Operational Type: Resident Servery",
  );
});

test("draft fork keeps runtime on the ACTIVE assignment", () => {
  const forkedDraft = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "servery", name: "Servery", isActive: true },
    },
  ]);
  const active = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "servery", name: "Servery", isActive: true },
    },
  ]);
  assert.equal(forkedDraft.get("3a-servery")?.key, "servery");
  assert.equal(active.get("3a-servery")?.key, "servery");
  assert.deepEqual(labelsFor(active.get("3a-servery")?.key ?? null), ["Breakfast"]);
});

test("unpublished draft-only type does not become runtime-effective", () => {
  const active = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "servery", name: "Servery", isActive: true },
    },
  ]);
  const draft = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "temporary_service", name: "Temporary Service", isActive: true },
    },
  ]);
  assert.equal(draft.get("3a-servery")?.key, "temporary_service");
  assert.equal(active.get("3a-servery")?.key, "servery");
  assert.deepEqual(labelsFor(active.get("3a-servery")?.key ?? null), ["Breakfast"]);
  assert.deepEqual(labelsFor(draft.get("3a-servery")?.key ?? null), []);
});

test("retired Operational Type fails safely with no physical or UnitType fallback", () => {
  const retired = assignmentsFromBindings([
    {
      unitSpaceId: "3a-servery",
      archetype: { key: "servery", name: "Servery", isActive: false },
    },
  ]);
  assert.equal(retired.get("3a-servery"), undefined);
  assert.deepEqual(labelsFor(null), []);
  const match = matchCycleApplicability({
    cycle: breakfast,
    allCyclesByStableKey: byKey,
    context: {
      spaceId: "3a-servery",
      operationalTypeKey: null,
      physicalRoomTypeKey: "servery",
      unitType: "SERVERY",
    },
  });
  assert.equal(match, null);
});

test("runtime loaders must request runtime perspective; Build uses working", () => {
  const runtimeFiles = [
    "src/lib/operational-cycles/load-run-operation-presentation.ts",
    "src/lib/operational-cycles/load-employee-cycle-context.ts",
    "src/lib/operational-cycles/load-supervisor-cycle-overview.ts",
    "src/lib/runtime-location-state/prefetch.ts",
    "src/lib/offline/build-runtime-bundle.ts",
  ];
  for (const file of runtimeFiles) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.match(source, /perspective:\s*"runtime"/, file);
    assert.doesNotMatch(source, /perspective:\s*"working"/, file);
  }
  const builder = readFileSync(
    join(process.cwd(), "src/lib/operational-cycles/load-cycle-builder.ts"),
    "utf8",
  );
  assert.match(builder, /perspective:\s*"working"/);
});

test("archetype key is copied on draft fork and is not writable on rename", () => {
  const service = readFileSync(
    join(process.cwd(), "src/lib/department-administration/profile-service.ts"),
    "utf8",
  );
  assert.match(service, /key: archetype\.key/);
  const updateStart = service.indexOf("export async function updateRoomArchetype");
  const updateEnd = service.indexOf("export async function setArchetypeExperiences");
  const update = service.slice(Math.max(0, updateStart - 160), updateEnd);
  assert.match(update, /`key` is immutable identity/);
  assert.doesNotMatch(update, /data\.key/);
  assert.doesNotMatch(update, /key:\s*input/);
});
