import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { RoleKey } from "@prisma/client";

import { hasAtLeastRole } from "@/lib/access";
import { canPurchaseDepartmentProducts } from "@/lib/department-products/facility-catalog";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";

import {
  INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE,
  INITIAL_FACILITY_CREATOR_USER_ROLE,
  initialFacilityCreatorRoles,
  isFacilityCreatorUserRole,
} from "./signup-facility-creator";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("Facility creator authority", () => {
  it("assigns Facility Administrator to the signup User, not GM", () => {
    const roles = initialFacilityCreatorRoles();
    assert.equal(roles.userRoleKey, "FACILITY_ADMINISTRATOR");
    assert.equal(INITIAL_FACILITY_CREATOR_USER_ROLE, "FACILITY_ADMINISTRATOR");
    assert.equal(isFacilityCreatorUserRole("FACILITY_ADMINISTRATOR"), true);
    assert.equal(isFacilityCreatorUserRole("GM"), false);
    assert.equal(isFacilityAdministratorRole(roles.userRoleKey), true);
    assert.equal(hasAtLeastRole(roles.userRoleKey, "FACILITY_ADMINISTRATOR"), true);
    assert.equal(hasAtLeastRole("GM", "FACILITY_ADMINISTRATOR"), false);
  });

  it("pairs the hub Employee roster row to the same FA RoleKey, not a job-title rename", () => {
    assert.equal(INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE, RoleKey.FACILITY_ADMINISTRATOR);
    assert.notEqual(INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE, RoleKey.GM);
    assert.notEqual(INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE, RoleKey.MANAGER);
  });

  it("does not globally equate GM with Facility Administrator", () => {
    assert.equal(isFacilityAdministratorRole("GM"), false);
    assert.equal(canPurchaseDepartmentProducts("GM"), false);
    assert.equal(canPurchaseDepartmentProducts("MANAGER"), false);
    assert.equal(canPurchaseDepartmentProducts("FACILITY_ADMINISTRATOR"), true);
    const access = source("src/lib/access.ts");
    assert.doesNotMatch(access, /GM === ["']FACILITY_ADMINISTRATOR["']/);
    assert.match(access, /FACILITY_ADMINISTRATOR: 6/);
    assert.match(access, /GM: 5/);
  });

  it("assigns creator authority at signup creation, then issues that role on the session", () => {
    const signup = source("src/app/api/auth/signup/route.ts");
    assert.match(signup, /initialFacilityCreatorRoles/);
    assert.match(signup, /roleId: creatorUserRole\.id/);
    assert.match(signup, /roleType: creatorRoles\.employeeRoleType/);
    assert.match(signup, /role: created\.user\.role\.key/);
    assert.match(signup, /ONBOARDING_ENTRY_PATH/);
    assert.doesNotMatch(signup, /where: \{ key: ["']GM["'] \}/);
    assert.doesNotMatch(signup, /roleType: RoleKey\.GM/);
    assert.doesNotMatch(signup, /if \(onboarding/);
    assert.equal(ONBOARDING_ENTRY_PATH, "/setup");
  });

  it("keeps Setup and billing on real FA checks with no GM onboarding bypass", () => {
    for (const relative of [
      "src/app/api/onboarding/state/route.ts",
      "src/app/api/onboarding/managers/route.ts",
      "src/app/api/onboarding/locations/route.ts",
      "src/app/(protected)/admin/billing/actions.ts",
    ]) {
      const text = source(relative);
      assert.match(text, /requireAtLeastRole\(session\.role, ["']FACILITY_ADMINISTRATOR["']\)/, relative);
      assert.doesNotMatch(text, /if \(onboardingCurrentStep/, relative);
      assert.doesNotMatch(text, /session\.role === ["']GM["']/, relative);
    }
    const purchase = source("src/lib/department-products/facility-catalog.ts");
    assert.match(purchase, /hasAtLeastRole\(role, ["']FACILITY_ADMINISTRATOR["']\)/);
    const addForm = source("src/app/(protected)/admin/departments/page.tsx");
    assert.match(addForm, /isFacilityAdministratorRole\(session\.role\)/);
    assert.match(addForm, /AddDepartmentForm/);
    assert.doesNotMatch(addForm, /CreateDepartmentForm/);
  });

  it("does not add a blanket GM promotion migration", () => {
    const migrations = source("prisma/schema.prisma");
    assert.match(migrations, /enum RoleKey/);
    const creator = source("src/lib/signup-facility-creator.ts");
    assert.doesNotMatch(creator, /updateMany/);
    assert.doesNotMatch(creator, /where: \{ key: ["']GM["'] \}/);
    assert.doesNotMatch(source("src/app/api/auth/signup/route.ts"), /prisma\.user\.updateMany/);
  });

  it("does not reintroduce trio bootstrap on customer routes", () => {
    for (const relative of [
      "src/app/api/auth/signup/route.ts",
      "src/app/api/onboarding/locations/route.ts",
      "src/app/(protected)/admin/departments/page.tsx",
      "src/app/(protected)/employees/layout.tsx",
      "src/app/(protected)/employees/page.tsx",
      "src/app/(protected)/department/settings/[departmentId]/page.tsx",
      "src/components/setup-wizard.tsx",
    ]) {
      assert.doesNotMatch(source(relative), /ensureDefaultDepartments/, relative);
    }
  });
});
