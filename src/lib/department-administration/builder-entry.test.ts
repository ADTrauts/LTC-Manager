import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEPARTMENT_BUILDER_LIST_HREF,
  departmentBuilderAllDepartmentsHref,
  departmentBuilderHrefAfterDepartmentSwitch,
  departmentBuilderWorkspaceHref,
  isDepartmentBuilderWorkspacePath,
  resolveDepartmentBuilderEntryHref,
  rewriteDepartmentBuilderNavHref,
  shouldRedirectDepartmentsListToWorkspace,
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

  it("redirects list → workspace when a department is selected unless ?all=1", () => {
    assert.equal(
      shouldRedirectDepartmentsListToWorkspace({
        activeDepartmentId: "clx",
        forceAllDepartments: false,
      }),
      true,
    );
    assert.equal(
      shouldRedirectDepartmentsListToWorkspace({
        activeDepartmentId: "clx",
        forceAllDepartments: true,
      }),
      false,
    );
    assert.equal(
      shouldRedirectDepartmentsListToWorkspace({
        activeDepartmentId: null,
        forceAllDepartments: false,
      }),
      false,
    );
  });

  it("detects workspace paths and preserves tab when switching department", () => {
    assert.equal(isDepartmentBuilderWorkspacePath("/admin/departments/clx"), true);
    assert.equal(isDepartmentBuilderWorkspacePath("/admin/departments/clx?tab=locations"), true);
    assert.equal(isDepartmentBuilderWorkspacePath("/admin/departments"), false);
    assert.equal(
      departmentBuilderHrefAfterDepartmentSwitch({
        nextDepartmentId: "clevs",
        currentPathname: "/admin/departments/cldiet",
        currentSearch: "?tab=locations&profile=old",
      }),
      "/build/departments/clevs?tab=locations",
    );
    assert.equal(
      departmentBuilderHrefAfterDepartmentSwitch({
        nextDepartmentId: null,
        currentPathname: "/admin/departments/cldiet",
      }),
      departmentBuilderAllDepartmentsHref(),
    );
    assert.equal(
      departmentBuilderHrefAfterDepartmentSwitch({
        nextDepartmentId: "clevs",
        currentPathname: "/admin/departments/cldiet",
        currentSearch: "?tab=cycles",
      }),
      "/build/departments/clevs?tab=teams",
    );
    assert.equal(
      departmentBuilderWorkspaceHref("abc"),
      "/build/departments/abc",
    );
  });
});
