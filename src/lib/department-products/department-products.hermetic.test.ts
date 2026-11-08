import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  allocateDepartmentKey,
  hasDietaryDomainCapabilities,
  hasEvsDomainCapabilities,
  hasPlantDomainCapabilities,
  isDepartmentAdmittedToSharedOperations,
  isDomainDepartmentKey,
} from "@/lib/department-admission";
import {
  isDepartmentAssetOperationsEnabled,
  isDepartmentOperationalCyclesEnabled,
  isDepartmentWorkPlansEnabled,
} from "@/lib/department-operations";
import { listWorkPlanPresetSummaries } from "@/lib/department-work/work-presets";
import { getRolesForDepartment } from "@/lib/scheduling/assignment-roles";

import {
  DepartmentProductInstallError,
  departmentProductOffersMenus,
  getDepartmentProduct,
  installDepartmentProduct,
  installDepartmentProductForInternalDevelopment,
  installResolvedDepartmentProduct,
  isDepartmentProductKey,
  listDepartmentProducts,
  listDepartmentProductsForIndustry,
  resolveDepartmentProductForInstall,
  resolveDepartmentProductForInstallationKey,
} from "./index";

const AQUATICS = "AQUATICS";

type OperatorFixture = {
  id: string;
  departmentId: string;
  organizationId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function mockDb(options: {
  facilityId?: string | null;
  existing?: Array<{ id: string; facilityId: string; key: string; name: string }>;
  operators?: OperatorFixture[];
}) {
  const created: Array<Record<string, unknown>> = [];
  const existing = [...(options.existing ?? [])];
  const facilityId = options.facilityId === undefined ? "fac_1" : options.facilityId;
  const organizationId = `org_${facilityId}`;
  const operators = [...(options.operators ?? [])];
  const operatorCreates: Array<Record<string, unknown>> = [];
  const scopeLookups: Array<{ id: string; facilityId: string }> = [];

  return {
    created,
    operators,
    operatorCreates,
    scopeLookups,
    prisma: {
      facility: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (!facilityId || where.id !== facilityId) return null;
          return { id: facilityId };
        },
      },
      department: {
        findFirst: async ({ where }: { where: { id: string; facilityId: string } }) => {
          scopeLookups.push(where);
          const row = existing.find(
            (item) => item.id === where.id && item.facilityId === where.facilityId,
          );
          if (!row || row.facilityId !== facilityId) return null;
          return {
            ...row,
            facility: { organizationId, timezone: "America/New_York" },
          };
        },
        findUnique: async ({
          where,
        }: {
          where: { facilityId_key: { facilityId: string; key: string } };
        }) => {
          const row = existing.find(
            (item) =>
              item.facilityId === where.facilityId_key.facilityId &&
              item.key === where.facilityId_key.key,
          );
          return row ?? null;
        },
        create: async ({
          data,
        }: {
          data: {
            facilityId: string;
            key: string;
            name: string;
            sortOrder: number;
            isActive: boolean;
            showInEmployeeApp: boolean;
          };
        }) => {
          const row = {
            id: `dept_${data.key}_${created.length + 1}`,
            facilityId: data.facilityId,
            key: data.key,
            name: data.name,
          };
          created.push(data);
          existing.push(row);
          return row;
        },
      },
      departmentOperatorRelationship: {
        findFirst: async ({ where }: { where: { departmentId: string } }) =>
          operators
            .filter((row) => row.departmentId === where.departmentId)
            .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0] ?? null,
        create: async ({
          data,
        }: {
          data: Omit<OperatorFixture, "id"> & {
            createdByUserId: string | null;
            notes: string;
          };
        }) => {
          const row = { ...data, id: `operator_${operators.length + 1}` };
          operatorCreates.push(data);
          operators.push(row);
          return { id: row.id };
        },
      },
    },
  };
}

