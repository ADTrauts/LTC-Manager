import assert from "node:assert/strict";
import test from "node:test";

import type { ConsoleCatalogItem } from "./console-catalog";
import { CONSOLE_CATALOG_EMPTY } from "./console-catalog";
import {
  filterMarketplaceItems,
  formatMarketplaceInstallCount,
  formatMarketplaceResultCount,
  formatMarketplaceUsage,
  marketplaceBrowseHref,
  marketplaceBrowseRequestHref,
  marketplaceCategoryOptions,
  marketplaceClearHref,
  marketplaceCreateAction,
  marketplaceCreatePageModel,
  marketplaceEmptyCopy,
  marketplaceFamilyHref,
  marketplaceRefinementsActive,
  marketplaceRowHref,
  marketplaceStatusOptions,
  marketplaceTypeLabel,
  resolveMarketplaceBrowse,
} from "./console-catalog-browse";

function item(overrides: Partial<ConsoleCatalogItem> & Pick<ConsoleCatalogItem, "sourceType" | "stableKey" | "name" | "catalogFamily">): ConsoleCatalogItem {
  return {
    sourceId: overrides.stableKey,
    catalogSubtype: null,
    categoryKey: null,
    categoryLabel: null,
    versionDisplay: CONSOLE_CATALOG_EMPTY,
    statusKey: null,
    statusLabel: CONSOLE_CATALOG_EMPTY,
    facilityInstallCount: 0,
    usageCount: null,
    usageLabel: null,
    detailHref: `/unused/${overrides.stableKey}`,
    actions: { view: true, author: false },
    ...overrides,
  };
}

const plant = item({
  sourceType: "DEPARTMENT_PRODUCT",
  stableKey: "PLANT",
  name: "Facility Plant Operations",
  catalogFamily: "DEPARTMENTS",
  categoryKey: "HEALTHCARE",
  categoryLabel: "Healthcare",
  versionDisplay: "1.0",
  statusKey: "AVAILABLE",
  statusLabel: "AVAILABLE",
  facilityInstallCount: 2,
  usageCount: 32,
  usageLabel: "users",
  detailHref: "/console/catalog/products/PLANT",
});

const food = item({
  sourceType: "DEPARTMENT_PRODUCT",
  stableKey: "HEALTHCARE_FOOD_NUTRITION",
  name: "Healthcare Food & Nutrition",
  catalogFamily: "DEPARTMENTS",
  categoryKey: "HEALTHCARE",
  categoryLabel: "Healthcare",
  versionDisplay: CONSOLE_CATALOG_EMPTY,
  statusKey: "AVAILABLE",
  statusLabel: "AVAILABLE",
  facilityInstallCount: 1,
  usageCount: 1,
  usageLabel: "users",
});

const evs = item({
  sourceType: "DEPARTMENT_PRODUCT",
  stableKey: "EVS",
  name: "Environmental Services",
  catalogFamily: "DEPARTMENTS",
  categoryKey: "HEALTHCARE",
  categoryLabel: "Healthcare",
  statusKey: "DEVELOPMENT",
  statusLabel: "DEVELOPMENT",
  facilityInstallCount: 0,
  usageCount: 0,
  usageLabel: "users",
});

const cooler = item({
  sourceType: "CATALOG_RECORD",
  stableKey: "cooler_temperature_log",
  name: "Cooler Temperature Log",
  catalogFamily: "RECORDS",
  catalogSubtype: "LOG",
  categoryKey: "TEMPERATURE",
  categoryLabel: "Temperature",
  versionDisplay: "v1",
  statusKey: "PUBLISHED",
  statusLabel: "Published",
  facilityInstallCount: 2,
  usageCount: 24,
  usageLabel: "placements",
  detailHref: "/console/catalog/cooler_temperature_log",
});

