/**
 * Facility Plant Operations V1 — whole-Product release-gate hermetic suite.
 * Proves committed DEVELOPMENT gating and controlled AVAILABLE simulation
 * without mutating the Product registry.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { decideAssetOperationsAuthority } from "@/lib/asset-operations/authority";
import { maintenanceSubNavItems } from "@/lib/asset-operations/maintenance-nav";
import { DEFAULT_MAINTENANCE_CATEGORIES } from "@/lib/asset-operations/work-order-semantics";
import { repairSourceLabel } from "@/lib/asset-operations/repair-presentation";
import { departmentAdminTabsForFlags } from "@/lib/department-administration/admin-nav";
import { presentPlantGettingStarted } from "@/lib/department-administration/plant-getting-started";
import {
  canPurchaseDepartmentProducts,
  deriveFacilityDepartmentCatalog,
} from "@/lib/department-products/facility-catalog";
import {
  evaluateCustomerDepartmentOperability,
  hasInternalDepartmentProductAccess,
  marketplaceDenialReason,
  resolveCommercialEntitlement,
} from "@/lib/department-products/eligibility";
import {
  DepartmentProductInstallError,
  resolveDepartmentProductForInstall,
  resolveDepartmentProductForInternalInstall,
} from "@/lib/department-products/install";
import { listPlantStarterCatalog, PLANT_STARTER_PACKAGE_NAME } from "@/lib/department-products/plant-starter-catalog";
import {
  resolvePlantRuntimeFromFacts,
  resolveSharedAssetOperationsFromFacts,
} from "@/lib/department-products/plant-runtime";
import { decidePmPlanAuthority } from "@/lib/preventive-maintenance/authority";
import { applyPmCadencePresetDefaults } from "@/lib/preventive-maintenance/presentation";
import { enumerateScheduledDates } from "@/lib/preventive-maintenance/schedule";
import { presentRequesterStatus } from "@/lib/operational-requests";

import {
  getCommittedDepartmentProductStatus,
  getDepartmentProduct,
  isDepartmentProductAvailableForInstall,
  isDepartmentProductCustomerVisible,
  listDepartmentProducts,
  overrideDepartmentProductStatusForTest,
  resetDepartmentProductStatusOverridesForTest,
} from "./registry";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function plantAvailableClone() {
  const plant = getDepartmentProduct("PLANT");
  assert.ok(plant);
  return { ...plant, status: "AVAILABLE" as const };
}

test.afterEach(() => {
  resetDepartmentProductStatusOverridesForTest();
});

test("committed Facility Plant Operations remains DEVELOPMENT", () => {
  const plant = getDepartmentProduct("PLANT");
  assert.ok(plant);
  assert.equal(plant.productKey, "PLANT");
  assert.equal(plant.name, "Facility Plant Operations");
  assert.equal(plant.defaultDepartmentName, "Plant Operations");
  assert.equal(plant.status, "DEVELOPMENT");
  assert.equal(getCommittedDepartmentProductStatus("PLANT"), "DEVELOPMENT");
  assert.equal(isDepartmentProductAvailableForInstall(plant), false);
  assert.equal(isDepartmentProductCustomerVisible(plant), false);
  assert.equal(
    marketplaceDenialReason({ releaseStatus: "DEVELOPMENT", installed: false }),
    "hidden",
  );
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
    resolveCommercialEntitlement({
      releaseStatus: "DEVELOPMENT",
      entitlementStatus: "ACTIVE",
      billingStatus: "ACTIVE",
      entitlementsEnforced: true,
      installed: true,
    }),
    false,
  );
  assert.throws(
    () => resolveDepartmentProductForInstall("PLANT"),
    (err: unknown) =>
      err instanceof DepartmentProductInstallError && err.code === "UNAVAILABLE_PRODUCT",
  );
  const internal = resolveDepartmentProductForInternalInstall("PLANT");
  assert.equal(internal.productKey, "PLANT");
  assert.equal(internal.status, "DEVELOPMENT");
});

test("controlled AVAILABLE overlay does not mutate committed registry", () => {
  overrideDepartmentProductStatusForTest("PLANT", "AVAILABLE");
  const live = getDepartmentProduct("PLANT");
  assert.ok(live);
  assert.equal(live.status, "AVAILABLE");
  assert.equal(isDepartmentProductAvailableForInstall(live), true);
  assert.equal(isDepartmentProductCustomerVisible(live), true);
  assert.equal(getCommittedDepartmentProductStatus("PLANT"), "DEVELOPMENT");
  assert.equal(
    listDepartmentProducts().find((row) => row.productKey === "PLANT")?.status,
    "AVAILABLE",
  );
  resetDepartmentProductStatusOverridesForTest();
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
});

test("controlled AVAILABLE makes Plant customer-visible, installable, and operable", () => {
  const available = plantAvailableClone();
  assert.equal(isDepartmentProductAvailableForInstall(available), true);
  assert.equal(isDepartmentProductCustomerVisible(available), true);
  assert.equal(
    marketplaceDenialReason({ releaseStatus: "AVAILABLE", installed: false }),
    "add",
  );
  assert.equal(
    evaluateCustomerDepartmentOperability({
      productKey: "PLANT",
      releaseStatus: "AVAILABLE",
      installed: true,
      departmentActive: true,
      entitled: true,
    }).operable,
    true,
  );
  const catalog = deriveFacilityDepartmentCatalog({
    products: [
      getDepartmentProduct("HEALTHCARE_FOOD_NUTRITION")!,
      available,
      getDepartmentProduct("EVS")!,
    ],
    departments: [],
    entitlements: [],
    entitlementsEnforced: false,
  });
  assert.ok(catalog.some((row) => row.productKey === "HEALTHCARE_FOOD_NUTRITION"));
  assert.ok(catalog.some((row) => row.productKey === "PLANT" && row.availableToAdd));
  assert.equal(
    catalog.some((row) => row.productKey === "EVS"),
    false,
    "EVS stays DEVELOPMENT and hidden",
  );
});

test("Work and Records use Plant runtime, not the env flag alone", () => {
  const work = source("src/lib/department-work/authority.ts");
  assert.match(work, /isDepartmentEngineEnabledForFacility/);
  assert.doesNotMatch(work, /isDepartmentWorkPlansEnabled\(/);
  const evidence = source("src/lib/operational-evidence/evidence-authority.ts");
  assert.match(evidence, /isDepartmentEngineEnabledForFacility/);
  const engine = source("src/lib/department-operations.ts");
  assert.match(engine, /key === "PLANT"/);
  assert.match(engine, /isPlantRuntimeEnabled/);
});

test("Plant runtime works from installed + customer-operable without env flag or Harbor", () => {
  assert.equal(
    resolvePlantRuntimeFromFacts({
      developmentOverride: false,
      productInstalled: true,
      harborAccess: false,
      customerOperable: true,
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
    "installed DEVELOPMENT without Harbor or override is not customer-operable",
  );
  assert.equal(
    resolvePlantRuntimeFromFacts({
      developmentOverride: false,
      productInstalled: false,
      harborAccess: true,
      customerOperable: true,
    }),
    false,
    "Harbor or customer operability cannot substitute for installation",
  );
  assert.equal(hasInternalDepartmentProductAccess({ authKind: "user", productKey: "PLANT" }), false);
  assert.equal(hasInternalDepartmentProductAccess({ authKind: "employee", productKey: "PLANT" }), false);
  assert.equal(
    hasInternalDepartmentProductAccess({ authKind: "harbor_staff", productKey: "PLANT" }),
    true,
  );
  assert.equal(
    resolveSharedAssetOperationsFromFacts({
      dietaryAssetOperationsEnabled: false,
      plantRuntimeEnabled: true,
    }),
    true,
  );
});

test("other Products are unchanged by Plant certification", () => {
  const dietary = getDepartmentProduct("HEALTHCARE_FOOD_NUTRITION");
  const evs = getDepartmentProduct("EVS");
  assert.equal(dietary?.status, "AVAILABLE");
  assert.equal(evs?.status, "DEVELOPMENT");
  overrideDepartmentProductStatusForTest("PLANT", "AVAILABLE");
  assert.equal(getDepartmentProduct("HEALTHCARE_FOOD_NUTRITION")?.status, "AVAILABLE");
  assert.equal(getDepartmentProduct("EVS")?.status, "DEVELOPMENT");
  assert.equal(getCommittedDepartmentProductStatus("PLANT"), "DEVELOPMENT");
});

test("starter catalog is the certified Work and Record package", () => {
  const items = listPlantStarterCatalog();
  assert.equal(PLANT_STARTER_PACKAGE_NAME, "Plant Operations starter configuration");
  assert.deepEqual(
    items.filter((row) => row.kind === "work").map((row) => row.title),
    [
      "Mechanical Room Round",
      "Building Walkthrough",
      "Exterior / Grounds Walkthrough",
      "Generator Visual Check",
    ],
  );
  assert.deepEqual(
    items.filter((row) => row.kind === "record").map((row) => row.title),
    [
      "Equipment Condition Inspection",
      "Mechanical Room Inspection",
      "Generator Inspection",
      "Basic Equipment Reading",
      "Post-Work Order Verification",
    ],
  );
  const installer = source("src/lib/department-products/plant-starter.ts");
  assert.doesNotMatch(installer, /prisma\.asset\.create/);
  assert.doesNotMatch(installer, /preventiveMaintenancePlan\.create/);
  assert.doesNotMatch(installer, /publishWorkPlan|publishTemplate/);
  const install = source("src/lib/department-products/install.ts");
  assert.match(install, /Does not materialize cycle\/work\/evidence starters/);
});

test("Build and Run IA nouns stay Product language", () => {
  assert.deepEqual(
    departmentAdminTabsForFlags({
      profilesEnabled: true,
      workEnabled: true,
      recordsEnabled: true,
      maintenanceEnabled: true,
    }).map((row) => row.id),
    ["overview", "locations", "operating-rhythm", "work", "maintenance", "people", "records"],
  );
  assert.deepEqual(
    maintenanceSubNavItems(true).map((row) => row.label),
    ["Assets", "Work Orders", "Issues", "Preventive", "Vendors"],
  );
  assert.equal(repairSourceLabel("DIRECT"), "Direct Work Order");
  assert.equal(
    DEFAULT_MAINTENANCE_CATEGORIES.find((row) => row.key === "GENERAL_REPAIR")?.label,
    "General",
  );
  const rows = presentPlantGettingStarted({
    departmentId: "dept-plant",
    locationCount: 0,
    assetCount: 0,
    peopleCount: 0,
    workPlanCount: 0,
    recordCount: 0,
    publishedPmPlanCount: 0,
  });
  assert.equal(rows.find((row) => row.id === "starter")?.actionLabel, "Add starter configuration");
  const repairs = source("src/app/(protected)/repairs/repairs-page-client.tsx");
  assert.match(repairs, /New Work Order/);
  assert.doesNotMatch(repairs, /New repair/);
  const space = source("src/app/(protected)/unit/[unitId]/space-workspace-page.tsx");
  assert.match(space, /ReportProblemForm/);
  assert.doesNotMatch(space, /AssetIssueReportPanel/);
});

test("requester status projection stays safe Product language", () => {
  assert.equal(presentRequesterStatus({ status: "REPORTED" }), "RECEIVED");
  assert.equal(presentRequesterStatus({ status: "UNDER_REVIEW", workOrderId: "wo1" }), "ACCEPTED");
  assert.equal(
    presentRequesterStatus({
      status: "UNDER_REVIEW",
      workOrderId: "wo1",
      workOrderStatus: "IN_PROGRESS",
    }),
    "IN_PROGRESS",
  );
  assert.equal(presentRequesterStatus({ status: "CLOSED" }), "RESOLVED");
  assert.equal(presentRequesterStatus({ status: "CANCELLED" }), "DECLINED");
});

test("quarterly cadence preview is Jan Apr Jul Oct and Routine / 7 lead days", () => {
  const quarterly = applyPmCadencePresetDefaults("quarterly");
  assert.equal(quarterly.intervalMonths, 3);
  assert.equal(quarterly.generationLeadDays, 7);
  assert.equal(quarterly.priority, "ROUTINE");
  assert.deepEqual(
    enumerateScheduledDates({
      intervalMonths: 3,
      anchorDate: "2027-01-15",
      fromInclusive: "2027-01-01",
      throughInclusive: "2027-12-31",
    }),
    ["2027-01-15", "2027-04-15", "2027-07-15", "2027-10-15"],
  );
});

test("role matrix: requester / STAFF / Supervisor / Manager / FA", () => {
  const staff = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "plant",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "plant",
  });
  assert.equal(staff.canViewRuntime, true);
  assert.equal(staff.canTriageIssue, false);
  assert.equal(staff.canManageWorkOrders, false);
  assert.equal(staff.canManageAssets, false);

  const supervisor = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "plant",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "plant",
  });
  assert.equal(supervisor.canTriageIssue, true);
  assert.equal(supervisor.canManageWorkOrders, true);
  assert.equal(supervisor.canManageAssets, false);

  const manager = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "plant",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "plant",
  });
  assert.equal(manager.canManageAssets, true);
  assert.equal(manager.canManageWorkOrders, true);

  const faWithout = decideAssetOperationsAuthority({
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "plant",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "dietary",
  });
  assert.equal(faWithout.canTriageIssue, false);
  assert.equal(faWithout.canManageWorkOrders, false);
  assert.match(faWithout.reason ?? "", /Facility Administrator status alone/);
  assert.equal(canPurchaseDepartmentProducts("FACILITY_ADMINISTRATOR"), true);
  assert.equal(canPurchaseDepartmentProducts("MANAGER"), false);

  const staffPm = decidePmPlanAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "plant",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "plant",
  });
  assert.equal(staffPm.canDraft, false);
  assert.equal(staffPm.canPublish, false);
  assert.equal(staffPm.canSkip, false);

  const supervisorPm = decidePmPlanAuthority({
    flagEnabled: true,
    role: "SUPERVISOR",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "plant",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "plant",
  });
  assert.equal(supervisorPm.canDraft, true);
  assert.equal(supervisorPm.canPublish, false);
  assert.equal(supervisorPm.canSkip, true);

  const managerPm = decidePmPlanAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "plant",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "plant",
  });
  assert.equal(managerPm.canPublish, true);
  assert.equal(managerPm.canRetire, true);

  const starterAction = source(
    "src/app/(protected)/admin/departments/[departmentId]/plant-starter-actions.ts",
  );
  assert.match(starterAction, /hasAtLeastRole\(session\.role, "MANAGER"\)/);
});

test("after overlay cleanup committed status is DEVELOPMENT", () => {
  overrideDepartmentProductStatusForTest("PLANT", "AVAILABLE");
  resetDepartmentProductStatusOverridesForTest();
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
  assert.equal(getCommittedDepartmentProductStatus("PLANT"), "DEVELOPMENT");
});