describe("Department Product registry", () => {
  it("publishes the healthcare trio with justified fields only", () => {
    const products = listDepartmentProducts();
    assert.deepEqual(
      products.map((product) => product.productKey),
      ["HEALTHCARE_FOOD_NUTRITION", "EVS", "PLANT"],
    );
    assert.deepEqual(
      listDepartmentProductsForIndustry("HEALTHCARE").map((product) => product.productKey),
      ["HEALTHCARE_FOOD_NUTRITION", "EVS", "PLANT"],
    );

    const dietary = getDepartmentProduct("DIETARY");
    assert.ok(dietary);
    assert.equal(dietary.productKey, "HEALTHCARE_FOOD_NUTRITION");
    assert.equal(dietary.name, "Food and Nutrition");
    assert.equal(dietary.installationKey, "DIETARY");
    assert.equal(dietary.defaultDepartmentName, "Food and Nutrition");
    assert.equal(dietary.industry, "HEALTHCARE");
    assert.deepEqual(dietary.facilityTypes, ["HOSPITAL", "LONG_TERM_CARE"]);
    assert.equal(dietary.status, "AVAILABLE");
    assert.equal(dietary.versionLabel, null);
    assert.equal(dietary.releasedOn, null);
    assert.equal(dietary.sortOrder, 10);
    assert.equal(dietary.domainCapability, "dietary");
    assert.equal(dietary.starters.cycleStarter, "dietary");
    assert.equal(dietary.starters.menus, true);

    const evs = getDepartmentProduct("EVS");
    assert.ok(evs);
    assert.equal(evs.name, "Environmental Services");
    assert.equal(evs.industry, "HEALTHCARE");
    assert.deepEqual(evs.facilityTypes, ["HOSPITAL", "LONG_TERM_CARE"]);
    assert.equal(evs.status, "DEVELOPMENT");
    assert.equal(evs.versionLabel, null);
    assert.equal(evs.releasedOn, null);
    assert.equal(evs.domainCapability, "evs");
    assert.equal(evs.starters.cycleStarter, "evs");
    assert.equal(evs.starters.workPresets, true);

    const plant = getDepartmentProduct("PLANT");
    assert.ok(plant);
    assert.equal(plant.name, "Facility Plant Operations");
    assert.equal(plant.defaultDepartmentName, "Plant Operations");
    assert.equal(plant.industry, "HEALTHCARE");
    assert.deepEqual(plant.facilityTypes, ["HOSPITAL", "LONG_TERM_CARE"]);
    assert.equal(plant.status, "AVAILABLE");
    assert.equal(plant.versionLabel, "1.0");
    assert.equal(plant.releasedOn, "2026-10-07");
    assert.equal(plant.domainCapability, "plant");
    assert.equal(plant.starters.workPresets, true);
    assert.equal(plant.starters.assignmentRoles, true);
  });

  it("does not treat unknown keys as Department Products", () => {
    assert.equal(isDepartmentProductKey(AQUATICS), false);
    assert.equal(getDepartmentProduct(AQUATICS), null);
    assert.equal(getDepartmentProduct("DIETARY_2"), null);
    assert.equal(
      resolveDepartmentProductForInstallationKey("DIETARY")?.productKey,
      "HEALTHCARE_FOOD_NUTRITION",
    );
    assert.equal(
      resolveDepartmentProductForInstallationKey("HEALTHCARE_FOOD_NUTRITION")?.productKey,
      "HEALTHCARE_FOOD_NUTRITION",
    );
    assert.equal(resolveDepartmentProductForInstallationKey(AQUATICS), null);
    assert.equal(resolveDepartmentProductForInstallationKey("LAUNDRY"), null);
  });

  it("references existing starters instead of copying them", () => {
    const registry = source("src/lib/department-products/registry.ts");
    assert.doesNotMatch(registry, /Breakfast|SERVERY_OPENING_CHECKS|COOK/);
    assert.ok(listWorkPlanPresetSummaries("DIETARY").length > 0);
    assert.ok(listWorkPlanPresetSummaries("EVS").length > 0);
    assert.equal(listWorkPlanPresetSummaries("PLANT").length, 4);
    assert.ok(getRolesForDepartment("DIETARY").some((role) => role.key === "COOK"));
    assert.ok(getRolesForDepartment("EVS").some((role) => role.key === "CLEANING_ROUND"));
    assert.ok(getRolesForDepartment("PLANT").some((role) => role.key === "WORK_ORDER_RESPONSE"));
  });
});

