import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { applyMaintenanceNavRewrite } from "@/lib/asset-operations/maintenance-nav";
import { applyCanonicalLogsNavRewrite } from "@/lib/canonical-logs/run-nav";
import { groupNavItemsByMode, headerNavItemsForMode } from "@/lib/product-mode";
import { platformNavItemsForRole } from "@/lib/route-registry";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("terminology — Run / Build / Admin are Mode, not Workspace", () => {
  const menu = source("src/components/sign-out-controls.tsx");
  const cue = source("src/components/shell-mode-cue.tsx");
  const shell = source("src/components/app-shell.tsx");
  const modeNav = source("src/components/shell/shell-mode-nav.tsx");

  assert.doesNotMatch(menu, /account-menu-workspace-group/);
  assert.doesNotMatch(menu, />Workspace</);
  assert.doesNotMatch(menu, /account-menu-run|account-menu-build|account-menu-admin/);
  assert.match(cue, /Current mode:/);
  assert.doesNotMatch(cue, /Current workspace:|Workspace and account menu/);
  assert.doesNotMatch(shell, /Operations workspace/);
  assert.match(modeNav, /aria-label="Mode"/);
  assert.match(modeNav, />\s*Mode\s*</);
});

test("brand — Vssyl lockup has no Facility subtitle", () => {
  const brand = source("src/components/shell-brand-block.tsx");
  assert.match(brand, /VssylLockup/);
  assert.match(brand, /VssylMark/);
  assert.doesNotMatch(brand, /facilityName|displayName|facility\?\.name/);
});

