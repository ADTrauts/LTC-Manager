import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  deriveFacilityDepartmentCatalog,
  evaluateCustomerDepartmentOperability,
  evaluateDepartmentForAudience,
  getDepartmentProduct,
  hasInternalDepartmentProductAccess,
  listDepartmentProducts,
  marketplaceDenialReason,
  resolveCommercialEntitlement,
  resolvePublishedDepartmentProductKeys,
  selectCustomerOperableDepartments,
  DepartmentProductInstallError,
} from "./index";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("Department Product release visibility", () => {
  it("keeps Dietary AVAILABLE and EVS / Plant DEVELOPMENT", () => {
    assert.equal(getDepartmentProduct("DIETARY")?.status, "AVAILABLE");
    assert.equal(getDepartmentProduct("EVS")?.status, "DEVELOPMENT");
    assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
    assert.deepEqual(
      listDepartmentProducts().map((product) => product.productKey),
      ["DIETARY", "EVS", "PLANT"],
    );
  });

  it("returns only Dietary from the customer marketplace catalog", () => {
    const catalog = deriveFacilityDepartmentCatalog({
      departments: [
        { id: "dept_dietary", key: "DIETARY", isActive: true },
        { id: "dept_evs", key: "EVS", isActive: true },
        { id: "dept_plant", key: "PLANT", isActive: true },
      ],
      entitlements: [{ departmentKey: "DIETARY", status: "ACTIVE" }],
      entitlementsEnforced: true,
    });
    assert.deepEqual(
      catalog.map((item) => item.productKey),
      ["DIETARY"],
    );
    assert.equal(catalog[0]?.installed, true);
    assert.equal(catalog[0]?.availableToAdd, false);
  });

  it("does not let legacy EVS / Plant rows into the customer operable set", () => {
    const operable = selectCustomerOperableDepartments(
      [
        { id: "dept_dietary", key: "DIETARY", isActive: true },
        { id: "dept_evs", key: "EVS", isActive: true },
        { id: "dept_plant", key: "PLANT", isActive: true },
      ],
      {
        entitlements: [{ departmentKey: "DIETARY", status: "ACTIVE" }],
        billingStatus: "ACTIVE",
        entitlementsEnforced: true,
      },
    );
    assert.deepEqual(
      operable.map((row) => row.key),
      ["DIETARY"],
    );
  });
});

describe("Marketplace offer rules", () => {
  it("offers Add for AVAILABLE products that are not installed", () => {
    assert.equal(
      marketplaceDenialReason({ releaseStatus: "AVAILABLE", installed: false }),
      "add",
    );
  });

  it("shows Installed for AVAILABLE products that are already installed", () => {
    assert.equal(
      marketplaceDenialReason({ releaseStatus: "AVAILABLE", installed: true }),
      "installed",
    );
  });

  it("hides DEVELOPMENT products entirely", () => {
    assert.equal(
      marketplaceDenialReason({ releaseStatus: "DEVELOPMENT", installed: true }),
      "hidden",
    );
  });

  it("does not offer RETIRED products for new installation", () => {
    assert.equal(
      marketplaceDenialReason({ releaseStatus: "RETIRED", installed: false }),
      "retired",
    );
    const catalog = deriveFacilityDepartmentCatalog({
      products: [
        {
          ...listDepartmentProducts()[0]!,
          productKey: "DIETARY",
          status: "RETIRED",
        },
      ],
      departments: [],
      entitlements: [],
    });
    assert.deepEqual(catalog, []);
  });
});

describe("Entitlement and operability", () => {
  it("denies AVAILABLE products that are installed but not entitled", () => {
    const result = evaluateCustomerDepartmentOperability({
      productKey: "DIETARY",
      releaseStatus: "AVAILABLE",
      installed: true,
      departmentActive: true,
      entitled: false,
    });
    assert.deepEqual(result, { operable: false, reason: "not_entitled" });
  });

  it("allows AVAILABLE + entitled + installed + active departments", () => {
    const result = evaluateCustomerDepartmentOperability({
      productKey: "DIETARY",
      releaseStatus: "AVAILABLE",
      installed: true,
      departmentActive: true,
      entitled: true,
    });
    assert.deepEqual(result, { operable: true, reason: "operable" });
  });

  it("never treats DEVELOPMENT as entitled or operable for customers", () => {
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
    assert.equal(
      evaluateCustomerDepartmentOperability({
        productKey: "EVS",
        releaseStatus: "DEVELOPMENT",
        installed: true,
        departmentActive: true,
        entitled: true,
      }).operable,
      false,
    );
  });

  it("grandfathers unmanaged installed AVAILABLE products when entitlements are not enforced", () => {
    assert.equal(
      resolveCommercialEntitlement({
        releaseStatus: "AVAILABLE",
        entitlementStatus: null,
        billingStatus: "UNMANAGED",
        entitlementsEnforced: false,
        installed: true,
      }),
      true,
    );
    assert.equal(
      resolveCommercialEntitlement({
        releaseStatus: "DEVELOPMENT",
        entitlementStatus: null,
        billingStatus: "UNMANAGED",
        entitlementsEnforced: false,
        installed: true,
      }),
      false,
    );
  });

  it("keeps existing RETIRED entitled installations operable and blocks new ones", () => {
    assert.equal(
      evaluateCustomerDepartmentOperability({
        productKey: "DIETARY",
        releaseStatus: "RETIRED",
        installed: true,
        departmentActive: true,
        entitled: true,
      }).operable,
      true,
    );
    assert.equal(
      evaluateCustomerDepartmentOperability({
        productKey: "DIETARY",
        releaseStatus: "RETIRED",
        installed: false,
        departmentActive: false,
        entitled: true,
      }).reason,
      "not_installed",
    );
  });
});

