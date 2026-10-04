import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { isDepartmentAdmittedToSharedOperations } from "@/lib/department-admission";
import { nextOnboardingStep, ONBOARDING_STEPS } from "@/lib/onboarding";

import {
  canPurchaseDepartmentProducts,
  DepartmentProductInstallError,
  deriveFacilityDepartmentCatalog,
  installDepartmentsForActiveEntitlements,
  installDepartmentProduct,
  listDepartmentProducts,
  resolvePublishedDepartmentProductKeys,
  shouldInstallLicensedDepartmentProducts,
} from "./index";

const AQUATICS = "AQUATICS";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function mockInstallDb(options: {
  facilityId?: string | null;
  existing?: Array<{ id: string; facilityId: string; key: string; name: string }>;
}) {
  const created: Array<Record<string, unknown>> = [];
  const existing = [...(options.existing ?? [])];
  const facilityId = options.facilityId === undefined ? "fac_1" : options.facilityId;
  const entitlementLinks: Array<{ departmentKey: string; departmentId: string }> = [];

  return {
    created,
    existing,
    entitlementLinks,
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
          return (
            existing.find(
              (item) =>
                item.facilityId === where.facilityId_key.facilityId &&
                item.key === where.facilityId_key.key,
            ) ?? null
          );
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
      facilityBilling: {
        findUnique: async () => ({ id: "bill_1" }),
      },
      facilityDepartmentEntitlement: {
        updateMany: async ({
          where,
          data,
        }: {
          where: { departmentKey: string };
          data: { departmentId: string };
        }) => {
          entitlementLinks.push({
            departmentKey: where.departmentKey,
            departmentId: data.departmentId,
          });
          return { count: 1 };
        },
      },
    },
  };
}

describe("Facility Department Product catalog", () => {
  it("shows AVAILABLE registry products and hides DEVELOPMENT ones", () => {
    const development = {
      ...listDepartmentProducts()[0]!,
      productKey: "DRAFT_X" as "DIETARY",
      name: "Draft Product",
      status: "DEVELOPMENT" as const,
    };
    const catalog = deriveFacilityDepartmentCatalog({
      products: [...listDepartmentProducts(), development],
      departments: [],
      entitlements: [],
    });
    assert.deepEqual(
      catalog.map((item) => item.productKey),
      ["DIETARY"],
    );
    assert.equal(
      catalog.every((item) => item.availableToAdd && !item.installed && !item.licensed),
      true,
    );
    assert.equal(
      catalog.some((item) => item.productKey === "DRAFT_X" || item.productKey === "EVS" || item.productKey === "PLANT"),
      false,
    );
  });

  it("identifies installed, licensed, and available-to-add AVAILABLE products", () => {
    const catalog = deriveFacilityDepartmentCatalog({
      departments: [
        { id: "dept_dietary", key: "DIETARY", isActive: true },
        { id: "dept_evs", key: "EVS", isActive: false },
      ],
      entitlements: [
        { departmentKey: "DIETARY", status: "ACTIVE" },
        { departmentKey: "PLANT", status: "REVOKED" },
      ],
      entitlementsEnforced: true,
    });
    const byKey = Object.fromEntries(catalog.map((item) => [item.productKey, item]));
    assert.equal(byKey.DIETARY?.installed, true);
    assert.equal(byKey.DIETARY?.licensed, true);
    assert.equal(byKey.DIETARY?.operable, true);
    assert.equal(byKey.DIETARY?.availableToAdd, false);
    assert.equal(byKey.DIETARY?.departmentActive, true);
    assert.equal(byKey.EVS, undefined);
    assert.equal(byKey.PLANT, undefined);
  });
});

describe("Published Department Product selection", () => {
  it("accepts Dietary only and rejects unpublished or blank keys", () => {
    assert.deepEqual(resolvePublishedDepartmentProductKeys(["DIETARY"]), ["DIETARY"]);
    assert.throws(
      () => resolvePublishedDepartmentProductKeys([" EVS ", "DIETARY", "EVS"]),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "UNAVAILABLE_PRODUCT",
    );
    assert.throws(
      () => resolvePublishedDepartmentProductKeys([AQUATICS]),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "UNKNOWN_PRODUCT",
    );
    assert.throws(
      () => resolvePublishedDepartmentProductKeys(["LAUNDRY"]),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "UNKNOWN_PRODUCT",
    );
    assert.throws(
      () => resolvePublishedDepartmentProductKeys([]),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "INVALID_INPUT",
    );
  });

  it("installs only Dietary after a successful Dietary license", async () => {
    const { prisma, created, existing } = mockInstallDb({ facilityId: "fac_terrace" });
    const installed = await installDepartmentsForActiveEntitlements({
      facilityId: "fac_terrace",
      productKeys: ["DIETARY"],
      prisma: prisma as never,
    });
    assert.deepEqual(
      installed.map((row) => row.key),
      ["DIETARY"],
    );
    assert.deepEqual(
      created.map((row) => row.key),
      ["DIETARY"],
    );
    assert.equal(
      existing.some((row) => row.key === "EVS" || row.key === "PLANT"),
      false,
    );
  });

  it("skips DEVELOPMENT EVS keys during reconcile", async () => {
    const { prisma, created } = mockInstallDb({ facilityId: "fac_2" });
    await installDepartmentsForActiveEntitlements({
      facilityId: "fac_2",
      productKeys: ["DIETARY", "EVS"],
      prisma: prisma as never,
    });
    assert.deepEqual(
      created.map((row) => row.key),
      ["DIETARY"],
    );
  });
});

