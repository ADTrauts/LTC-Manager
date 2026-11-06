import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { hasUnmatchedPublishedOperationalTypes, presentOverviewGuidance } from "@/lib/department-administration/overview-guidance";
import { resolveLocationFunctionAdoption } from "@/lib/department-products/location-functions";
import {
  assignmentsFromBindings,
  selectProfileIdForOperationalTypes,
} from "@/lib/operational-cycles/load-operational-type-targets";
import { cycleAppliesToSpace } from "@/lib/operational-cycles/resolve-operational-cycle";
import { buildCyclesByStableKey } from "@/lib/operational-cycles/effective-cycle-spaces";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import {
  historicalOtAssignmentsFromBindings,
  selectHistoricalProfileForServiceDate,
} from "@/lib/operational-review/historical-operational-type";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("canonical setup binds a Product function and rejects an arbitrary key", () => {
  const adopted = resolveLocationFunctionAdoption({
    productKey: "DIETARY",
    functionKey: "food_service_area",
    displayName: "My Custom Servery",
  });
  assert.equal(adopted?.key, "food_service_area");
  assert.equal(adopted?.name, "Food Service Area");
  assert.equal(
    resolveLocationFunctionAdoption({
      productKey: "DIETARY",
      functionKey: "my_custom_servery",
      displayName: "My Custom Servery",
    }),
    null,
  );
  const service = source("src/lib/department-administration/profile-service.ts");
  const bindStart = service.indexOf("export async function bindLocationFunction");
  const bindEnd = service.indexOf("export async function clearLocationFunction");
  const bind = service.slice(bindStart, bindEnd);
  assert.match(bind, /resolveLocationFunctionAdoption/);
  assert.match(bind, /adoptProductLocationFunction/);
  assert.match(bind, /bindRoomToArchetype/);
  assert.doesNotMatch(bind, /uniqueOperationalTypeKey/);
  const actions = source("src/app/(protected)/admin/departments/[departmentId]/actions.ts");
  const retired = actions.slice(
    actions.indexOf("export async function assignLocationOperationalTypeAction"),
    actions.indexOf("export async function clearLocationOperationalTypeAction"),
  );
  assert.match(retired, /ROLE_BINDING_RETIRED/);
  assert.doesNotMatch(retired, /bindRoomToArchetype/);
});

test("a room keeps one current function and a later bind replaces it", () => {
  const first = assignmentsFromBindings([
    {
      unitSpaceId: "naval",
      archetype: { key: "resident_care", name: "Resident Care Area", isActive: true },
    },
  ]);
  const replaced = assignmentsFromBindings([
    {
      unitSpaceId: "naval",
      archetype: { key: "service_support", name: "Service / Support Area", isActive: true },
    },
  ]);
  assert.equal(first.get("naval")?.key, "resident_care");
  assert.equal(replaced.get("naval")?.key, "service_support");
  assert.equal(replaced.size, 1);
  const schema = source("prisma/schema.prisma");
  assert.match(schema, /@@unique\(\[profileId, unitSpaceId\]\)/);
  assert.match(source("src/lib/department-administration/profile-service.ts"), /profileId_unitSpaceId/);
});

test("clearing a room removes function-targeted applicability", () => {
  const cleared = assignmentsFromBindings([]);
  assert.equal(cleared.get("naval"), undefined);
  const cycle = {
    stableKey: "service",
    label: "Service",
    nodeKind: "PERIOD",
    parentStableKey: null,
    departmentId: "dietary",
    locationMode: "OPERATIONAL_TYPES",
    applicableOperationalTypeKeys: ["food_service_area"],
    applicableUnitTypes: [],
    spaceIds: [],
    unitIds: [],
    status: "PUBLISHED",
  } as unknown as OperationalCycleDefinition;
  const byKey = buildCyclesByStableKey([cycle]);
  assert.equal(
    cycleAppliesToSpace(cycle, "naval", byKey, { operationalTypeKey: "food_service_area" }),
    true,
  );
  assert.equal(cycleAppliesToSpace(cycle, "naval", byKey, { operationalTypeKey: null }), false);
});

test("Dietary and EVS bindings on one room stay independent", () => {
  const dietary = assignmentsFromBindings([
    {
      unitSpaceId: "naval",
      archetype: { key: "food_service_area", name: "Food Service Area", isActive: true },
    },
  ]);
  const evs = assignmentsFromBindings([
    {
      unitSpaceId: "naval",
      archetype: { key: "service_support", name: "Service / Support Area", isActive: true },
    },
  ]);
  assert.equal(dietary.get("naval")?.key, "food_service_area");
  assert.equal(evs.get("naval")?.key, "service_support");
});

