/**
 * Phase 6 — generic Work and the Department profile are not forward product behavior.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DEPARTMENT_ADMIN_TABS } from "@/lib/department-administration/admin-nav";
import { composeLocationProgram } from "@/lib/department-administration/location-program";
import { isDepartmentWorkPlansEnabled } from "@/lib/department-operations";
import { EXPERIENCE_CATALOG } from "@/lib/experiences/experience-catalog";
import { resolveUnitWorkRequirements } from "@/lib/department-work";
import { emptyTodaysExpectedWork } from "@/lib/work/expected";

const root = process.cwd();

test("Department Builder has no Work tab", () => {
  assert.deepEqual(
    DEPARTMENT_ADMIN_TABS.map((tab) => tab.id),
    ["overview", "locations", "operating-rhythm", "maintenance", "people", "records", "menus"],
  );
  assert.equal(DEPARTMENT_ADMIN_TABS.some((tab) => tab.label === "Work"), false);
});

test("generic Work and profile tables are gone from the schema", () => {
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  for (const model of [
    "DepartmentWorkPlan",
    "DepartmentWorkItem",
    "DepartmentWorkPlanApplicability",
    "DepartmentWorkOccurrence",
    "DepartmentOperationalProfile",
    "DepartmentOperationalArea",
    "DepartmentAreaExperience",
    "DepartmentRoomArchetype",
    "DepartmentArchetypeExperience",
    "DepartmentRoomArchetypeBinding",
    "DepartmentRoomExperienceException",
    "DepartmentFacilityTypeLogDefault",
    "DepartmentLocationLogSuppression",
  ]) {
    assert.equal(schema.includes(`model ${model} `), false, model);
  }
  assert.equal(schema.includes("OPERATIONAL_TYPE"), false);
  assert.equal(schema.includes("spaceId"), true);
});

test("Work plans are not a Department capability", () => {
  assert.equal(isDepartmentWorkPlansEnabled("DIETARY"), false);
  assert.equal(isDepartmentWorkPlansEnabled("EVS"), false);
  assert.equal(isDepartmentWorkPlansEnabled("PLANT"), false);
  assert.equal(isDepartmentWorkPlansEnabled(null), false);
});

test("runtime Work and Expected Work do not load a plan", async () => {
  assert.deepEqual(await resolveUnitWorkRequirements({ facilityId: "f", departmentId: "d" }), []);
  const expected = emptyTodaysExpectedWork();
  assert.equal(expected.workCapabilityEnabled, false);
  assert.deepEqual(expected.currentGroups, []);
});

test("a responsible room composes without a profile", () => {
  const program = composeLocationProgram({
    departmentId: "dietary",
    departmentName: "Food and Nutrition",
    location: {
      spaceId: "space-1",
      name: "1A Servery",
      neighborhoodName: "Naval Park",
      floorName: "1",
      facilityTypeLabel: "Servery",
      facilityRoomTypeId: "type-servery",
      responsible: true,
    },
    teams: [],
    teamCycles: [],
    cyclePlacements: [],
    spaceLogs: [],
    assetLogs: [],
    typeDefaults: [],
    suppressions: [],
    assets: [],
    menus: [],
  });
  assert.equal(program.location.name, "1A Servery");
  assert.equal("profile" in program, false);
  assert.equal("experiences" in program, false);
});

test("Experience catalog and profile services are gone", () => {
  assert.deepEqual(EXPERIENCE_CATALOG, []);
  assert.equal(existsSync(join(root, "src/lib/department-administration/profile-service.ts")), false);
  assert.equal(existsSync(join(root, "src/lib/department-administration/resolve-room-profile.ts")), false);
  assert.equal(existsSync(join(root, "src/lib/operational-cycles/load-operational-type-targets.ts")), false);
});