describe("Internal development access", () => {
  it("lets Harbor staff and EVS/Plant operation flags exercise DEVELOPMENT products", () => {
    assert.equal(
      hasInternalDepartmentProductAccess({
        authKind: "harbor_staff",
        productKey: "EVS",
      }),
      true,
    );
    assert.equal(
      hasInternalDepartmentProductAccess({
        authKind: "user",
        productKey: "EVS",
        evsOperationsEnabled: true,
      }),
      true,
    );
    assert.equal(
      hasInternalDepartmentProductAccess({
        authKind: "user",
        productKey: "PLANT",
        plantOperationsEnabled: true,
      }),
      true,
    );
    assert.equal(
      hasInternalDepartmentProductAccess({
        authKind: "user",
        productKey: "EVS",
        evsOperationsEnabled: false,
      }),
      false,
    );
    assert.equal(
      evaluateDepartmentForAudience({
        audience: "internal",
        productKey: "EVS",
        releaseStatus: "DEVELOPMENT",
        installed: true,
        departmentActive: true,
        entitled: false,
      }).operable,
      true,
    );
  });

  it("does not grant DEVELOPMENT products to facility manager roles by themselves", () => {
    assert.equal(
      hasInternalDepartmentProductAccess({
        authKind: "user",
        productKey: "EVS",
      }),
      false,
    );
    assert.throws(
      () => resolvePublishedDepartmentProductKeys(["EVS"]),
      (error: unknown) =>
        error instanceof DepartmentProductInstallError && error.code === "UNAVAILABLE_PRODUCT",
    );
  });
});

describe("Cross-surface eligibility authority", () => {
  it("uses one eligibility selector from picker, Admin, Employees, and Build Logs", () => {
    assert.match(
      source("src/lib/active-department-context.ts"),
      /loadCustomerOperableDepartments/,
    );
    assert.match(
      source("src/app/(protected)/admin/departments/page.tsx"),
      /loadCustomerOperableDepartments/,
    );
    assert.match(
      source("src/app/(protected)/employees/page.tsx"),
      /loadCustomerOperableDepartments/,
    );
    assert.match(
      source("src/app/(protected)/build/logs/page.tsx"),
      /loadCustomerOperableDepartments/,
    );
    assert.match(
      source("src/lib/locations/load-units-page.ts"),
      /loadCustomerOperableDepartments/,
    );
    assert.match(
      source("src/lib/facility-builder/load-facility-hierarchy.ts"),
      /loadCustomerOperableDepartments/,
    );
    assert.match(
      source("src/app/(protected)/admin/departments/[departmentId]/page.tsx"),
      /assertCustomerDepartmentContext/,
    );
  });

  it("does not delete historical EVS or Plant rows to hide them", () => {
    const picker = source("src/lib/active-department-context.ts");
    assert.doesNotMatch(picker, /department\.delete/);
    assert.doesNotMatch(source("src/lib/department-products/eligibility.ts"), /deleteMany/);
    assert.match(source("src/lib/ensure-default-departments.ts"), /EVS/);
    assert.match(source("src/lib/ensure-default-departments.ts"), /PLANT/);
  });

  it("installs only after billing writes entitlements, and never from a failed update", () => {
    const add = source("src/lib/billing/add-departments.ts");
    assert.match(add, /stripe\.subscriptions\.update/);
    assert.match(add, /applyFacilitySubscription/);
    const apply = source("src/lib/billing/apply-stripe-event.ts");
    assert.match(apply, /isDepartmentProductCommerciallyRecognized/);
    assert.match(apply, /installDepartmentsForActiveEntitlements/);
    assert.doesNotMatch(add, /installDepartmentProduct\(/);
  });
});