const opening = item({
  sourceType: "CATALOG_RECORD",
  stableKey: "opening_checklist",
  name: "Opening Checklist",
  catalogFamily: "RECORDS",
  catalogSubtype: "CHECKLIST",
  categoryKey: "OPENING_CLOSING",
  categoryLabel: "Opening / closing",
  versionDisplay: "v1",
  statusKey: "PUBLISHED",
  statusLabel: "Published",
  facilityInstallCount: 0,
  usageCount: 0,
  usageLabel: "placements",
});

const dishwasher = item({
  sourceType: "CATALOG_RECORD",
  stableKey: "dishwasher_sanitation_log",
  name: "Dishwasher Sanitation Log",
  catalogFamily: "RECORDS",
  catalogSubtype: "LOG",
  categoryKey: "SANITATION",
  categoryLabel: "Sanitation",
  versionDisplay: "v2",
  statusKey: "PUBLISHED",
  statusLabel: "Published \u00b7 Draft",
  facilityInstallCount: 1,
  usageCount: 14,
  usageLabel: "placements",
});

const inspection = item({
  sourceType: "CATALOG_RECORD",
  stableKey: "equipment_inspection",
  name: "Equipment Inspection",
  catalogFamily: "RECORDS",
  catalogSubtype: "INSPECTION",
  categoryKey: "EQUIPMENT",
  categoryLabel: "Equipment",
  versionDisplay: "v1",
  statusKey: "DRAFT",
  statusLabel: "Draft",
  usageCount: 0,
  usageLabel: "placements",
});

const round = item({
  sourceType: "WORK_PRESET",
  stableKey: "MECHANICAL_ROOM_ROUND",
  name: "Mechanical Room Round",
  catalogFamily: "WORK",
  categoryKey: "PLANT",
  categoryLabel: "Facility Plant Operations",
  facilityInstallCount: 4,
  usageCount: 6,
  usageLabel: "published plans",
  detailHref: "/console/catalog/work/MECHANICAL_ROOM_ROUND",
});

const catalog = [round, cooler, evs, opening, plant, food, dishwasher, inspection];

test("family and subtype filters stay on the unified projection", () => {
  const all = filterMarketplaceItems(catalog, resolveMarketplaceBrowse({}, catalog));
  assert.deepEqual(
    all.map((row) => row.stableKey),
    [
      "cooler_temperature_log",
      "dishwasher_sanitation_log",
      "EVS",
      "equipment_inspection",
      "PLANT",
      "HEALTHCARE_FOOD_NUTRITION",
      "MECHANICAL_ROOM_ROUND",
      "opening_checklist",
    ],
  );

  const departments = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ family: "departments" }, catalog),
  );
  assert.deepEqual(departments.map((row) => row.stableKey), ["EVS", "PLANT", "HEALTHCARE_FOOD_NUTRITION"]);

  const logs = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ family: "records", type: "log" }, catalog),
  );
  assert.deepEqual(logs.map((row) => row.stableKey), ["cooler_temperature_log", "dishwasher_sanitation_log"]);

  const checklists = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ family: "records", type: "checklist" }, catalog),
  );
  assert.deepEqual(checklists.map((row) => row.name), ["Opening Checklist"]);

  const inspections = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ family: "records", type: "inspection" }, catalog),
  );
  assert.deepEqual(inspections.map((row) => row.name), ["Equipment Inspection"]);

  const work = filterMarketplaceItems(catalog, resolveMarketplaceBrowse({ family: "work" }, catalog));
  assert.deepEqual(work.map((row) => row.stableKey), ["MECHANICAL_ROOM_ROUND"]);
});

test("search crosses families and composed filters stay on one list", () => {
  const plantSearch = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ q: "PLANT" }, catalog),
  );
  assert.deepEqual(plantSearch.map((row) => row.stableKey), ["PLANT", "MECHANICAL_ROOM_ROUND"]);

  const coolerSearch = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ q: "cooler" }, catalog),
  );
  assert.deepEqual(coolerSearch.map((row) => row.name), ["Cooler Temperature Log"]);

  const mechanical = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ q: "Mechanical" }, catalog),
  );
  assert.deepEqual(mechanical.map((row) => row.name), ["Mechanical Room Round"]);

  const composed = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse(
      { family: "records", type: "log", category: "SANITATION", q: "dishwasher" },
      catalog,
    ),
  );
  assert.deepEqual(composed.map((row) => row.stableKey), ["dishwasher_sanitation_log"]);
});

