import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { allocateDepartmentKey } from "@/lib/department-admission";
import { customerCurrentDepartmentLabel } from "@/lib/department-products/eligibility";
import { listWorkPlanPresetSummaries } from "@/lib/department-work/work-presets";

import {
  DepartmentProductInstallError,
  deriveFacilityDepartmentCatalog,
  getDepartmentProduct,
  installDepartmentProduct,
  isDepartmentProductOfferedForSale,
  listDepartmentProducts,
  persistableDepartmentProductKey,
  resolveDepartmentProductForInstall,
  resolvePublishedDepartmentProductKeys,
} from "./index";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function mockDb(options: {
  existing?: Array<{ id: string; facilityId: string; key: string; name: string }>;
}) {
  const created: Array<Record<string, unknown>> = [];
  const existing = [...(options.existing ?? [])];

  return {
    created,
    existing,
    prisma: {
      facility: {
        findUnique: async () => ({ id: "fac_terrace" }),
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
          data: { facilityId: string; key: string; name: string };
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

describe("Healthcare Food & Nutrition product identity", () => {
  it("publishes one AVAILABLE customer Product and keeps EVS / Plant in development", () => {
    const catalog = deriveFacilityDepartmentCatalog({
      departments: [],
      entitlements: [],
    });
    assert.deepEqual(
      catalog.map((item) => ({
        productKey: item.productKey,
        name: item.name,
        status: item.releaseStatus,
        description: item.shortDescription,
      })),
      [
        {
          productKey: "HEALTHCARE_FOOD_NUTRITION",
          name: "Healthcare Food & Nutrition",
          status: "AVAILABLE",
          description: "Food and nutrition operations for hospitals and long-term care.",
        },
      ],
    );
    assert.deepEqual(catalog[0]?.customerCapabilities, [
      "Location Functions",
      "Operating Rhythm",
      "Work",
      "Records",
      "Menus",
      "Audit / Reports",
    ]);
    assert.equal(catalog[0]?.industry, "HEALTHCARE");
    assert.deepEqual(catalog[0]?.facilityTypes, ["HOSPITAL", "LONG_TERM_CARE"]);
    assert.equal(catalog[0]?.industryLabel, "Healthcare");
    assert.equal(catalog[0]?.applicabilitySummary, "For hospitals and long-term care.");
    assert.equal(
      catalog.some((item) => item.productKey === "EVS" || item.productKey === "PLANT"),
      false,
    );
    assert.equal(getDepartmentProduct("EVS")?.status, "DEVELOPMENT");
    assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
    assert.equal(listDepartmentProducts().filter((product) => product.status === "AVAILABLE").length, 1);
  });

  it("resolves legacy DIETARY to Healthcare Food & Nutrition without a second sellable Product", () => {
    const alias = getDepartmentProduct("DIETARY");
    const canonical = getDepartmentProduct("HEALTHCARE_FOOD_NUTRITION");
    assert.ok(alias);
    assert.equal(alias.productKey, "HEALTHCARE_FOOD_NUTRITION");
    assert.equal(alias.name, "Healthcare Food & Nutrition");
    assert.equal(alias, canonical);
    assert.equal(isDepartmentProductOfferedForSale(alias), true);
    assert.deepEqual(resolvePublishedDepartmentProductKeys(["DIETARY"]), ["DIETARY"]);
    assert.deepEqual(
      resolvePublishedDepartmentProductKeys(["HEALTHCARE_FOOD_NUTRITION"]),
      ["DIETARY"],
    );
    assert.deepEqual(
      resolvePublishedDepartmentProductKeys(["DIETARY", "HEALTHCARE_FOOD_NUTRITION"]),
      ["DIETARY"],
    );
    assert.equal(persistableDepartmentProductKey("HEALTHCARE_FOOD_NUTRITION"), "DIETARY");
    assert.throws(
      () => resolveDepartmentProductForInstall("DIETARY_2"),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "UNKNOWN_PRODUCT",
    );
  });

  it("keeps a Terrace View installation as Dietary under the renamed Product", async () => {
    const { prisma, created, existing } = mockDb({
      existing: [
        { id: "dept_existing", facilityId: "fac_terrace", key: "DIETARY", name: "Dietary" },
      ],
    });
    const fromLegacy = await installDepartmentProduct({
      facilityId: "fac_terrace",
      productKey: "DIETARY",
      prisma: prisma as never,
    });
    const fromCanonical = await installDepartmentProduct({
      facilityId: "fac_terrace",
      productKey: "HEALTHCARE_FOOD_NUTRITION",
      prisma: prisma as never,
    });

    assert.equal(fromLegacy.id, "dept_existing");
    assert.equal(fromCanonical.id, "dept_existing");
    assert.equal(fromLegacy.created, false);
    assert.equal(fromCanonical.created, false);
    assert.equal(fromLegacy.key, "DIETARY");
    assert.equal(fromLegacy.name, "Dietary");
    assert.equal(fromLegacy.productKey, "HEALTHCARE_FOOD_NUTRITION");
    assert.equal(getDepartmentProduct(fromLegacy.productKey)?.industry, "HEALTHCARE");
    assert.deepEqual(getDepartmentProduct(fromLegacy.productKey)?.facilityTypes, [
      "HOSPITAL",
      "LONG_TERM_CARE",
    ]);
    assert.equal(created.length, 0);
    assert.equal(existing.filter((row) => row.key === "DIETARY").length, 1);
    assert.equal(existing.some((row) => row.key === "HEALTHCARE_FOOD_NUTRITION"), false);
  });

  it("matches an existing Dietary entitlement to the canonical Product once", () => {
    const catalog = deriveFacilityDepartmentCatalog({
      departments: [{ id: "dept_dietary", key: "DIETARY", isActive: true }],
      entitlements: [{ departmentKey: "DIETARY", status: "ACTIVE" }],
      entitlementsEnforced: true,
    });
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0]?.productKey, "HEALTHCARE_FOOD_NUTRITION");
    assert.equal(catalog[0]?.installed, true);
    assert.equal(catalog[0]?.licensed, true);
    assert.equal(catalog[0]?.availableToAdd, false);
    assert.equal(catalog[0]?.departmentId, "dept_dietary");

    const aliasedEntitlement = deriveFacilityDepartmentCatalog({
      departments: [{ id: "dept_dietary", key: "DIETARY", isActive: true }],
      entitlements: [
        { departmentKey: "DIETARY", status: "ACTIVE" },
        { departmentKey: "HEALTHCARE_FOOD_NUTRITION", status: "ACTIVE" },
      ],
      entitlementsEnforced: true,
    });
    assert.equal(aliasedEntitlement.length, 1);
    assert.equal(aliasedEntitlement[0]?.licensed, true);
  });

  it("keeps picker language on the local Department name", () => {
    assert.equal(
      customerCurrentDepartmentLabel({ name: "Dietary", key: "DIETARY" }),
      "Dietary",
    );
    assert.notEqual(
      customerCurrentDepartmentLabel({ name: "Dietary", key: "DIETARY" }),
      "Healthcare Food & Nutrition",
    );
  });

  it("does not duplicate starters under the canonical Product key", () => {
    const fromLegacy = listWorkPlanPresetSummaries("DIETARY");
    const fromCanonical = listWorkPlanPresetSummaries("HEALTHCARE_FOOD_NUTRITION");
    assert.ok(fromLegacy.length > 0);
    assert.deepEqual(
      fromCanonical.map((row) => row.key),
      fromLegacy.map((row) => row.key),
    );
  });

  it("does not rewrite historical operational facts for the Product rename", () => {
    const install = source("src/lib/department-products/install.ts");
    assert.doesNotMatch(install, /department\.update\(/);
    assert.doesNotMatch(install, /key:\s*["']HEALTHCARE_FOOD_NUTRITION["']/);
    const apply = source("src/lib/billing/apply-stripe-event.ts");
    assert.match(apply, /installationKey/);
    assert.doesNotMatch(apply, /department\.updateMany/);
    assert.equal(allocateDepartmentKey("Healthcare Food Nutrition", []), "HEALTHCARE_FOOD_NUTRITION_2");
  });
});
