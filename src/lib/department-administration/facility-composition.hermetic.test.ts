/**
 * Phase 5B — a responsible room is composed from canonical owners.
 * No Department profile, archetype, or Experience is required.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { composeLocationProgram } from "@/lib/department-administration/location-program";
import { cycleOccursAtMenuLocation } from "@/lib/menu-runtime";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";

const servery = {
  spaceId: "space-1a-servery",
  name: "1A Servery",
  neighborhoodName: "Naval Park",
  floorName: "1",
  facilityTypeLabel: "Servery",
  facilityRoomTypeId: "type-servery",
  responsible: true,
};

function program(department: { id: string; name: string }) {
  return composeLocationProgram({
    departmentId: department.id,
    departmentName: department.name,
    location: servery,
    teams: [],
    teamCycles: [],
    cyclePlacements: [
      {
        cycleStableKey: "breakfast",
        label: "Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
        spaceIds: [servery.spaceId],
      },
    ],
    coverageNeeds: [
      { id: "server", roleLabel: "SERVER", requiredCount: 2, cycleLabel: "Breakfast" },
    ],
    spaceLogs: [{ id: "temp", label: "Temperature Log" }],
    assetLogs: [],
    typeDefaults: [],
    suppressions: [],
    assets: [{ id: "hot-box", name: "Hot box", code: null }],
    menus: [{ id: "resident", name: "Resident Menu" }],
  });
}

test("a responsible room appears with no profile, archetype, or Experience", () => {
  const dietary = program({ id: "dietary", name: "Food & Nutrition" });
  assert.equal(dietary.location.responsible, true);
  assert.equal(dietary.location.name, "1A Servery");
  assert.equal(dietary.location.facilityTypeLabel, "Servery");
  assert.equal(dietary.cycles[0]?.label, "Breakfast");
  assert.deepEqual(dietary.coverage, [
    { id: "server", roleLabel: "SERVER", requiredCount: 2, cycleLabel: "Breakfast" },
  ]);
  assert.equal(dietary.logs[0]?.label, "Temperature Log");
  assert.equal(dietary.assets[0]?.name, "Hot box");
  assert.equal(dietary.menus[0]?.name, "Resident Menu");
  assert.equal("experiences" in dietary, false);
});

test("the same room is visible to each responsible Department", () => {
  const dietary = program({ id: "dietary", name: "Food & Nutrition" });
  const evs = program({ id: "evs", name: "Environmental Services" });
  assert.equal(dietary.location.spaceId, evs.location.spaceId);
  assert.equal(dietary.department.name, "Food & Nutrition");
  assert.equal(evs.department.name, "Environmental Services");
});

test("a room with no Experience rows is not incomplete", () => {
  const bare = composeLocationProgram({
    departmentId: "dietary",
    departmentName: "Food & Nutrition",
    location: servery,
    teams: [],
    teamCycles: [],
    cyclePlacements: [],
    spaceLogs: [],
    assetLogs: [],
    typeDefaults: [],
    suppressions: [],
    assets: [],
  });
  assert.equal(bare.location.responsible, true);
  assert.deepEqual(bare.menus, []);
  assert.deepEqual(bare.cycles, []);
});

test("menu cycle matching does not load an operational type", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/menu-runtime-db.ts"), "utf8");
  assert.equal(source.includes("loadSpaceOperationalTypeAssignments"), false);
  assert.equal(source.includes("loadOperationalTypeKey"), false);
  const root = {
    stableKey: "breakfast",
    nodeKind: "PERIOD",
    parentStableKey: null,
    label: "Breakfast",
    startLocal: "07:00",
    endLocal: "09:00",
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    locationMode: "ALL_DEPARTMENT_UNITS",
    spaceIds: [],
    unitIds: [],
    status: "PUBLISHED",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
  } as unknown as OperationalCycleDefinition;
  assert.equal(
    cycleOccursAtMenuLocation({
      root,
      published: [root],
      location: { unitId: null, spaceId: servery.spaceId },
      serviceDateKey: "2026-11-02",
    }),
    true,
  );
});

test("Department Builder Facility does not author a Location Function", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/locations-panel.tsx"),
    "utf8",
  );
  const summary = readFileSync(
    join(process.cwd(), "src/lib/department-administration/builder-context-summary.ts"),
    "utf8",
  );
  const review = readFileSync(
    join(process.cwd(), "src/lib/operational-review/compose-operational-review-day.ts"),
    "utf8",
  );
  assert.doesNotMatch(panel, /Location Function|bindLocationFunctionAction|publishLocationFunctionsAction/);
  assert.equal(summary.includes("loadSpaceOperationalTypeAssignments"), false);
  assert.equal(review.includes("selectHistoricalProfileForServiceDate"), false);
});
