/**
 * Phase 6 — generic Work and the Department profile are not forward product IA.
 * Schema/module restore debt may still exist after 20261106214500; Builder must not
 * expose Work as a primary tab or compose Location Program from a profile.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("generic Work is not a Department Builder primary tab after restore debt", () => {
  const adminNav = readFileSync(join(root, "src/lib/department-administration/admin-nav.ts"), "utf8");
  assert.doesNotMatch(adminNav, /id:\s*"work"/);
  assert.match(adminNav, /DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT/);
  assert.equal("work" in DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT, false);
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