describe("Entitlement then install reconciliation", () => {
  it("does not install on abandoned or incomplete payment", () => {
    assert.equal(shouldInstallLicensedDepartmentProducts("INCOMPLETE"), false);
    assert.equal(shouldInstallLicensedDepartmentProducts("CANCELED"), false);
    assert.equal(shouldInstallLicensedDepartmentProducts("ACTIVE"), true);
    assert.equal(shouldInstallLicensedDepartmentProducts("PAST_DUE"), true);
  });

  it("reconciles an ACTIVE entitlement when the Department row is missing", async () => {
    const { prisma, created, existing } = mockInstallDb({ facilityId: "fac_1" });
    const first = await installDepartmentsForActiveEntitlements({
      facilityId: "fac_1",
      productKeys: ["DIETARY"],
      prisma: prisma as never,
    });
    const retry = await installDepartmentsForActiveEntitlements({
      facilityId: "fac_1",
      productKeys: ["DIETARY"],
      prisma: prisma as never,
    });
    assert.equal(first[0]?.created, true);
    assert.equal(retry[0]?.created, false);
    assert.equal(retry[0]?.id, first[0]?.id);
    assert.equal(created.length, 1);
    assert.equal(existing.filter((row) => row.key === "DIETARY").length, 1);
  });

  it("reuses an existing DIETARY row and never mints DIETARY_2", async () => {
    const { prisma, created } = mockInstallDb({
      facilityId: "fac_1",
      existing: [{ id: "dept_existing", facilityId: "fac_1", key: "DIETARY", name: "Terrace Dietary" }],
    });
    const installed = await installDepartmentsForActiveEntitlements({
      facilityId: "fac_1",
      productKeys: ["DIETARY"],
      prisma: prisma as never,
    });
    assert.equal(installed[0]?.id, "dept_existing");
    assert.equal(installed[0]?.created, false);
    assert.equal(created.length, 0);
    const again = await installDepartmentProduct({
      facilityId: "fac_1",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    assert.equal(again.id, "dept_existing");
    assert.notEqual(again.key, "DIETARY_2");
  });

  it("skips unpublished keys during reconcile", async () => {
    const { prisma, created } = mockInstallDb({ facilityId: "fac_1" });
    const installed = await installDepartmentsForActiveEntitlements({
      facilityId: "fac_1",
      productKeys: [AQUATICS, "DIETARY"],
      prisma: prisma as never,
    });
    assert.deepEqual(
      installed.map((row) => row.key),
      ["DIETARY"],
    );
    assert.equal(created.some((row) => row.key === AQUATICS), false);
  });
});

describe("Setup journey order", () => {
  it("places Department Products before commercial setup and locations", () => {
    assert.deepEqual(ONBOARDING_STEPS, [
      "facility",
      "managers",
      "departments",
      "billing",
      "locations",
      "complete",
    ]);
    assert.equal(nextOnboardingStep("managers"), "departments");
    assert.equal(nextOnboardingStep("departments"), "billing");
    assert.equal(nextOnboardingStep("billing"), "locations");
    assert.equal(nextOnboardingStep("locations"), "complete");
  });
});

describe("Purchase authority and customer bootstrap retirement", () => {
  it("allows only Facility Administrators to purchase Department Products", () => {
    assert.equal(canPurchaseDepartmentProducts("FACILITY_ADMINISTRATOR"), true);
    assert.equal(canPurchaseDepartmentProducts("GM"), false);
    assert.equal(canPurchaseDepartmentProducts("MANAGER"), false);
    assert.equal(canPurchaseDepartmentProducts("SUPERVISOR"), false);
    assert.equal(canPurchaseDepartmentProducts("STAFF"), false);
  });

  it("does not auto-install the trio from normal customer routes", () => {
    for (const relative of [
      "src/app/(protected)/admin/departments/page.tsx",
      "src/app/(protected)/employees/layout.tsx",
      "src/app/(protected)/employees/page.tsx",
      "src/app/(protected)/department/settings/[departmentId]/page.tsx",
      "src/app/api/onboarding/locations/route.ts",
      "src/components/setup-wizard.tsx",
    ]) {
      const text = source(relative);
      assert.doesNotMatch(text, /ensureDefaultDepartments/, relative);
    }
    assert.match(source("src/app/api/onboarding/locations/route.ts"), /loadInstalledBootstrapDepartmentIds/);
    assert.doesNotMatch(source("src/app/(protected)/admin/departments/page.tsx"), /CreateDepartmentForm/);
    assert.match(source("src/app/(protected)/admin/departments/page.tsx"), /DepartmentMarketplace/);
    assert.match(source("src/app/(protected)/admin/departments/page.tsx"), /add-department-button/);
  });

  it("installs after entitlement on the Stripe sync path only when payment succeeded", () => {
    const apply = source("src/lib/billing/apply-stripe-event.ts");
    assert.match(apply, /installDepartmentsForActiveEntitlements/);
    assert.match(apply, /shouldInstallLicensedDepartmentProducts/);
    const checkout = source("src/app/(protected)/admin/billing/actions.ts");
    assert.match(checkout, /resolvePublishedDepartmentProductKeys/);
    assert.doesNotMatch(checkout, /Select departments that belong to this facility/);
    const add = source("src/lib/billing/add-departments.ts");
    assert.match(add, /resolvePublishedDepartmentProductKeys/);
    assert.doesNotMatch(add, /Select departments that belong to this facility/);
  });

  it("keeps open department admission separate from the Product Registry", () => {
    assert.equal(isDepartmentAdmittedToSharedOperations({ isActive: true }), true);
    const admission = source("src/lib/department-admission.ts");
    assert.doesNotMatch(admission, /from ["']@\/lib\/department-products/);
    assert.doesNotMatch(source("src/lib/department-products/facility-catalog.ts"), /isDepartmentAdmittedToSharedOperations/);
  });
});
