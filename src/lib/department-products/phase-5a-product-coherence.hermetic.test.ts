import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { getDepartmentProduct } from "@/lib/department-products";
import {
  resolvePlantRuntimeFromFacts,
  resolveSharedAssetOperationsFromFacts,
} from "@/lib/department-products/plant-runtime";
import { evaluateCustomerDepartmentOperability, marketplaceDenialReason } from "@/lib/department-products/eligibility";
import { isDepartmentProductAvailableForInstall } from "@/lib/department-products/registry";
import { maintenanceSubNavItems } from "@/lib/asset-operations/maintenance-nav";
import { DEFAULT_MAINTENANCE_CATEGORIES } from "@/lib/asset-operations/work-order-semantics";
import { presentPmOccurrenceStateLabel } from "@/lib/preventive-maintenance/run-board";
import { repairSourceLabel } from "@/lib/asset-operations/repair-presentation";
import { presentPlantGettingStarted } from "@/lib/department-administration/plant-getting-started";
import { departmentAdminTabsForFlags } from "@/lib/department-administration/admin-nav";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

test("Facility Plant Operations remains DEVELOPMENT and customer-hidden", () => {
  const plant = getDepartmentProduct("PLANT");
  assert.ok(plant);
  assert.equal(plant.name, "Facility Plant Operations");
  assert.equal(plant.defaultDepartmentName, "Plant Operations");
  assert.equal(plant.status, "DEVELOPMENT");
  assert.equal(isDepartmentProductAvailableForInstall(plant), false);
  assert.equal(
    evaluateCustomerDepartmentOperability({
      productKey: "PLANT",
      releaseStatus: "DEVELOPMENT",
      installed: true,
      departmentActive: true,
      entitled: true,
    }).operable,
    false,
  );
  assert.equal(
    marketplaceDenialReason({ releaseStatus: "DEVELOPMENT", installed: false }),
    "hidden",
  );
});

test("SUPERVISOR Maintenance sub-nav teaches Work Orders and Issues", () => {
  const items = maintenanceSubNavItems(true);
  assert.deepEqual(
    items.map((row) => ({ id: row.id, label: row.label, href: row.href })),
    [
      { id: "assets", label: "Assets", href: "/assets" },
      { id: "repairs", label: "Work Orders", href: "/repairs" },
      { id: "issues", label: "Issues", href: "/asset-issues" },
      { id: "preventive", label: "Preventive", href: "/preventive-maintenance" },
      { id: "vendors", label: "Vendors", href: "/assets?subtab=vendors" },
    ],
  );
  assert.equal(maintenanceSubNavItems(false).length, 0);
});

test("customer-visible Work Order and Issue nouns", () => {
  assert.equal(repairSourceLabel("DIRECT"), "Direct Work Order");
  assert.equal(
    DEFAULT_MAINTENANCE_CATEGORIES.find((row) => row.key === "GENERAL_REPAIR")?.label,
    "General",
  );
  const repairsClient = source("src/app/(protected)/repairs/repairs-page-client.tsx");
  assert.match(repairsClient, /New Work Order/);
  assert.doesNotMatch(repairsClient, /New repair/);
  const createForm = source("src/app/(protected)/repairs/repair-create-form.tsx");
  assert.match(createForm, /Create Work Order/);
  const issuePanel = source("src/components/asset-operations/asset-issue-report-panel.tsx");
  assert.match(issuePanel, /Report Issue/);
  assert.doesNotMatch(issuePanel, /Report Asset Issue/);
});

test("PM operator labels avoid occurrence / Projected in primary copy", () => {
  assert.equal(presentPmOccurrenceStateLabel("PROJECTED"), "Upcoming schedule");
  const board = source("src/components/plant-operations/pm-run-board.tsx");
  assert.match(board, /Upcoming schedule/);
  assert.doesNotMatch(board, /label: "Projected"/);
  const skip = source("src/components/plant-operations/pm-skip-form.tsx");
  assert.match(skip, /Skip this scheduled maintenance/);
});