test("facility desktop — RUN destinations live in the workspace rail, not TopNav", () => {
  const shell = source("src/components/app-shell.tsx");
  const sidebar = source("src/components/shell-sidebar.tsx");
  assert.doesNotMatch(shell, /TopNav/);
  assert.match(shell, /WorkspaceShellRail/);
  assert.match(shell, /WorkspaceSelector/);
  assert.match(shell, /ShellModeNav/);
  assert.match(sidebar, /headerNavItemsForMode\("RUN"/);
  assert.match(sidebar, /isFacilityLocationsPath/);
});

test("facility RUN nav is the registry projection, not a second hardcoded list", () => {
  const flags = {
    todaysWorkEnabled: true,
    dietaryOperationalEvidenceEnabled: true,
    dietaryWorkPlansEnabled: true,
    canonicalLogsEnabled: true,
  };
  const items = applyMaintenanceNavRewrite(
    applyCanonicalLogsNavRewrite(platformNavItemsForRole("FACILITY_ADMINISTRATOR", flags), true, {
      canViewLogBook: true,
    }),
    { canViewAssets: true },
  );
  const run = headerNavItemsForMode("RUN", groupNavItemsByMode(items).find((g) => g.mode === "RUN")?.items ?? []);
  const labels = run.map((item) => item.label);
  assert.equal(labels.includes("Dashboard"), true);
  assert.equal(labels.includes("Today's Work"), true);
  assert.equal(labels.includes("Locations"), true);
  assert.equal(labels.includes("Schedule"), true);
  assert.equal(labels.includes("Log Book"), true);
  assert.equal(labels.includes("Maintenance"), true);
  assert.equal(labels.includes("Audit / Reports"), true);
  assert.equal(labels.includes("Employees"), false);
  assert.equal(labels.includes("Repairs"), false);
});

test("Locations is a destination; the tree is not the shell parent", () => {
  const owned = source("src/components/shell/workspace-owned-nav.tsx");
  const sidebar = source("src/components/shell-sidebar.tsx");
  const compact = source("src/components/responsive-shell-nav.tsx");
  assert.match(owned, /href === "\/units"/);
  assert.match(owned, /pathname.startsWith\("\/unit\/"\)/);
  assert.match(sidebar, /isFacilityLocationsPath\(pathname\) \?/);
  assert.doesNotMatch(compact, /shell-nav-locations/);
});

test("Department is subordinate to the workspace region", () => {
  const rail = source("src/components/shell/workspace-shell-rail.tsx");
  const shell = source("src/components/app-shell.tsx");
  const compact = source("src/components/responsive-shell-nav.tsx");
  assert.match(rail, /workspace/);
  assert.match(rail, /department/);
  assert.ok(rail.indexOf("workspace") < rail.indexOf("department"));
  assert.match(shell, /department=\{departmentSwitcherNode\(\)\}/);
  assert.match(compact, /compact-department-slot/);
});

test("account menu is identity/account; modes are application navigation", () => {
  const menu = source("src/components/sign-out-controls.tsx");
  const shell = source("src/components/app-shell.tsx");
  assert.match(menu, /GlobalUserNavLinks/);
  assert.match(menu, /Help & Support/);
  assert.match(menu, /Sign out/);
  assert.match(shell, /showMyAccess=\{authKind === "user"\}/);
  assert.match(shell, /mode=\{modeNavNode\(\)\}/);
});

test("Build and Admin keep their existing chrome; shell switching is the Workspace selector", () => {
  const sidebar = source("src/components/shell-sidebar.tsx");
  const shell = source("src/components/app-shell.tsx");
  const org = source("src/app/(organization-account)/layout.tsx");
  const partner = source("src/components/partner/partner-facility-shell.tsx");
  assert.match(sidebar, /BuildSidebar/);
  assert.match(sidebar, /href: "\/admin"/);
  assert.match(shell, /WorkspaceSelector/);
  assert.match(org, /WorkspaceSelector/);
  assert.match(partner, /WorkspaceSelector/);
  assert.doesNotMatch(shell, /FacilitySwitcher/);
  assert.doesNotMatch(org, /OrganizationSwitcher/);
  assert.doesNotMatch(partner, /leavePartnerFacilityAction|Return to/);
});

test("Partner chrome uses partner destinations and Audit / Reports", () => {
  const partner = source("src/components/partner/partner-facility-shell.tsx");
  assert.match(partner, /label: "Dashboard"/);
  assert.match(partner, /label: "Logs"/);
  assert.match(partner, /label: "Audit \/ Reports"/);
  assert.match(partner, /label: "Locations"/);
  assert.match(partner, /label: "Assets"/);
  assert.doesNotMatch(partner, /Today's Work|Employees|\/build|\/admin/);
  assert.match(partner, /presentCurrentContextFromSession/);
  assert.match(partner, /PartnerDepartmentSwitch/);
  assert.match(partner, /WorkspaceSelector/);
});

test("Organization chrome uses Portfolio / Clients / Members and keeps org session", () => {
  const layout = source("src/app/(organization-account)/layout.tsx");
  const nav = source("src/components/organization-workspace-nav.tsx");
  assert.match(layout, /isOrganizationScopedSession/);
  assert.match(layout, /WorkspaceShellRail/);
  assert.match(layout, /presentCurrentContextFromSession/);
  assert.match(nav, /label: "Portfolio"/);
  assert.match(nav, /label: "Clients"/);
  assert.match(nav, /label: "Members"/);
  assert.doesNotMatch(nav, /Partner Access|Organization Administration/);
});

test("compact chrome is Menu / mark / workspace / avatar below xl", () => {
  const shell = source("src/components/app-shell.tsx");
  const compact = source("src/components/responsive-shell-nav.tsx");
  assert.match(compact, /xl:hidden/);
  assert.match(compact, /Open navigation/);
  assert.match(shell, /ShellBrandBlock compact/);
  assert.match(shell, /workspaceSelectorNode\(true\)/);
  assert.match(shell, /compactTrigger/);
  assert.match(shell, /department=\{departmentSwitcherNode\(\)\}/);
});

test("PIN omits the User workspace region and My Access", () => {
  const shell = source("src/components/app-shell.tsx");
  assert.match(shell, /authKind === "user" \? \(/);
  assert.match(shell, /showMyAccess=\{authKind === "user"\}/);
  assert.match(shell, /authKind === "user" \? workspaceSelectorNode\(\) : null/);
});

test("closed workspace chrome stays display-only; switching lives in WorkspaceSelector", () => {
  const region = source("src/components/shell/current-workspace-region.tsx");
  assert.match(region, /data-workspace-slot="reserved"/);
  assert.doesNotMatch(region, /enterContext|listAvailableContexts/);
  const selector = source("src/components/shell/workspace-selector.tsx");
  assert.match(selector, /enterContextAction/);
});
