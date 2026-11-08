/**
 * Console Marketplace V1 release hermetic locks.
 * Certifies registry truth, source isolation, and presentation contracts without a database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { getDepartmentProduct, listDepartmentProducts } from "@/lib/department-products/registry";
import {
  DEPARTMENT_WORK_PRESET_KEYS,
  workPresetOwningProductKey,
} from "@/lib/department-work/work-presets";

import {
  formatMarketplaceInstallCount,
  formatMarketplaceUsage,
  marketplaceCreateAction,
  resolveMarketplaceBrowse,
} from "./console-catalog-browse";
import {
  CONSOLE_CATALOG_EMPTY,
  CONSOLE_CATALOG_FAMILIES,
  CONSOLE_CATALOG_RECORD_SUBTYPES,
  CONSOLE_CATALOG_SOURCE_TYPES,
} from "./console-catalog";
import {
  formatProductReleaseDate,
  formatProductVersionLabel,
  PRODUCT_ACCESS_ROLE_ROWS,
} from "./console-catalog-detail";

const root = process.cwd();

test("Marketplace V1 source types and families stay locked", () => {
  assert.deepEqual([...CONSOLE_CATALOG_SOURCE_TYPES], [
    "DEPARTMENT_PRODUCT",
    "CATALOG_RECORD",
    "WORK_PRESET",
  ]);
  assert.deepEqual([...CONSOLE_CATALOG_FAMILIES], ["DEPARTMENTS", "RECORDS", "WORK"]);
  assert.deepEqual([...CONSOLE_CATALOG_RECORD_SUBTYPES], ["LOG", "CHECKLIST", "INSPECTION"]);
  assert.ok(!CONSOLE_CATALOG_RECORD_SUBTYPES.includes("PROCEDURE" as never));
});

test("Department Product registry release metadata stays authoritative", () => {
  const plant = getDepartmentProduct("PLANT");
  assert.ok(plant);
  assert.equal(plant.name, "Facility Plant Operations");
  assert.equal(plant.status, "AVAILABLE");
  assert.equal(plant.versionLabel, "1.0");
  assert.equal(plant.releasedOn, "2026-10-07");
  assert.equal(formatProductVersionLabel(plant.versionLabel), "1.0");
  assert.equal(formatProductReleaseDate(plant.releasedOn), "October 7, 2026");

  const food = getDepartmentProduct("HEALTHCARE_FOOD_NUTRITION");
  assert.ok(food);
  assert.equal(food.status, "AVAILABLE");
  assert.equal(food.versionLabel, null);
  assert.equal(food.releasedOn, null);
  assert.equal(formatProductVersionLabel(food.versionLabel), CONSOLE_CATALOG_EMPTY);
  assert.equal(formatProductReleaseDate(food.releasedOn), CONSOLE_CATALOG_EMPTY);

  const evs = getDepartmentProduct("EVS");
  assert.ok(evs);
  assert.equal(evs.name, "Environmental Services");
  assert.equal(evs.status, "DEVELOPMENT");
  assert.equal(evs.versionLabel, null);
  assert.equal(evs.releasedOn, null);

  assert.equal(food.installationKey, "DIETARY");
  assert.equal(
    listDepartmentProducts().filter((row) => row.installationKey === "DIETARY").length,
    1,
  );
});

test("Work preset ownership is metadata-driven", () => {
  assert.ok(DEPARTMENT_WORK_PRESET_KEYS.includes("MECHANICAL_ROOM_ROUND"));
  assert.equal(workPresetOwningProductKey("MECHANICAL_ROOM_ROUND"), "PLANT");
  const plant = getDepartmentProduct("PLANT");
  assert.equal(plant?.name, "Facility Plant Operations");
});

test("install and usage copy stay source-appropriate", () => {
  assert.equal(formatMarketplaceInstallCount(0), "None yet");
  assert.equal(formatMarketplaceInstallCount(1), "1 facility");
  assert.equal(formatMarketplaceInstallCount(2), "2 facilities");
  assert.doesNotMatch(formatMarketplaceInstallCount(2), /installed/);
  assert.equal(formatMarketplaceUsage(3, "users"), "3 users");
  assert.equal(formatMarketplaceUsage(3, "placements"), "3 placements");
  assert.equal(formatMarketplaceUsage(2, "published plans"), "2 published plans");
  assert.deepEqual(
    PRODUCT_ACCESS_ROLE_ROWS.map((row) => row.label),
    [
      "General Managers",
      "Managers",
      "Supervisors",
      "Staff",
      "Facility Administrators",
    ],
  );
});

test("create actions stay Records-only", () => {
  const empty = [] as const;
  assert.equal(marketplaceCreateAction(resolveMarketplaceBrowse({}, empty))?.label, "New catalog record");
  assert.equal(
    marketplaceCreateAction(resolveMarketplaceBrowse({ family: "records" }, empty))?.label,
    "New catalog record",
  );
  assert.equal(marketplaceCreateAction(resolveMarketplaceBrowse({ family: "departments" }, empty)), null);
  assert.equal(marketplaceCreateAction(resolveMarketplaceBrowse({ family: "work" }, empty)), null);
});

test("projection and detail stay free of Marketplace persistence and Knowledge leaks", () => {
  const projection = readFileSync(join(root, "src/lib/harbor-console/console-catalog.ts"), "utf8");
  const detail = readFileSync(join(root, "src/lib/harbor-console/console-catalog-detail.ts"), "utf8");
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const productPage = readFileSync(
    join(root, "src/app/console/(staff)/catalog/products/[productKey]/page.tsx"),
    "utf8",
  );
  const workPage = readFileSync(
    join(root, "src/app/console/(staff)/catalog/work/[presetKey]/page.tsx"),
    "utf8",
  );
  const browsePage = readFileSync(join(root, "src/app/console/(staff)/catalog/page.tsx"), "utf8");
  const customerMarketplace = readFileSync(
    join(root, "src/app/(protected)/admin/departments/department-marketplace.tsx"),
    "utf8",
  );

  assert.doesNotMatch(schema, /model MarketplaceItem\b/);
  assert.doesNotMatch(projection, /MarketplaceItem|KnowledgeArticle|OperationalTemplate/);
  assert.doesNotMatch(detail, /MarketplaceItem|KnowledgeArticle|OperationalTemplate/);
  assert.match(productPage, /requireHarborStaff/);
  assert.match(workPage, /requireHarborStaff/);
  assert.match(browsePage, /requireHarborStaff/);
  assert.match(browsePage, /listConsoleCatalogItems/);
  assert.doesNotMatch(productPage, /\.email|getByText\([`'"]@/);
  assert.doesNotMatch(workPage, /\.email/);
  assert.doesNotMatch(customerMarketplace, /listConsoleCatalogItems/);
  assert.match(customerMarketplace, /marketplace/);
});