test("status and category filters are family-scoped", () => {
  assert.deepEqual(marketplaceStatusOptions({ family: "all" }), []);
  assert.deepEqual(marketplaceStatusOptions({ family: "work" }), []);
  assert.deepEqual([...marketplaceStatusOptions({ family: "departments" })], [
    "AVAILABLE",
    "DEVELOPMENT",
    "RETIRED",
  ]);

  const available = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ family: "departments", status: "AVAILABLE" }, catalog),
  );
  assert.deepEqual(available.map((row) => row.stableKey), ["PLANT", "HEALTHCARE_FOOD_NUTRITION"]);

  const published = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ family: "records", status: "Published" }, catalog),
  );
  assert.deepEqual(published.map((row) => row.stableKey), ["cooler_temperature_log", "opening_checklist"]);

  const publishedDraft = filterMarketplaceItems(
    catalog,
    resolveMarketplaceBrowse({ family: "records", status: "Published \u00b7 Draft" }, catalog),
  );
  assert.deepEqual(publishedDraft.map((row) => row.stableKey), ["dishwasher_sanitation_log"]);

  assert.deepEqual(marketplaceCategoryOptions(catalog, { family: "all", type: null }), []);
  assert.deepEqual(
    marketplaceCategoryOptions(catalog, { family: "records", type: "log" }).map((row) => row.label),
    ["Sanitation", "Temperature"],
  );
  assert.deepEqual(
    marketplaceCategoryOptions(catalog, { family: "work", type: null }).map((row) => row.label),
    ["Facility Plant Operations"],
  );
});

test("invalid browse params normalize and family changes drop incompatible filters", () => {
  const normalized = resolveMarketplaceBrowse(
    { family: "procedures", type: "audit", status: "LIVE", category: "NOPE", q: "  plant  " },
    catalog,
  );
  assert.deepEqual(normalized, {
    family: "all",
    type: null,
    status: null,
    category: null,
    q: "plant",
  });
  assert.equal(marketplaceBrowseHref(normalized), "/console/catalog?q=plant");
  assert.notEqual(
    marketplaceBrowseRequestHref({ family: "procedures", type: "audit", q: "plant" }),
    marketplaceBrowseHref(normalized),
  );

  const recordsLog = resolveMarketplaceBrowse({ family: "records", type: "log", category: "SANITATION" }, catalog);
  const departments = resolveMarketplaceBrowse(
    { family: "departments", type: "log", category: "SANITATION", status: "Published" },
    catalog,
  );
  assert.equal(departments.type, null);
  assert.equal(departments.category, null);
  assert.equal(departments.status, null);
  assert.equal(marketplaceFamilyHref(recordsLog, "departments"), "/console/catalog?family=departments");
  assert.equal(marketplaceBrowseRequestHref({ family: "all" }), "/console/catalog?family=all");
  assert.equal(marketplaceBrowseHref(resolveMarketplaceBrowse({ family: "all" }, catalog)), "/console/catalog");
});

