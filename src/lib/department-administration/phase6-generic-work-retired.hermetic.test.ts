/**
 * Phase 6 — generic Work and the Department profile are not forward product behavior.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DEPARTMENT_ADMIN_TABS, DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT } from "@/lib/department-administration/admin-nav";
import { composeLocationProgram } from "@/lib/department-administration/location-program";

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

test("retired Work and Location Function surfaces are not executable modules", () => {
  for (const path of [
    "src/lib/department-work",
    "src/lib/work/expected",
    "src/lib/todays-work/expected-work",
    "src/components/department-work",
    "src/components/todays-work/todays-work-expected-work.tsx",
    "src/app/(protected)/staffing/work-plans",
    "src/app/partner/work",
    "src/app/console/(staff)/catalog/work",
  ]) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
  const operations = readFileSync(join(root, "src/lib/department-operations.ts"), "utf8");
  assert.equal(operations.includes("isDepartmentWorkPlansEnabled"), false);
  assert.equal(operations.includes("workPlans"), false);
  const redirects = Object.keys(DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT);
  for (const retired of ["work", "room-types", "areas", "archetypes"]) {
    assert.equal(redirects.includes(retired), false, retired);
  }
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

test("profile services are gone", () => {
  assert.equal(existsSync(join(root, "src/lib/department-administration/profile-service.ts")), false);
  assert.equal(existsSync(join(root, "src/lib/department-administration/resolve-room-profile.ts")), false);
  assert.equal(existsSync(join(root, "src/lib/operational-cycles/load-operational-type-targets.ts")), false);
});