test("Build reads the draft and Run reads only the published profile", () => {
  const profiles = [
    { id: "active", status: "ACTIVE" as const },
    { id: "draft", status: "DRAFT" as const },
  ];
  assert.equal(selectProfileIdForOperationalTypes(profiles, "working"), "draft");
  assert.equal(selectProfileIdForOperationalTypes(profiles, "runtime"), "active");
  const published = assignmentsFromBindings([
    {
      unitSpaceId: "naval",
      archetype: { key: "food_service_area", name: "Food Service Area", isActive: true },
    },
  ]);
  const working = assignmentsFromBindings([
    {
      unitSpaceId: "naval",
      archetype: { key: "food_service_area", name: "Food Service Area", isActive: false },
    },
  ]);
  assert.equal(published.get("naval")?.key, "food_service_area");
  assert.equal(working.get("naval"), undefined);
});

test("a past service date keeps the function from the profile effective then", () => {
  const timezone = "America/New_York";
  const september = {
    id: "v1",
    departmentId: "dietary",
    version: 1,
    status: "RETIRED" as const,
    activatedAt: new Date("2026-09-01T12:00:00.000Z"),
    retiredAt: new Date("2026-10-01T12:00:00.000Z"),
  };
  const october = {
    id: "v2",
    departmentId: "dietary",
    version: 2,
    status: "ACTIVE" as const,
    activatedAt: new Date("2026-10-01T12:00:00.000Z"),
    retiredAt: null,
  };
  const bindings = [
    {
      profileId: "v1",
      spaceId: "naval",
      operationalTypeKey: "food_service_area",
      operationalTypeName: "Food Service Area",
      archetypeIsActive: true,
    },
  ];
  const past = selectHistoricalProfileForServiceDate([september, october], {
    departmentId: "dietary",
    serviceDateKey: "2026-09-15",
    timezone,
  });
  assert.equal(past.status, "evaluated");
  if (past.status !== "evaluated") return;
  assert.equal(
    historicalOtAssignmentsFromBindings(bindings, past.profile.id).get("naval")?.key,
    "food_service_area",
  );
  const later = selectHistoricalProfileForServiceDate([september, october], {
    departmentId: "dietary",
    serviceDateKey: "2026-10-02",
    timezone,
  });
  assert.equal(later.status, "evaluated");
  if (later.status !== "evaluated") return;
  assert.equal(historicalOtAssignmentsFromBindings(bindings, later.profile.id).get("naval"), undefined);
});

test("the work gap clears when a published function matches a bound room", () => {
  const open = presentOverviewGuidance({
    departmentId: "dept",
    departmentKey: "DIETARY",
    departmentName: "Dietary",
    locationCount: 2,
    currentRootLabels: ["Breakfast"],
    draftRootCount: 0,
    scheduledCount: 0,
    scheduledEffectiveFrom: null,
    memberCount: 4,
    publishedWorkPlanCount: 1,
    draftWorkPlanCount: 0,
    placedLogCount: 1,
    publishedWorkOperationalTypeKeys: ["food_service_area"],
    classifiedOperationalTypeKeys: [],
  });
  assert.equal(hasUnmatchedPublishedOperationalTypes({
    publishedWorkOperationalTypeKeys: ["food_service_area"],
    classifiedOperationalTypeKeys: [],
  }), true);
  assert.match(open.find((row) => row.id === "work")?.description ?? "", /no bound room/);

  const closed = presentOverviewGuidance({
    departmentId: "dept",
    departmentKey: "DIETARY",
    departmentName: "Dietary",
    locationCount: 2,
    currentRootLabels: ["Breakfast"],
    draftRootCount: 0,
    scheduledCount: 0,
    scheduledEffectiveFrom: null,
    memberCount: 4,
    publishedWorkPlanCount: 1,
    draftWorkPlanCount: 0,
    placedLogCount: 1,
    publishedWorkOperationalTypeKeys: ["food_service_area"],
    classifiedOperationalTypeKeys: ["food_service_area"],
  });
  assert.equal(hasUnmatchedPublishedOperationalTypes({
    publishedWorkOperationalTypeKeys: ["food_service_area"],
    classifiedOperationalTypeKeys: ["food_service_area"],
  }), false);
  assert.doesNotMatch(closed.find((row) => row.id === "work")?.description ?? "", /no bound room/);
});

test("Locations saves a Product function through the canonical action", () => {
  const panel = source("src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx");
  assert.match(panel, /bindLocationFunctionAction/);
  assert.match(panel, /publishLocationFunctionsAction/);
  assert.match(panel, /Location Function/);
  assert.doesNotMatch(panel, /assignLocationOperationalTypeAction|Operational Type|Archetype/);
});
