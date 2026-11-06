import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DEPARTMENT_WORK_PRESET_KEYS, WORK_PRESET_PRODUCT_KEYS } from "@/lib/department-work/work-presets";
import { getDepartmentProduct, listDepartmentProducts } from "@/lib/department-products/registry";

import {
  CONSOLE_CATALOG_EMPTY,
  listConsoleCatalogItems,
  toWorkPresetCatalogItem,
  type ConsoleCatalogItem,
} from "./console-catalog";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

type Call = { model: string; action: string; args: unknown };

const verifiedAt = new Date("2026-10-01T00:00:00.000Z");

function includesId(filter: { in?: string[] } | undefined, id: string) {
  return Boolean(filter?.in?.includes(id));
}

function buildClient() {
  const calls: Call[] = [];
  const departments = [
    { id: "plant-a", facilityId: "fac-a", key: "PLANT", isActive: true },
    { id: "plant-b", facilityId: "fac-b", key: "PLANT", isActive: false },
    { id: "laundry", facilityId: "fac-c", key: "LAUNDRY", isActive: true },
    { id: "food-a", facilityId: "fac-food-a", key: "DIETARY", isActive: true },
    { id: "food-b", facilityId: "fac-food-b", key: "HEALTHCARE_FOOD_NUTRITION", isActive: true },
    { id: "food-c-legacy", facilityId: "fac-food-c", key: "DIETARY", isActive: true },
    { id: "food-c-canonical", facilityId: "fac-food-c", key: "HEALTHCARE_FOOD_NUTRITION", isActive: true },
    { id: "evs-a", facilityId: "fac-evs", key: "EVS", isActive: true },
  ];
  const entitlements = [
    { facilityId: "fac-a", departmentKey: "PLANT", status: "ACTIVE" as const },
    { facilityId: "fac-b", departmentKey: "PLANT", status: "ACTIVE" as const },
  ];
  const billings = [
    { facilityId: "fac-a", status: "ACTIVE" },
    { facilityId: "fac-b", status: "ACTIVE" },
  ];
  const employees = [
    {
      id: "emp-mgr",
      facilityId: "fac-a",
      email: "Manager@Example.com",
      status: "ACTIVE" as const,
      primaryDepartmentId: "plant-a",
      employeeDepartments: [],
    },
    {
      id: "emp-sup",
      facilityId: "fac-a",
      email: "supervisor@example.com",
      status: "ACTIVE" as const,
      primaryDepartmentId: null,
      employeeDepartments: [{ departmentId: "plant-a" }],
    },
    {
      id: "emp-other",
      facilityId: "fac-a",
      email: "other@example.com",
      status: "ACTIVE" as const,
      primaryDepartmentId: "laundry",
      employeeDepartments: [],
    },
    {
      id: "emp-terminated",
      facilityId: "fac-a",
      email: "former@example.com",
      status: "TERMINATED" as const,
      primaryDepartmentId: "plant-a",
      employeeDepartments: [],
    },
    {
      id: "emp-disabled",
      facilityId: "fac-b",
      email: "disabled-plant@example.com",
      status: "ACTIVE" as const,
      primaryDepartmentId: "plant-b",
      employeeDepartments: [],
    },
    {
      id: "emp-evs",
      facilityId: "fac-evs",
      email: "evs@example.com",
      status: "ACTIVE" as const,
      primaryDepartmentId: "evs-a",
      employeeDepartments: [],
    },
  ];
  const users = [
    {
      id: "user-fa",
      facilityId: "fac-a",
      email: "admin@example.com",
      isActive: true,
      emailVerifiedAt: verifiedAt,
      role: { key: "FACILITY_ADMINISTRATOR" },
    },
    {
      id: "user-fa-dup",
      facilityId: "fac-a",
      email: "manager@example.com",
      isActive: true,
      emailVerifiedAt: verifiedAt,
      role: { key: "FACILITY_ADMINISTRATOR" },
    },
    {
      id: "user-fa-inactive",
      facilityId: "fac-a",
      email: "inactive-admin@example.com",
      isActive: false,
      emailVerifiedAt: verifiedAt,
      role: { key: "FACILITY_ADMINISTRATOR" },
    },
    {
      id: "user-fa-unverified",
      facilityId: "fac-a",
      email: "unverified-admin@example.com",
      isActive: true,
      emailVerifiedAt: null,
      role: { key: "FACILITY_ADMINISTRATOR" },
    },
    {
      id: "user-staff",
      facilityId: "fac-a",
      email: "staff-login@example.com",
      isActive: true,
      emailVerifiedAt: verifiedAt,
      role: { key: "STAFF" },
    },
    {
      id: "user-fa-disabled",
      facilityId: "fac-b",
      email: "disabled-admin@example.com",
      isActive: true,
      emailVerifiedAt: verifiedAt,
      role: { key: "FACILITY_ADMINISTRATOR" },
    },
  ];
  const definitions = [
    {
      id: "cooler-v1",
      stableKey: "cooler_temperature_log",
      version: 1,
      status: "PUBLISHED" as const,
      name: "Cooler Temperature Log",
      category: "TEMPERATURE" as const,
      purposeType: "LOG" as const,
    },
    {
      id: "draft-v2",
      stableKey: "phase6b_draft_log",
      version: 2,
      status: "DRAFT" as const,
      name: "Draft Log",
      category: "EQUIPMENT" as const,
      purposeType: "LOG" as const,
    },
    {
      id: "draft-v1",
      stableKey: "phase6b_draft_log",
      version: 1,
      status: "PUBLISHED" as const,
      name: "Draft Log",
      category: "EQUIPMENT" as const,
      purposeType: "LOG" as const,
    },
    {
      id: "procedure-v1",
      stableKey: "phase6b_procedure",
      version: 1,
      status: "PUBLISHED" as const,
      name: "Catalog Procedure",
      category: "OTHER" as const,
      purposeType: "PROCEDURE" as const,
    },
  ];
  const installs = [
    { facilityId: "fac-a", catalogStableKey: "cooler_temperature_log" },
    { facilityId: "fac-b", catalogStableKey: "cooler_temperature_log" },
  ];
  const attachments = [
    { catalogStableKey: "cooler_temperature_log", status: "ACTIVE" },
    { catalogStableKey: "cooler_temperature_log", status: "ACTIVE" },
    { catalogStableKey: "cooler_temperature_log", status: "INACTIVE" },
  ];
  const plans = [
    {
      presetKey: "MECHANICAL_ROOM_ROUND",
      stableKey: "MECHANICAL_ROOM_ROUND",
      facilityId: "fac-a",
      departmentId: "plant-a",
      status: "DRAFT" as const,
    },
    {
      presetKey: "MECHANICAL_ROOM_ROUND",
      stableKey: "MECHANICAL_ROOM_ROUND",
      facilityId: "fac-a",
      departmentId: "plant-a",
      status: "PUBLISHED" as const,
    },
    {
      presetKey: "MECHANICAL_ROOM_ROUND",
      stableKey: "MECHANICAL_ROOM_ROUND",
      facilityId: "fac-b",
      departmentId: "plant-b",
      status: "PUBLISHED" as const,
    },
    {
      presetKey: null,
      stableKey: "work_customer_round",
      facilityId: "fac-c",
      departmentId: "laundry",
      status: "PUBLISHED" as const,
    },
  ];

  function track<T>(model: string, action: string, args: unknown, value: T): T {
    calls.push({ model, action, args });
    return value;
  }

  const client = {
    department: {
      findMany: async (args: { where: { key: { in: string[] } } }) =>
        track(
          "department",
          "findMany",
          args,
          departments.filter((row) => args.where.key.in.includes(row.key)),
        ),
    },
    facilityDepartmentEntitlement: {
      findMany: async (args: {
        where: { facilityId: { in: string[] }; departmentKey: { in: string[] } };
      }) =>
        track(
          "facilityDepartmentEntitlement",
          "findMany",
          args,
          entitlements.filter(
            (row) =>
              includesId(args.where.facilityId, row.facilityId) &&
              args.where.departmentKey.in.includes(row.departmentKey),
          ),
        ),
    },
    facilityBilling: {
      findMany: async (args: { where: { facilityId: { in: string[] } } }) =>
        track(
          "facilityBilling",
          "findMany",
          args,
          billings.filter((row) => includesId(args.where.facilityId, row.facilityId)),
        ),
    },
    employee: {
      findMany: async (args: {
        where: {
          status: string;
          OR: [
            { primaryDepartmentId: { in: string[] } },
            { employeeDepartments: { some: { departmentId: { in: string[] } } } },
          ];
        };
      }) =>
        track(
          "employee",
          "findMany",
          args,
          employees.filter((row) => {
            if (row.status !== args.where.status) return false;
            const primaryIds = args.where.OR[0].primaryDepartmentId.in;
            const memberIds = args.where.OR[1].employeeDepartments.some.departmentId.in;
            return (
              (row.primaryDepartmentId != null && primaryIds.includes(row.primaryDepartmentId)) ||
              row.employeeDepartments.some((membership) => memberIds.includes(membership.departmentId))
            );
          }),
        ),
    },
    user: {
      findMany: async (args: {
        where: {
          facilityId: { in: string[] };
          isActive: boolean;
          emailVerifiedAt: { not: null };
          role: { key: string };
        };
      }) =>
        track(
          "user",
          "findMany",
          args,
          users.filter(
            (row) =>
              includesId(args.where.facilityId, row.facilityId) &&
              row.isActive === args.where.isActive &&
              row.emailVerifiedAt != null &&
              row.role.key === args.where.role.key,
          ),
        ),
    },
    catalogLogDefinition: {
      findMany: async (args: { where: { purposeType: { in: string[] } } }) =>
        track(
          "catalogLogDefinition",
          "findMany",
          args,
          definitions.filter((row) => args.where.purposeType.in.includes(row.purposeType)),
        ),
    },
    facilityCatalogInstall: {
      groupBy: async () =>
        track("facilityCatalogInstall", "groupBy", {}, groupCount(installs, "catalogStableKey")),
    },
    logAttachment: {
      groupBy: async (args: { where: { status: string } }) =>
        track(
          "logAttachment",
          "groupBy",
          args,
          groupCount(
            attachments.filter((row) => row.status === args.where.status),
            "catalogStableKey",
          ),
        ),
    },
    departmentWorkPlan: {
      findMany: async (args: {
        where: {
          OR: [{ presetKey: { in: string[] } }, { stableKey: { in: string[] } }];
        };
      }) =>
        track(
          "departmentWorkPlan",
          "findMany",
          args,
          plans.filter(
            (row) =>
              (row.presetKey != null && args.where.OR[0].presetKey.in.includes(row.presetKey)) ||
              args.where.OR[1].stableKey.in.includes(row.stableKey),
          ),
        ),
    },
  };

  return { calls, client };
}