describe("Department Product installation", () => {
  it("installs Dietary and Plant for customers and EVS only through internal development", async () => {
    const { prisma, created, operators } = mockDb({ facilityId: "fac_terrace" });
    const dietary = await installDepartmentProduct({
      facilityId: "fac_terrace",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    await assert.rejects(
      () =>
        installDepartmentProduct({
          facilityId: "fac_terrace",
          productKey: "EVS",
          prisma: prisma as never,
        }),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "UNAVAILABLE_PRODUCT",
    );
    assert.equal(created.length, 1, "rejected customer EVS install creates no Department");
    assert.equal(operators.length, 1, "rejected customer EVS install creates no operator");
    const evs = await installDepartmentProductForInternalDevelopment({
      facilityId: "fac_terrace",
      productKey: "EVS",
      prisma: prisma as never,
    });
    const plant = await installDepartmentProduct({
      facilityId: "fac_terrace",
      productKey: "PLANT",
      prisma: prisma as never,
    });

    assert.equal(dietary.created, true);
    assert.equal(dietary.key, "DIETARY");
    assert.equal(dietary.productKey, "HEALTHCARE_FOOD_NUTRITION");
    assert.equal(dietary.name, "Food and Nutrition");
    assert.equal(dietary.facilityId, "fac_terrace");
    assert.equal(evs.key, "EVS");
    assert.equal(evs.name, "Environmental Services");
    assert.equal(plant.key, "PLANT");
    assert.equal(plant.name, "Plant Operations");
    assert.equal(created.length, 3);
    assert.deepEqual(operators.map((row) => row.departmentId), [dietary.id, evs.id, plant.id]);
    assert.ok(operators.every((row) => row.organizationId === "org_fac_terrace"));
    assert.ok(operators.every((row) => row.effectiveFrom instanceof Date && row.effectiveTo === null));
    assert.equal(hasDietaryDomainCapabilities(dietary.key), true);
    assert.equal(hasEvsDomainCapabilities(evs.key), true);
    assert.equal(hasPlantDomainCapabilities(plant.key), true);
    assert.equal(isDepartmentAdmittedToSharedOperations({ isActive: true }), true);
  });

  it("is idempotent and never mints DIETARY_2 at the same facility", async () => {
    const { prisma, created, operators, operatorCreates } = mockDb({
      facilityId: "fac_1",
      existing: [
        { id: "dept_existing", facilityId: "fac_1", key: "DIETARY", name: "Terrace View Dietary" },
      ],
    });
    const first = await installDepartmentProduct({
      facilityId: "fac_1",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    const second = await installDepartmentProduct({
      facilityId: "fac_1",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    assert.equal(first.created, false);
    assert.equal(first.id, "dept_existing");
    assert.equal(first.name, "Terrace View Dietary");
    assert.equal(second.id, "dept_existing");
    assert.equal(second.created, false);
    assert.equal(created.length, 0);
    assert.equal(operators.length, 1);
    assert.equal(operatorCreates.length, 1, "retry does not duplicate the initial operator");
    assert.equal(operators[0]?.departmentId, first.id);
    assert.equal(operators[0]?.organizationId, "org_fac_1");
    assert.notEqual(first.key, "DIETARY_2");
  });

  it("reuses a fresh installation through its canonical Product alias without duplicating its operator", async () => {
    const { prisma, created, operators } = mockDb({ facilityId: "fac_1" });
    const first = await installDepartmentProduct({
      facilityId: "fac_1",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    const retry = await installDepartmentProduct({
      facilityId: "fac_1",
      productKey: "HEALTHCARE_FOOD_NUTRITION",
      prisma: prisma as never,
    });
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.id, first.id);
    assert.equal(retry.key, "DIETARY");
    assert.equal(created.length, 1);
    assert.equal(operators.length, 1);
    assert.equal(operators[0]?.departmentId, first.id);
  });

  it("preserves an existing contracted operator on installation replay", async () => {
    const operator: OperatorFixture = {
      id: "operator_contracted",
      departmentId: "dept_existing",
      organizationId: "org_contractor",
      effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      effectiveTo: null,
    };
    const { prisma, created, operators, operatorCreates } = mockDb({
      existing: [{ id: "dept_existing", facilityId: "fac_1", key: "DIETARY", name: "Dietary" }],
      operators: [operator],
    });
    const installed = await installDepartmentProduct({
      facilityId: "fac_1",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    assert.equal(installed.id, "dept_existing");
    assert.equal(installed.created, false);
    assert.equal(created.length, 0);
    assert.equal(operatorCreates.length, 0);
    assert.deepEqual(operators, [operator]);
  });

  it("keeps installation facility-scoped", async () => {
    const { prisma, operators, scopeLookups } = mockDb({
      facilityId: "fac_b",
      existing: [{ id: "dept_a", facilityId: "fac_a", key: "DIETARY", name: "Dietary" }],
      operators: [{
        id: "operator_a",
        departmentId: "dept_a",
        organizationId: "org_fac_a",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        effectiveTo: null,
      }],
    });
    const installed = await installDepartmentProduct({
      facilityId: "fac_b",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    assert.equal(installed.created, true);
    assert.equal(installed.facilityId, "fac_b");
    assert.equal(installed.key, "DIETARY");
    assert.notEqual(installed.id, "dept_a");
    assert.deepEqual(scopeLookups, [{ id: installed.id, facilityId: "fac_b" }]);
    assert.equal(operators.length, 2);
    assert.equal(operators[0]?.organizationId, "org_fac_a");
    assert.equal(operators[1]?.departmentId, installed.id);
    assert.equal(operators[1]?.organizationId, "org_fac_b");
  });

  it("rejects unknown, blank, and missing-facility installs", async () => {
    const { prisma } = mockDb({ facilityId: "fac_1" });
    await assert.rejects(
      () =>
        installDepartmentProduct({
          facilityId: "fac_1",
          productKey: AQUATICS,
          prisma: prisma as never,
        }),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "UNKNOWN_PRODUCT",
    );
    await assert.rejects(
      () =>
        installDepartmentProduct({
          facilityId: "fac_1",
          productKey: "  ",
          prisma: prisma as never,
        }),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "INVALID_INPUT",
    );
    await assert.rejects(
      () =>
        installDepartmentProduct({
          facilityId: "missing",
          productKey: "DIETARY",
          prisma: prisma as never,
        }),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "FACILITY_NOT_FOUND",
    );
    assert.throws(
      () => resolveDepartmentProductForInstall(AQUATICS),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "UNKNOWN_PRODUCT",
    );
  });

  it("can install a test-only product that has no domain module", async () => {
    const { prisma, created } = mockDb({ facilityId: "fac_1" });
    const testProduct = {
      productKey: "TEST_SHARED",
      name: "Shared Test Product",
      industry: "HEALTHCARE",
      facilityTypes: [] as const,
      status: "AVAILABLE",
      sortOrder: 500,
      domainCapability: null,
      starters: {},
    } as const;

    const installed = await installResolvedDepartmentProduct({
      facilityId: "fac_1",
      product: testProduct,
      prisma: prisma as never,
    });

    assert.equal(installed.key, "TEST_SHARED");
    assert.equal(installed.created, true);
    assert.equal(created[0]?.key, "TEST_SHARED");
    assert.equal(isDepartmentProductKey("TEST_SHARED"), false);
    assert.equal(isDomainDepartmentKey("TEST_SHARED"), false);
    assert.equal(hasDietaryDomainCapabilities("TEST_SHARED"), false);
    assert.equal(hasEvsDomainCapabilities("TEST_SHARED"), false);
    assert.equal(hasPlantDomainCapabilities("TEST_SHARED"), false);
    assert.equal(isDepartmentAdmittedToSharedOperations({ isActive: true }), true);
    assert.equal(isDepartmentOperationalCyclesEnabled("TEST_SHARED"), true);
    assert.equal(isDepartmentWorkPlansEnabled("TEST_SHARED"), true);
    assert.equal(isDepartmentAssetOperationsEnabled("TEST_SHARED"), true);
    assert.equal(getDepartmentProduct("TEST_SHARED"), null);
  });
});

describe("Department Product Menus capability", () => {
  it("offers Menus for Food and Nutrition without encoding Menu ownership as DIETARY", () => {
    assert.equal(departmentProductOffersMenus("DIETARY"), true);
    assert.equal(departmentProductOffersMenus("HEALTHCARE_FOOD_NUTRITION"), true);
    assert.equal(departmentProductOffersMenus("PLANT"), false);
    assert.equal(departmentProductOffersMenus("EVS"), false);
    assert.equal(departmentProductOffersMenus(AQUATICS), false);
    assert.equal(departmentProductOffersMenus("DIETARY_2"), false);
  });
});

describe("Department Product vs admission", () => {
  it("does not make the registry the shared-engine admission allowlist", () => {
    assert.equal(isDepartmentAdmittedToSharedOperations({ isActive: true }), true);
    assert.equal(isDepartmentProductKey(AQUATICS), false);
    assert.equal(isDepartmentOperationalCyclesEnabled(AQUATICS), true);
    assert.equal(hasDietaryDomainCapabilities(AQUATICS), false);
    assert.equal(isDepartmentProductKey(allocateDepartmentKey("Dietary", [])), false);
    assert.equal(isDomainDepartmentKey(allocateDepartmentKey("Dietary", [])), false);

    const admission = source("src/lib/department-admission.ts");
    assert.match(admission, /isActive/);
    assert.doesNotMatch(admission, /from ["']@\/lib\/department-products/);
    assert.doesNotMatch(admission, /listDepartmentProducts/);
    assert.doesNotMatch(admission, /getDepartmentProduct/);

    const install = source("src/lib/department-products/install.ts");
    assert.doesNotMatch(install, /isDepartmentAdmittedToSharedOperations/);
    assert.match(install, /Does not create billing entitlements/);
  });

  it("does not add AQUATICS to production product files", () => {
    for (const relative of [
      "src/lib/department-products/registry.ts",
      "src/lib/department-products/install.ts",
      "src/lib/department-products/index.ts",
      "src/lib/department-products/facility-catalog.ts",
      "src/lib/department-products/reconcile.ts",
      "src/lib/ensure-default-departments.ts",
    ]) {
      assert.doesNotMatch(source(relative), /AQUATICS/, relative);
    }
  });

  it("routes bootstrap seeding through the install primitive without auto-seeding future products", () => {
    const seed = source("src/lib/ensure-default-departments.ts");
    assert.match(seed, /installDepartmentProductForInternalDevelopment/);
    assert.match(seed, /BOOTSTRAP_DEPARTMENT_PRODUCT_KEYS/);
    assert.doesNotMatch(seed, /listDepartmentProducts\(/);
  });
});
