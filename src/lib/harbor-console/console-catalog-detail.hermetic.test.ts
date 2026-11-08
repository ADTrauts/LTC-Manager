import assert from "node:assert/strict";
import test from "node:test";

import { getDepartmentProduct } from "@/lib/department-products/registry";

import { CONSOLE_CATALOG_EMPTY, productFacilityAccessIdentities } from "./console-catalog";
import {
  catalogRecordPublishedVersionLabel,
  consoleDepartmentStatusLabel,
  consoleProductAccessLabel,
  emptyProductAccessRoleCounts,
  formatProductReleaseDate,
  formatProductVersionLabel,
  loadConsoleDepartmentProductDetail,
  loadConsoleWorkPresetDetail,
  productAccessRoleTotal,
} from "./console-catalog-detail";

test("product release presentation uses registry values and em dashes", () => {
  const plant = getDepartmentProduct("PLANT");
  const food = getDepartmentProduct("HEALTHCARE_FOOD_NUTRITION");
  const evs = getDepartmentProduct("EVS");
  assert.ok(plant && food && evs);
  assert.equal(formatProductVersionLabel(plant.versionLabel), "1.0");
  assert.equal(formatProductReleaseDate(plant.releasedOn), "October 7, 2026");
  assert.equal(formatProductVersionLabel(food.versionLabel), CONSOLE_CATALOG_EMPTY);
  assert.equal(formatProductReleaseDate(food.releasedOn), CONSOLE_CATALOG_EMPTY);
  assert.equal(formatProductVersionLabel(evs.versionLabel), CONSOLE_CATALOG_EMPTY);
  assert.equal(formatProductReleaseDate(null), CONSOLE_CATALOG_EMPTY);
  assert.equal(formatProductReleaseDate("not-a-date"), CONSOLE_CATALOG_EMPTY);
  assert.equal(catalogRecordPublishedVersionLabel(1), "v1");
  assert.equal(catalogRecordPublishedVersionLabel(null), CONSOLE_CATALOG_EMPTY);
  assert.equal(consoleDepartmentStatusLabel(true), "Enabled");
  assert.equal(consoleDepartmentStatusLabel(false), "Disabled");
});

test("product access labels follow operability without a second rule", () => {
  assert.equal(
    consoleProductAccessLabel({ releaseStatus: "DEVELOPMENT", operable: false, entitlementStatus: null }),
    "Development/internal",
  );
  assert.equal(
    consoleProductAccessLabel({ releaseStatus: "AVAILABLE", operable: true, entitlementStatus: "ACTIVE" }),
    "Active",
  );
  assert.equal(
    consoleProductAccessLabel({ releaseStatus: "AVAILABLE", operable: false, entitlementStatus: "REVOKED" }),
    "Revoked",
  );
  assert.equal(
    consoleProductAccessLabel({ releaseStatus: "AVAILABLE", operable: false, entitlementStatus: null }),
    "Not entitled",
  );
});

test("role breakdown dedups an employee and facility administrator once", () => {
  const verifiedAt = new Date("2026-10-07T15:00:00.000Z");
  const identities = productFacilityAccessIdentities({
    facilityId: "fac-a",
    departmentId: "dept-a",
    employees: [
      {
        id: "gm",
        facilityId: "fac-a",
        email: "gm@example.com",
        status: "ACTIVE",
        roleType: "GM",
        primaryDepartmentId: "dept-a",
        employeeDepartments: [],
      },
      {
        id: "manager",
        facilityId: "fac-a",
        email: "manager@example.com",
        status: "ACTIVE",
        roleType: "MANAGER",
        primaryDepartmentId: "dept-a",
        employeeDepartments: [],
      },
      {
        id: "lead",
        facilityId: "fac-a",
        email: "lead@example.com",
        status: "ACTIVE",
        roleType: "LEAD_TEAM_MEMBER",
        primaryDepartmentId: "dept-a",
        employeeDepartments: [],
      },
      {
        id: "staff",
        facilityId: "fac-a",
        email: "staff@example.com",
        status: "ACTIVE",
        roleType: "STAFF",
        primaryDepartmentId: null,
        employeeDepartments: [{ departmentId: "dept-a" }],
      },
      {
        id: "former",
        facilityId: "fac-a",
        email: "former@example.com",
        status: "TERMINATED",
        roleType: "STAFF",
        primaryDepartmentId: "dept-a",
        employeeDepartments: [],
      },
      {
        id: "other",
        facilityId: "fac-a",
        email: "other@example.com",
        status: "ACTIVE",
        roleType: "STAFF",
        primaryDepartmentId: "other-dept",
        employeeDepartments: [],
      },
    ],
    administrators: [
      {
        id: "fa",
        facilityId: "fac-a",
        email: "admin@example.com",
        isActive: true,
        emailVerifiedAt: verifiedAt,
        roleKey: "FACILITY_ADMINISTRATOR",
      },
      {
        id: "fa-dup",
        facilityId: "fac-a",
        email: "manager@example.com",
        isActive: true,
        emailVerifiedAt: verifiedAt,
        roleKey: "FACILITY_ADMINISTRATOR",
      },
      {
        id: "fa-off",
        facilityId: "fac-a",
        email: "inactive@example.com",
        isActive: false,
        emailVerifiedAt: verifiedAt,
        roleKey: "FACILITY_ADMINISTRATOR",
      },
    ],
  });

  const counts = emptyProductAccessRoleCounts();
  for (const row of identities) {
    if (row.role) counts[row.role] += 1;
  }
  assert.equal(identities.length, 5);
  assert.equal(counts.generalManagers, 1);
  assert.equal(counts.managers, 1);
  assert.equal(counts.staff, 2);
  assert.equal(counts.facilityAdministrators, 1);
  assert.equal(productAccessRoleTotal(counts), identities.length);
  assert.equal(
    identities.find((row) => row.identity === "email:manager@example.com")?.role,
    "managers",
  );
});

test("unknown product and work keys do not query", async () => {
  assert.equal(await loadConsoleDepartmentProductDetail({} as never, "NOT_REAL"), null);
  assert.equal(await loadConsoleWorkPresetDetail({} as never, "NOT_REAL"), null);
});