test("install, usage, type, empty, and create presentation stay source-specific", () => {
  assert.equal(formatMarketplaceInstallCount(0), "None yet");
  assert.equal(formatMarketplaceInstallCount(1), "1 facility");
  assert.equal(formatMarketplaceInstallCount(2), "2 facilities");
  assert.equal(formatMarketplaceUsage(1, "users"), "1 user");
  assert.equal(formatMarketplaceUsage(32, "users"), "32 users");
  assert.equal(formatMarketplaceUsage(1, "placements"), "1 placement");
  assert.equal(formatMarketplaceUsage(14, "placements"), "14 placements");
  assert.equal(formatMarketplaceUsage(1, "published plans"), "1 published plan");
  assert.equal(formatMarketplaceUsage(6, "published plans"), "6 published plans");
  assert.equal(formatMarketplaceUsage(null, null), CONSOLE_CATALOG_EMPTY);
  assert.equal(formatMarketplaceResultCount(1), "1 item");
  assert.equal(formatMarketplaceResultCount(14), "14 items");

  assert.equal(marketplaceTypeLabel(plant), "Department");
  assert.equal(marketplaceTypeLabel(cooler), "Log");
  assert.equal(marketplaceTypeLabel(opening), "Checklist");
  assert.equal(marketplaceTypeLabel(inspection), "Inspection");
  assert.equal(marketplaceTypeLabel(round), "Work");
  assert.equal(plant.versionDisplay, "1.0");
  assert.equal(cooler.versionDisplay, "v1");
  assert.equal(round.versionDisplay, CONSOLE_CATALOG_EMPTY);

  assert.equal(marketplaceRowHref(cooler), "/console/catalog/cooler_temperature_log");
  assert.equal(marketplaceRowHref(plant), "/console/catalog/products/PLANT");
  assert.equal(marketplaceRowHref(round), "/console/catalog/work/MECHANICAL_ROOM_ROUND");

  assert.equal(marketplaceEmptyCopy(resolveMarketplaceBrowse({}, [])), "No Marketplace items are available.");
  assert.equal(
    marketplaceEmptyCopy(resolveMarketplaceBrowse({ family: "departments" }, [])),
    "No Department Products match these filters.",
  );
  assert.equal(
    marketplaceEmptyCopy(resolveMarketplaceBrowse({ family: "records" }, [])),
    "No catalog Records match these filters.",
  );
  assert.equal(
    marketplaceEmptyCopy(resolveMarketplaceBrowse({ family: "work" }, [])),
    "No Work presets match these filters.",
  );
  assert.equal(
    marketplaceEmptyCopy(resolveMarketplaceBrowse({ q: "missing" }, catalog)),
    "No Marketplace items match “missing”.",
  );

  assert.deepEqual(marketplaceCreateAction(resolveMarketplaceBrowse({}, catalog)), {
    href: "/console/catalog/new",
    label: "New catalog record",
  });
  assert.equal(marketplaceCreateAction(resolveMarketplaceBrowse({ family: "departments" }, catalog)), null);
  assert.equal(marketplaceCreateAction(resolveMarketplaceBrowse({ family: "work" }, catalog)), null);
  assert.deepEqual(marketplaceCreateAction(resolveMarketplaceBrowse({ family: "records", type: "log" }, catalog)), {
    href: "/console/catalog/new?type=log",
    label: "New catalog log",
  });
  assert.deepEqual(
    marketplaceCreateAction(resolveMarketplaceBrowse({ family: "records", type: "checklist" }, catalog)),
    { href: "/console/catalog/new?type=checklist", label: "New catalog checklist" },
  );
  assert.deepEqual(
    marketplaceCreateAction(resolveMarketplaceBrowse({ family: "records", type: "inspection" }, catalog)),
    { href: "/console/catalog/new?type=inspection", label: "New catalog inspection" },
  );
  assert.deepEqual(marketplaceCreatePageModel(null), {
    title: "New catalog record",
    purposeType: "LOG",
  });
  assert.deepEqual(marketplaceCreatePageModel("procedure"), {
    title: "New catalog record",
    purposeType: "LOG",
  });

  const refined = resolveMarketplaceBrowse({ family: "records", type: "log", q: "cooler" }, catalog);
  assert.equal(marketplaceRefinementsActive(refined), true);
  assert.equal(marketplaceClearHref(refined), "/console/catalog?family=records");
  assert.equal(marketplaceRefinementsActive(resolveMarketplaceBrowse({ family: "work" }, catalog)), false);
});
