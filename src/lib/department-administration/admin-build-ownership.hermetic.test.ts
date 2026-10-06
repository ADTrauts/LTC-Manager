import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ADMIN_HUB_SECTIONS,
  flattenAdminHubLinks,
  visibleAdminHubSections,
} from "@/lib/administration/admin-hub";
import {
  ADMIN_DEPARTMENTS_HREF,
  ADMIN_DEPARTMENTS_MARKETPLACE_HREF,
  adminDepartmentManageHref,
  adminDepartmentsHrefFromLegacyBuildQuery,
  resolveDepartmentBuilderEntryHref,
} from "@/lib/department-administration/builder-entry";
import { resolveProductAreaLabel, resolveProductModeForPath } from "@/lib/product-mode";
import { roleMayAccessRoute } from "@/lib/route-registry/authorize";

const FLAGS = { todaysWorkEnabled: true, canonicalLogsEnabled: true };

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("Admin vs Build Department ownership", () => {
  it("places Departments on the Administration hub under Organization", () => {
    const organization = ADMIN_HUB_SECTIONS.find((section) => section.id === "organization");
    assert.deepEqual(
      organization?.links.map((link) => link.id),
      ["organization_settings", "departments", "billing"],
    );
    const departments = flattenAdminHubLinks().find((link) => link.id === "departments");
    assert.equal(departments?.href, "/admin/departments");
    assert.match(departments?.description ?? "", /installed Department Products/);
    assert.equal(
      visibleAdminHubSections()
        .flatMap((section) => section.links)
        .some((link) => link.id === "departments"),
      true,
    );
  });

  it("owns Marketplace and Manage on Admin routes", () => {
    assert.equal(ADMIN_DEPARTMENTS_HREF, "/admin/departments");
    assert.equal(ADMIN_DEPARTMENTS_MARKETPLACE_HREF, "/admin/departments?marketplace=1");
    assert.equal(adminDepartmentManageHref("cldiet"), "/admin/departments/cldiet/manage");
    const adminPage = source("src/app/(protected)/admin/departments/page.tsx");
    assert.match(adminPage, /DepartmentMarketplace/);
    assert.match(adminPage, /add-department-button/);
    assert.match(adminPage, /assertFacilityAdministratorPage/);
    assert.match(adminPage, /AdminPageHeader/);
    assert.doesNotMatch(adminPage, /BuildPageHeader/);
    const manage = source("src/app/(protected)/admin/departments/[departmentId]/manage/page.tsx");
    assert.match(manage, /Department Manager/);
    assert.match(manage, /DepartmentVisibilityForm/);
    assert.match(manage, /assertFacilityAdministratorPage/);
  });

  it("opens the selected Department from Build without a management list", () => {
    assert.equal(resolveDepartmentBuilderEntryHref("cldiet"), "/build/departments/cldiet");
    const resolver = source("src/app/(protected)/build/departments/page.tsx");
    assert.match(resolver, /departmentBuilderWorkspaceHref/);
    assert.match(resolver, /adminDepartmentsHrefFromLegacyBuildQuery/);
    assert.doesNotMatch(resolver, /Add Department/);
    assert.doesNotMatch(resolver, /DepartmentMarketplace/);
    const overview = source(
      "src/app/(protected)/admin/departments/[departmentId]/overview-panel.tsx",
    );
    assert.doesNotMatch(overview, /Add Department/);
    assert.doesNotMatch(overview, /DepartmentMarketplace/);
    assert.doesNotMatch(overview, /DepartmentManagerForm/);
    assert.doesNotMatch(overview, /overview-advanced-settings/);
    const builder = source("src/app/(protected)/admin/departments/[departmentId]/page.tsx");
    assert.doesNotMatch(builder, /add-department-button/);
    assert.doesNotMatch(builder, /DepartmentMarketplace/);
  });

  it("redirects leftover Build management URLs to Admin", () => {
    assert.equal(
      adminDepartmentsHrefFromLegacyBuildQuery({ marketplace: true, all: true }),
      "/admin/departments?marketplace=1",
    );
    assert.equal(adminDepartmentsHrefFromLegacyBuildQuery({ all: true }), "/admin/departments");
    const resolver = source("src/app/(protected)/build/departments/page.tsx");
    assert.match(resolver, /query\.all === "1"/);
    assert.match(resolver, /query\.marketplace === "1"/);
  });

  it("authorizes Admin Product management separately from Department Builder", () => {
    assert.equal(roleMayAccessRoute("/admin/departments", "FACILITY_ADMINISTRATOR", FLAGS), true);
    assert.equal(roleMayAccessRoute("/admin/departments", "MANAGER", FLAGS), false);
    assert.equal(roleMayAccessRoute("/admin/departments", "GM", FLAGS), false);
    assert.equal(
      roleMayAccessRoute("/admin/departments/cldept0001/manage", "FACILITY_ADMINISTRATOR", FLAGS),
      true,
    );
    assert.equal(roleMayAccessRoute("/admin/departments/cldept0001/manage", "MANAGER", FLAGS), false);
    assert.equal(roleMayAccessRoute("/build/departments", "MANAGER", FLAGS), true);
    assert.equal(roleMayAccessRoute("/build/departments/cldept0001", "MANAGER", FLAGS), true);
    assert.equal(roleMayAccessRoute("/build/departments", "STAFF", FLAGS), false);
    assert.equal(
      roleMayAccessRoute("/build/departments/cldept0001/preventive-maintenance", "SUPERVISOR", FLAGS),
      true,
    );
    assert.equal(
      roleMayAccessRoute("/build/departments/cldept0001/preventive-maintenance", "STAFF", FLAGS),
      false,
    );
  });

  it("keeps Admin Departments in ADMIN mode and Builder in BUILD", () => {
    assert.equal(resolveProductModeForPath("/admin/departments"), "ADMIN");
    assert.equal(resolveProductAreaLabel("/admin/departments"), "Departments");
    assert.equal(resolveProductModeForPath("/admin/departments/clx/manage"), "ADMIN");
    assert.equal(resolveProductModeForPath("/build/departments"), "BUILD");
    assert.equal(resolveProductModeForPath("/build/departments/clx"), "BUILD");
    assert.equal(resolveProductAreaLabel("/build/departments"), "Department Builder");
  });
});
