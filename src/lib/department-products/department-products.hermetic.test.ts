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
  getDepartmentProduct,
  installDepartmentProduct,
  installResolvedDepartmentProduct,
  isDepartmentProductKey,
  listDepartmentProducts,
  listDepartmentProductsForIndustry,
  resolveDepartmentProductForInstall,
  resolveDepartmentProductForInstallationKey,
} from "./index";

const AQUATICS = "AQUATICS";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function mockDb(options: {
  facilityId?: string | null;
  existing?: Array<{ id: string; facilityId: string; key: string; name: string }>;
}) {
  const created: Array<Record<string, unknown>> = [];
  const existing = [...(options.existing ?? [])];
  const facilityId = options.facilityId === undefined ? "fac_1" : options.facilityId;

  return {
    created,
    prisma: {
      facility: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (!facilityId || where.id !== facilityId) return null;
          return { id: facilityId };
        },
      },
      department: {
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
    },
  };
}

describe("Department Product registry", () => {
  it("publishes the healthcare trio with justified fields only", () => {
    const products = listDepartmentProducts();
    assert.deepEqual(
      products.map((product) => product.productKey),
      ["DIETARY", "EVS", "PLANT"],
    );
    assert.deepEqual(
      listDepartmentProductsForIndustry("healthcare").map((product) => product.productKey),
      ["DIETARY", "EVS", "PLANT"],
    );

    const dietary = getDepartmentProduct("DIETARY");
    assert.ok(dietary);
    assert.equal(dietary.name, "Dietary");
    assert.equal(dietary.industry, "healthcare");
    assert.equal(dietary.status, "published");
    assert.equal(dietary.sortOrder, 10);
    assert.equal(dietary.domainCapability, "dietary");
    assert.equal(dietary.starters.cycleStarter, "dietary");

    const evs = getDepartmentProduct("EVS");
    assert.ok(evs);
    assert.equal(evs.name, "Environmental Services");
    assert.equal(evs.domainCapability, "evs");
    assert.equal(evs.starters.cycleStarter, "evs");
    assert.equal(evs.starters.workPresets, true);

    const plant = getDepartmentProduct("PLANT");
    assert.ok(plant);
    assert.equal(plant.name, "Plant Operations");
    assert.equal(plant.domainCapability, "plant");
    assert.equal(plant.starters.workPresets, undefined);
    assert.equal(plant.starters.assignmentRoles, true);
  });

  it("does not treat unknown keys as Department Products", () => {
    assert.equal(isDepartmentProductKey(AQUATICS), false);
    assert.equal(getDepartmentProduct(AQUATICS), null);
    assert.equal(getDepartmentProduct("DIETARY_2"), null);
    assert.equal(resolveDepartmentProductForInstallationKey("DIETARY")?.productKey, "DIETARY");
    assert.equal(resolveDepartmentProductForInstallationKey(AQUATICS), null);
    assert.equal(resolveDepartmentProductForInstallationKey("LAUNDRY"), null);
  });

  it("references existing starters instead of copying them", () => {
    const registry = source("src/lib/department-products/registry.ts");
    assert.doesNotMatch(registry, /Breakfast|SERVERY_OPENING_CHECKS|COOK/);
    assert.ok(listWorkPlanPresetSummaries("DIETARY").length > 0);
    assert.ok(listWorkPlanPresetSummaries("EVS").length > 0);
    assert.deepEqual(listWorkPlanPresetSummaries("PLANT"), []);
    assert.ok(getRolesForDepartment("DIETARY").some((role) => role.key === "COOK"));
    assert.ok(getRolesForDepartment("EVS").some((role) => role.key === "CLEANING_ROUND"));
    assert.ok(getRolesForDepartment("PLANT").some((role) => role.key === "WORK_ORDER_RESPONSE"));
  });
});

describe("Department Product installation", () => {
  it("installs Dietary / EVS / Plant as the existing facility Department keys", async () => {
    const { prisma, created } = mockDb({ facilityId: "fac_terrace" });
    const dietary = await installDepartmentProduct({
      facilityId: "fac_terrace",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    const evs = await installDepartmentProduct({
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
    assert.equal(dietary.productKey, "DIETARY");
    assert.equal(dietary.name, "Dietary");
    assert.equal(dietary.facilityId, "fac_terrace");
    assert.equal(evs.key, "EVS");
    assert.equal(evs.name, "Environmental Services");
    assert.equal(plant.key, "PLANT");
    assert.equal(plant.name, "Plant Operations");
    assert.equal(created.length, 3);
    assert.equal(hasDietaryDomainCapabilities(dietary.key), true);
    assert.equal(hasEvsDomainCapabilities(evs.key), true);
    assert.equal(hasPlantDomainCapabilities(plant.key), true);
    assert.equal(isDepartmentAdmittedToSharedOperations({ isActive: true }), true);
  });

  it("is idempotent and never mints DIETARY_2 at the same facility", async () => {
    const { prisma, created } = mockDb({
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
    assert.notEqual(first.key, "DIETARY_2");
  });

  it("keeps installation facility-scoped", async () => {
    const { prisma } = mockDb({
      facilityId: "fac_b",
      existing: [{ id: "dept_a", facilityId: "fac_a", key: "DIETARY", name: "Dietary" }],
    });
    const installed = await installDepartmentProduct({
      facilityId: "fac_b",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    assert.equal(installed.created, true);
    assert.equal(installed.facilityId, "fac_b");
    assert.equal(installed.key, "DIETARY");
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
      industry: "healthcare",
      status: "published",
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
    assert.match(seed, /installDepartmentProduct/);
    assert.match(seed, /BOOTSTRAP_DEPARTMENT_PRODUCT_KEYS/);
    assert.doesNotMatch(seed, /listDepartmentProducts\(/);
  });
});