function groupCount<T extends Record<string, string>>(rows: T[], key: keyof T & string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([catalogStableKey, count]) => ({
    catalogStableKey,
    _count: { facilityId: count, _all: count },
  }));
}

function requireItem(items: ConsoleCatalogItem[], stableKey: string) {
  const item = items.find((row) => row.stableKey === stableKey);
  assert.ok(item, stableKey);
  return item;
}

test("unified projection keeps Department, Record, and Work sources", async () => {
  const { calls, client } = buildClient();
  const items = await listConsoleCatalogItems(client as never);

  const plant = requireItem(items, "PLANT");
  assert.equal(plant.sourceType, "DEPARTMENT_PRODUCT");
  assert.equal(plant.catalogFamily, "DEPARTMENTS");
  assert.equal(plant.name, "Facility Plant Operations");
  assert.equal(plant.versionDisplay, "1.0");
  assert.equal(plant.statusKey, "AVAILABLE");
  assert.equal(plant.statusLabel, "AVAILABLE");
  assert.equal(plant.categoryKey, "HEALTHCARE");
  assert.equal(plant.categoryLabel, "Healthcare");
  assert.equal(plant.facilityInstallCount, 2);
  assert.equal(plant.usageCount, 3);
  assert.equal(plant.usageLabel, "users");
  assert.equal(plant.detailHref, "/console/catalog/products/PLANT");
  assert.deepEqual(plant.detailHref.split("/").filter(Boolean), [
    "console",
    "catalog",
    "products",
    "PLANT",
  ]);
  assert.deepEqual(plant.actions, { view: true, author: false });

  const food = requireItem(items, "HEALTHCARE_FOOD_NUTRITION");
  assert.equal(items.filter((row) => row.stableKey === "HEALTHCARE_FOOD_NUTRITION").length, 1);
  assert.equal(food.versionDisplay, CONSOLE_CATALOG_EMPTY);
  assert.equal(food.facilityInstallCount, 3);
  assert.equal(food.usageCount, 0);

  const evs = requireItem(items, "EVS");
  assert.equal(evs.statusKey, "DEVELOPMENT");
  assert.equal(evs.versionDisplay, CONSOLE_CATALOG_EMPTY);
  assert.equal(evs.facilityInstallCount, 1);
  assert.equal(evs.usageCount, 0);
  assert.equal(items.filter((row) => row.sourceType === "DEPARTMENT_PRODUCT").length, 3);

  const cooler = requireItem(items, "cooler_temperature_log");
  assert.equal(cooler.sourceType, "CATALOG_RECORD");
  assert.equal(cooler.catalogFamily, "RECORDS");
  assert.equal(cooler.catalogSubtype, "LOG");
  assert.equal(cooler.categoryLabel, "Temperature");
  assert.equal(cooler.versionDisplay, "v1");
  assert.equal(cooler.statusLabel, "Published");
  assert.equal(cooler.facilityInstallCount, 2);
  assert.equal(cooler.usageCount, 2);
  assert.equal(cooler.usageLabel, "placements");
  assert.equal(cooler.detailHref, "/console/catalog/cooler_temperature_log");
  assert.equal(cooler.actions.author, true);

  const draft = requireItem(items, "phase6b_draft_log");
  assert.equal(draft.versionDisplay, "v1");
  assert.equal(draft.statusLabel, "Published · Draft");
  assert.equal(items.some((row) => row.stableKey === "phase6b_procedure"), false);

  const round = requireItem(items, "MECHANICAL_ROOM_ROUND");
  assert.equal(round.sourceType, "WORK_PRESET");
  assert.equal(round.catalogFamily, "WORK");
  assert.equal(round.categoryKey, "PLANT");
  assert.equal(round.categoryLabel, "Facility Plant Operations");
  assert.equal(round.versionDisplay, CONSOLE_CATALOG_EMPTY);
  assert.equal(round.statusKey, null);
  assert.equal(round.statusLabel, CONSOLE_CATALOG_EMPTY);
  assert.equal(round.facilityInstallCount, 2);
  assert.equal(round.usageCount, 2);
  assert.equal(round.usageLabel, "published plans");
  assert.equal(round.detailHref, "/console/catalog/work/MECHANICAL_ROOM_ROUND");
  assert.equal(round.actions.author, false);
  assert.equal(items.some((row) => row.stableKey === "work_customer_round"), false);
  assert.equal(
    items.filter((row) => row.sourceType === "WORK_PRESET").length,
    DEPARTMENT_WORK_PRESET_KEYS.length,
  );

  for (const key of DEPARTMENT_WORK_PRESET_KEYS) {
    const item = requireItem(items, key);
    const owner = getDepartmentProduct(WORK_PRESET_PRODUCT_KEYS[key]);
    assert.ok(owner);
    assert.equal(item.categoryKey, owner.productKey);
    assert.equal(item.categoryLabel, owner.name);
  }

  assert.deepEqual(
    [...new Set(items.map((row) => row.sourceType))].sort(),
    ["CATALOG_RECORD", "DEPARTMENT_PRODUCT", "WORK_PRESET"],
  );
  assert.equal(items.filter((row) => row.catalogFamily === "DEPARTMENTS").length, listDepartmentProducts().length);

  for (const model of [
    "department",
    "facilityDepartmentEntitlement",
    "facilityBilling",
    "employee",
    "user",
    "catalogLogDefinition",
    "facilityCatalogInstall",
    "logAttachment",
    "departmentWorkPlan",
  ]) {
    assert.equal(calls.filter((call) => call.model === model).length, 1, model);
  }
  assert.equal(calls.some((call) => call.model === "knowledgeArticle"), false);
  assert.equal(calls.some((call) => call.model === "operationalTemplate"), false);

  const departmentQuery = calls.find((call) => call.model === "department")?.args as {
    where: { key: { in: string[] } };
  };
  assert.deepEqual(departmentQuery.where.key.in.slice().sort(), [
    "DIETARY",
    "EVS",
    "HEALTHCARE_FOOD_NUTRITION",
    "PLANT",
  ]);
  assert.equal("name" in departmentQuery.where, false);
});

