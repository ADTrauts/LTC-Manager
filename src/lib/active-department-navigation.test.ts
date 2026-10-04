import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  departmentIdFromBuilderWorkspacePath,
  hrefAfterActiveDepartmentChange,
  isDepartmentBuilderAreaPath,
  shouldSyncActiveDepartmentFromRoute,
} from "@/lib/active-department-navigation";

const dietaryId = "cldietary000000000000001";
const evsId = "clevs00000000000000000001";

test("Department Builder area includes list and workspace, not other builders", () => {
  assert.equal(isDepartmentBuilderAreaPath("/build/departments"), true);
  assert.equal(isDepartmentBuilderAreaPath(`/build/departments/${evsId}`), true);
  assert.equal(isDepartmentBuilderAreaPath("/admin/departments"), false);
  assert.equal(isDepartmentBuilderAreaPath(`/admin/departments/${evsId}`), false);
  assert.equal(isDepartmentBuilderAreaPath("/build"), false);
  assert.equal(isDepartmentBuilderAreaPath("/employees"), false);
  assert.equal(isDepartmentBuilderAreaPath("/assets/builder"), false);
  assert.equal(isDepartmentBuilderAreaPath("/admin/facility/builder"), false);
  assert.equal(isDepartmentBuilderAreaPath("/admin/knowledge"), false);
  assert.equal(isDepartmentBuilderAreaPath("/menus"), false);
});

test("workspace department id is parsed from the Builder route only", () => {
  assert.equal(departmentIdFromBuilderWorkspacePath(`/build/departments/${evsId}`), evsId);
  assert.equal(departmentIdFromBuilderWorkspacePath("/build/departments"), null);
  assert.equal(departmentIdFromBuilderWorkspacePath("/admin/departments"), null);
  assert.equal(departmentIdFromBuilderWorkspacePath("/employees"), null);
});

test("Dietary → EVS on a retired Cycles tab lands on Operating Rhythm", () => {
  const href = hrefAfterActiveDepartmentChange({
    nextDepartmentId: evsId,
    currentPathname: `/build/departments/${dietaryId}`,
    currentSearch: "?tab=cycles",
  });
  assert.equal(href, `/build/departments/${evsId}?tab=operating-rhythm`);
});

test("EVS → Dietary on Locations preserves tab", () => {
  const href = hrefAfterActiveDepartmentChange({
    nextDepartmentId: dietaryId,
    currentPathname: `/build/departments/${evsId}`,
    currentSearch: "?tab=locations",
  });
  assert.equal(href, `/build/departments/${dietaryId}?tab=locations`);
});

test("clearing the selected department returns to the Build resolver", () => {
  const href = hrefAfterActiveDepartmentChange({
    nextDepartmentId: null,
    currentPathname: `/build/departments/${dietaryId}`,
    currentSearch: "?tab=cycles",
  });
  assert.equal(href, "/build/departments");
});

test("Build resolver → specific department opens that workspace", () => {
  const href = hrefAfterActiveDepartmentChange({
    nextDepartmentId: dietaryId,
    currentPathname: "/build/departments",
  });
  assert.equal(href, `/build/departments/${dietaryId}`);
});

test("facility-wide builders do not rewrite the route (refresh-only)", () => {
  for (const path of [
    "/build",
    "/employees",
    "/assets/builder",
    "/admin/facility/builder",
    "/admin/knowledge",
    "/menus",
    "/staffing/templates",
  ]) {
    assert.equal(
      hrefAfterActiveDepartmentChange({
        nextDepartmentId: evsId,
        currentPathname: path,
      }),
      null,
      path,
    );
  }
});

test("direct EVS workspace while header is Dietary must sync", () => {
  assert.equal(
    shouldSyncActiveDepartmentFromRoute({
      routeDepartmentId: evsId,
      selectedDepartmentId: dietaryId,
      selectableDepartmentIds: [dietaryId, evsId],
    }),
    true,
  );
});

test("matching route and header do not sync", () => {
  assert.equal(
    shouldSyncActiveDepartmentFromRoute({
      routeDepartmentId: evsId,
      selectedDepartmentId: evsId,
      selectableDepartmentIds: [dietaryId, evsId],
    }),
    false,
  );
});

test("unauthorized / non-selectable route department does not sync", () => {
  assert.equal(
    shouldSyncActiveDepartmentFromRoute({
      routeDepartmentId: evsId,
      selectedDepartmentId: dietaryId,
      selectableDepartmentIds: [dietaryId],
    }),
    false,
  );
});

test("All departments (null selection) on an EVS workspace must sync to EVS", () => {
  assert.equal(
    shouldSyncActiveDepartmentFromRoute({
      routeDepartmentId: evsId,
      selectedDepartmentId: null,
      selectableDepartmentIds: [dietaryId, evsId],
    }),
    true,
  );
});

test("list route has no workspace id so it does not sync a department from the URL", () => {
  assert.equal(
    shouldSyncActiveDepartmentFromRoute({
      routeDepartmentId: departmentIdFromBuilderWorkspacePath("/build/departments"),
      selectedDepartmentId: dietaryId,
      selectableDepartmentIds: [dietaryId, evsId],
    }),
    false,
  );
});

test("header/route invariant: switch href department id equals the selected department", () => {
  const href = hrefAfterActiveDepartmentChange({
    nextDepartmentId: evsId,
    currentPathname: `/build/departments/${dietaryId}`,
    currentSearch: "?tab=cycles",
  });
  assert.equal(departmentIdFromBuilderWorkspacePath(href!.split("?")[0]!), evsId);
  assert.notEqual(departmentIdFromBuilderWorkspacePath(href!.split("?")[0]!), dietaryId);
});

test("DepartmentScopeSwitcher always refreshes the shell after a cookie update", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/department-scope-switcher.tsx"),
    "utf8",
  );
  assert.match(source, /\/api\/auth\/active-department/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /hrefAfterActiveDepartmentChange/);
  // Must not skip refresh when navigating the Builder workspace.
  assert.doesNotMatch(source, /router\.push\([\s\S]*return;/);
});

test("AppShell mounts route sync so deep links cannot disagree with the header", () => {
  const source = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
  assert.match(source, /ActiveDepartmentRouteSync/);
  assert.match(source, /shellSelectedDepartmentId/);
});

test("selectable departments for the header still use showInEmployeeApp (not Build authority)", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/active-department-context.ts"),
    "utf8",
  );
  assert.match(source, /loadCustomerOperableDepartments/);
  assert.match(source, /dept\.showInEmployeeApp/);
  const listPage = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/departments/page.tsx"),
    "utf8",
  );
  assert.match(listPage, /loadCustomerOperableDepartments/);
  assert.doesNotMatch(listPage, /where: \{ facilityId, isActive: true, showInEmployeeApp/);
});
