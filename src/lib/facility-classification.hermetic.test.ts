import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  deriveFacilityDepartmentCatalog,
  getDepartmentProduct,
  listDepartmentProducts,
} from "@/lib/department-products";

import {
  loadFacilityClassification,
  productAppliesToFacility,
  resolveFacilityClassification,
} from "./facility-classification";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("Facility classification", () => {
  it("reuses Organization.organizationType for Terrace View Healthcare / Long-Term Care", async () => {
    assert.deepEqual(resolveFacilityClassification({ organizationType: "LONG_TERM_CARE" }), {
      industry: "HEALTHCARE",
      facilityType: "LONG_TERM_CARE",
    });
    assert.deepEqual(resolveFacilityClassification({ organizationType: "HOSPITAL" }), {
      industry: "HEALTHCARE",
      facilityType: "HOSPITAL",
    });
    assert.deepEqual(
      resolveFacilityClassification({
        organizationType: "HEALTHCARE_SYSTEM",
        vocabularyProfile: "hospital",
      }),
      { industry: "HEALTHCARE", facilityType: "HOSPITAL" },
    );
    assert.deepEqual(resolveFacilityClassification({ organizationType: "HOSPITALITY" }), {
      industry: "OTHER",
      facilityType: "OTHER",
    });
    assert.deepEqual(resolveFacilityClassification({}), {
      industry: "OTHER",
      facilityType: "OTHER",
    });

    const terraceView = await loadFacilityClassification(
      {
        facility: {
          findUnique: async () => ({
            vocabularyProfile: null,
            organization: { organizationType: "LONG_TERM_CARE" },
          }),
        },
      } as never,
      "fac_terrace",
    );
    assert.deepEqual(terraceView, {
      industry: "HEALTHCARE",
      facilityType: "LONG_TERM_CARE",
    });

    const seed = source("prisma/seed.mjs");
    assert.match(seed, /organizationType:\s*"LONG_TERM_CARE"/);
    assert.equal((seed.match(/organizationType:\s*"LONG_TERM_CARE"/g) ?? []).length >= 2, true);
  });

  it("does not treat null vocabulary as Long-Term Care", () => {
    assert.deepEqual(
      resolveFacilityClassification({ organizationType: "OTHER", vocabularyProfile: null }),
      { industry: "OTHER", facilityType: "OTHER" },
    );
    assert.deepEqual(resolveFacilityClassification({ vocabularyProfile: "ltc" }), {
      industry: "HEALTHCARE",
      facilityType: "LONG_TERM_CARE",
    });
  });
});

describe("Department Product applicability", () => {
  it("tags Healthcare Food & Nutrition for Healthcare hospitals and long-term care", () => {
    const product = getDepartmentProduct("HEALTHCARE_FOOD_NUTRITION");
    assert.ok(product);
    assert.equal(product.industry, "HEALTHCARE");
    assert.deepEqual(product.facilityTypes, ["HOSPITAL", "LONG_TERM_CARE"]);
    assert.equal(
      listDepartmentProducts().filter((row) =>
        /food|nutrition|dietary/i.test(`${row.productKey} ${row.name}`),
      ).length,
      1,
    );
    assert.equal(getDepartmentProduct("HOSPITAL_FOOD_NUTRITION"), null);
    assert.equal(getDepartmentProduct("LONG_TERM_CARE_FOOD_NUTRITION"), null);
    assert.equal(getDepartmentProduct("DIETARY")?.productKey, "HEALTHCARE_FOOD_NUTRITION");
  });

  it("keeps Marketplace visibility on release state, not industry applicability", () => {
    const terraceView = resolveFacilityClassification({ organizationType: "LONG_TERM_CARE" });
    const hospitality = resolveFacilityClassification({ organizationType: "HOSPITALITY" });
    const hfn = getDepartmentProduct("HEALTHCARE_FOOD_NUTRITION");
    const evs = getDepartmentProduct("EVS");
    const plant = getDepartmentProduct("PLANT");
    assert.ok(hfn && evs && plant);

    assert.equal(
      productAppliesToFacility({
        productIndustry: hfn.industry,
        productFacilityTypes: hfn.facilityTypes,
        facility: terraceView,
      }),
      true,
    );
    assert.equal(
      productAppliesToFacility({
        productIndustry: evs.industry,
        productFacilityTypes: evs.facilityTypes,
        facility: terraceView,
      }),
      true,
    );
    assert.equal(
      productAppliesToFacility({
        productIndustry: hfn.industry,
        productFacilityTypes: hfn.facilityTypes,
        facility: hospitality,
      }),
      false,
    );

    const catalog = deriveFacilityDepartmentCatalog({
      departments: [{ id: "dept_dietary", key: "DIETARY", isActive: true }],
      entitlements: [],
    });
    assert.deepEqual(
      catalog.map((item) => ({
        productKey: item.productKey,
        industry: item.industry,
        industryLabel: item.industryLabel,
        facilityTypes: [...item.facilityTypes],
        facilityTypeLabels: [...item.facilityTypeLabels],
        applicabilitySummary: item.applicabilitySummary,
        releaseStatus: item.releaseStatus,
      })),
      [
        {
          productKey: "HEALTHCARE_FOOD_NUTRITION",
          industry: "HEALTHCARE",
          industryLabel: "Healthcare",
          facilityTypes: ["HOSPITAL", "LONG_TERM_CARE"],
          facilityTypeLabels: ["Hospital", "Long-Term Care"],
          applicabilitySummary: "For hospitals and long-term care.",
          releaseStatus: "AVAILABLE",
        },
        {
          productKey: "PLANT",
          industry: "HEALTHCARE",
          industryLabel: "Healthcare",
          facilityTypes: ["HOSPITAL", "LONG_TERM_CARE"],
          facilityTypeLabels: ["Hospital", "Long-Term Care"],
          applicabilitySummary: "For hospitals and long-term care.",
          releaseStatus: "AVAILABLE",
        },
      ],
    );
    assert.equal(catalog.some((item) => item.productKey === "EVS"), false);
    assert.equal(evs.status, "DEVELOPMENT");
    assert.equal(plant.status, "AVAILABLE");

    const catalogSource = source("src/lib/department-products/facility-catalog.ts");
    assert.doesNotMatch(catalogSource, /productAppliesToFacility/);
    assert.doesNotMatch(catalogSource, /loadFacilityClassification/);

    const marketplace = source("src/app/(protected)/admin/departments/department-marketplace.tsx");
    assert.match(marketplace, /industryLabel/);
    assert.match(marketplace, /applicabilitySummary/);
    assert.doesNotMatch(marketplace, /Hospitality/);
    assert.doesNotMatch(marketplace, /Education/);
  });
});