test("Unit/Space Report a problem mounts Request intake, not Issue create", () => {
  const space = source("src/app/(protected)/unit/[unitId]/space-workspace-page.tsx");
  assert.match(space, /ReportProblemForm/);
  assert.doesNotMatch(space, /AssetIssueReportPanel/);
  const employee = source("src/app/(protected)/unit/[unitId]/employee-runtime-page.tsx");
  assert.match(employee, /ReportProblemForm/);
  assert.doesNotMatch(employee, /AssetIssueReportPanel/);
  const neighborhood = source("src/app/(protected)/unit/[unitId]/neighborhood-workspace-page.tsx");
  assert.match(neighborhood, /ReportProblemForm/);
  const form = source("src/components/operational-requests/report-problem-form.tsx");
  assert.match(form, /Report a maintenance need for this location/);
  assert.match(form, /RequesterStatusPanel/);
});

test("Plant Builder exposes Work and Maintenance without Menus", () => {
  const tabs = departmentAdminTabsForFlags({
    profilesEnabled: true,
    workEnabled: true,
    recordsEnabled: true,
    maintenanceEnabled: true,
  });
  assert.deepEqual(
    tabs.map((row) => row.id),
    ["overview", "locations", "operating-rhythm", "work", "maintenance", "people", "records"],
  );
  const page = source("src/app/(protected)/admin/departments/[departmentId]/page.tsx");
  assert.match(page, /view\.department\.key === "PLANT"/);
  assert.match(page, /presentPlantGettingStarted/);
});

test("Getting Started is derived guidance and never a persisted score", () => {
  const rows = presentPlantGettingStarted({
    departmentId: "dept-plant",
    locationCount: 0,
    assetCount: 0,
    peopleCount: 0,
    workPlanCount: 0,
    recordCount: 0,
    publishedPmPlanCount: 0,
  });
  assert.equal(rows.length, 10);
  assert.equal(rows.find((row) => row.id === "starter")?.status, "deferred");
  assert.equal(rows.find((row) => row.id === "operate")?.status, "ready");
  const gettingStarted = source("src/lib/department-administration/plant-getting-started.ts");
  assert.doesNotMatch(gettingStarted, /SETUP_COMPLETE/);
});

test("Plant runtime helper is installed Product or DEVELOPMENT override", () => {
  const runtime = source("src/lib/department-products/plant-runtime.ts");
  assert.match(runtime, /isPlantOperationsDevelopmentOverrideEnabled/);
  assert.match(runtime, /matchDepartmentRecordForProduct/);
  assert.match(runtime, /hasInternalDepartmentProductAccess/);
  assert.match(runtime, /isDepartmentRowCustomerOperable/);
  assert.doesNotMatch(runtime, /name === "Plant"/);
  const departmentContext = source("src/lib/active-department-context.ts");
  assert.match(departmentContext, /isPlantRuntimeEnabled/);
  assert.equal(
    resolvePlantRuntimeFromFacts({
      developmentOverride: true,
      productInstalled: false,
      harborAccess: false,
      customerOperable: false,
    }),
    true,
  );
  assert.equal(
    resolvePlantRuntimeFromFacts({
      developmentOverride: false,
      productInstalled: true,
      harborAccess: true,
      customerOperable: false,
    }),
    true,
  );
  assert.equal(
    resolvePlantRuntimeFromFacts({
      developmentOverride: false,
      productInstalled: true,
      harborAccess: false,
      customerOperable: false,
    }),
    false,
  );
  assert.equal(
    resolvePlantRuntimeFromFacts({
      developmentOverride: false,
      productInstalled: false,
      harborAccess: true,
      customerOperable: false,
    }),
    false,
  );
  assert.equal(
    resolveSharedAssetOperationsFromFacts({
      dietaryAssetOperationsEnabled: true,
      plantRuntimeEnabled: false,
    }),
    true,
  );
  assert.equal(
    resolveSharedAssetOperationsFromFacts({
      dietaryAssetOperationsEnabled: false,
      plantRuntimeEnabled: true,
    }),
    true,
  );
  assert.equal(
    resolveSharedAssetOperationsFromFacts({
      dietaryAssetOperationsEnabled: true,
      plantRuntimeEnabled: true,
    }),
    true,
  );
  assert.equal(
    resolveSharedAssetOperationsFromFacts({
      dietaryAssetOperationsEnabled: false,
      plantRuntimeEnabled: false,
    }),
    false,
  );
});