test("work category follows preset ownership metadata, not the display name", () => {
  const plant = getDepartmentProduct("PLANT");
  assert.ok(plant);
  const item = toWorkPresetCatalogItem({
    presetKey: "MECHANICAL_ROOM_ROUND",
    name: "Dietary Servery Opening",
    product: plant,
    facilityInstallCount: 4,
    usageCount: 1,
  });
  assert.equal(item.name, "Dietary Servery Opening");
  assert.equal(item.categoryKey, "PLANT");
  assert.equal(item.categoryLabel, "Facility Plant Operations");
  assert.equal(WORK_PRESET_PRODUCT_KEYS.MECHANICAL_ROOM_ROUND, "PLANT");
});

test("Marketplace browse uses the unified projection once", () => {
  const page = source("src/app/console/(staff)/catalog/page.tsx");
  const browse = source("src/components/harbor-console/marketplace-browse.tsx");
  const detail = source("src/app/console/(staff)/catalog/[stableKey]/page.tsx");
  const actions = source("src/app/console/(staff)/catalog/actions.ts");
  const projection = source("src/lib/harbor-console/console-catalog.ts");
  assert.match(page, /requireHarborStaff\(\)/);
  assert.equal(page.match(/listConsoleCatalogItems/g)?.length, 2);
  assert.doesNotMatch(page, /listHarborCatalogLines/);
  assert.doesNotMatch(browse, /listConsoleCatalogItems/);
  assert.doesNotMatch(browse, /listHarborCatalogLines/);
  assert.doesNotMatch(browse, /listDepartmentProducts/);
  assert.doesNotMatch(`${page}\n${browse}`, /\/console\/catalog\/products\//);
  assert.doesNotMatch(`${page}\n${browse}`, /\/console\/catalog\/work\//);
  assert.match(detail, /loadHarborCatalogDetail/);
  assert.match(actions, /createCatalogDefinition/);
  assert.match(actions, /publishCatalogDefinition/);
  assert.doesNotMatch(projection, /KnowledgeArticle/);
  assert.doesNotMatch(projection, /OperationalTemplate/);
  assert.doesNotMatch(projection, /MarketplaceItem/);
});
