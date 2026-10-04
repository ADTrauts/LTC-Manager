import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_DEPARTMENTS_HREF,
  ADMIN_DEPARTMENTS_MARKETPLACE_HREF,
  DEPARTMENT_BUILDER_LIST_HREF,
  adminDepartmentManageHref,
  adminDepartmentsHrefFromLegacyBuildQuery,
  departmentBuilderAllDepartmentsHref,
  departmentBuilderHrefAfterDepartmentSwitch,
  departmentBuilderWorkspaceHref,
  isDepartmentBuilderWorkspacePath,
  resolveDepartmentBuilderEntryHref,
  rewriteDepartmentBuilderNavHref,
} from "@/lib/department-administration/builder-entry";

describe("Department Builder entry routing", () => {
  it("resolves selected department to its workspace Overview", () => {
    assert.equal(
      resolveDepartmentBuilderEntryHref("cldept123"),
      "/build/departments/cldept123",
    );
    assert.equal(resolveDepartmentBuilderEntryHref(null), DEPARTMENT_BUILDER_LIST_HREF);
    assert.equal(resolveDepartmentBuilderEntryHref(""), DEPARTMENT_BUILDER_LIST_HREF);
  });

  it("rewrites only the Department Builder list href in nav/hub items", () => {
    const items = [
      { label: "Build Home", href: "/build" },
      { label: "Department Builder", href: "/build/departments" },
      { label: "Facility Builder", href: "/admin/facility/builder" },
    ];
    const rewritten = rewriteDepartmentBuilderNavHref(items, "cldept999");
    assert.equal(rewritten[0]!.href, "/build");
    assert.equal(rewritten[1]!.href, "/build/departments/cldept999");
    assert.equal(rewritten[2]!.href, "/admin/facility/builder");
    assert.deepEqual(
      rewriteDepartmentBuilderNavHref(items, null).map((i) => i.href),
      items.map((i) => i.href),
    );
  });

  it("sends leftover Build management queries to Admin", () => {
    assert.equal(
      adminDepartmentsHrefFromLegacyBuildQuery({ marketplace: true }),
      ADMIN_DEPARTMENTS_MARKETPLACE_HREF,
    );
    assert.equal(
      adminDepartmentsHrefFromLegacyBuildQuery({ all: true }),
      ADMIN_DEPARTMENTS_HREF,
    );
    assert.equal(departmentBuilderAllDepartmentsHref(), ADMIN_DEPARTMENTS_HREF);
    assert.equal(adminDepartmentManageHref("clx"), "/admin/departments/clx/manage");
  });

  it("detects Build workspace paths and preserves tab when switching department", () => {
    assert.equal(isDepartmentBuilderWorkspacePath("/build/departments/clx"), true);
    assert.equal(isDepartmentBuilderWorkspacePath("/build/departments/clx?tab=locations"), true);
    assert.equal(isDepartmentBuilderWorkspacePath("/admin/departments/clx"), false);
    assert.equal(isDepartmentBuilderWorkspacePath("/admin/departments"), false);
    assert.equal(isDepartmentBuilderWorkspacePath("/build/departments"), false);
    assert.equal(
      departmentBuilderHrefAfterDepartmentSwitch({
        nextDepartmentId: "clevs",
        currentPathname: "/build/departments/cldiet",
        currentSearch: "?tab=locations&profile=old",
      }),
      "/build/departments/clevs?tab=locations",
    );
    assert.equal(
      departmentBuilderHrefAfterDepartmentSwitch({
        nextDepartmentId: null,
        currentPathname: "/build/departments/cldiet",
      }),
      DEPARTMENT_BUILDER_LIST_HREF,
    );
    assert.equal(
      departmentBuilderHrefAfterDepartmentSwitch({
        nextDepartmentId: "clevs",
        currentPathname: "/build/departments/cldiet",
        currentSearch: "?tab=cycles",
      }),
      "/build/departments/clevs?tab=operating-rhythm",
    );
    assert.equal(departmentBuilderWorkspaceHref("abc"), "/build/departments/abc");
  });
});
