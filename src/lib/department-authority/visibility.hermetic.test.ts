import assert from "node:assert/strict";
import test from "node:test";

import type { FacilitySession } from "@/lib/auth";

import { assetResponsibleDepartmentWhere } from "@/lib/asset-operations/ownership";

import { DEPARTMENT_VIEW_REASON } from "./access";
import { departmentViewOnlyNotice } from "./view-notice";
import {
  assetVisibilityWhere,
  departmentIsVisible,
  employeeVisibleWhere,
  loadDepartmentVisibility,
  visibleDepartmentIdList,
  type DepartmentVisibility,
} from "./visibility";

const FLAG = "CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED";

function memberView(ids: string[], extras: Partial<DepartmentVisibility> = {}): DepartmentVisibility {
  return {
    departmentIds: new Set(ids),
    pageDepartmentIds: new Set(ids),
    summaryDepartmentIds: new Set(),
    complianceDepartmentIds: new Set(ids),
    manageDepartmentIds: new Set(ids),
    coversEveryDepartment: false,
    seesEveryAsset: false,
    ...extras,
  };
}

test("visibility stays off and does not read Departments when the flag is off", async () => {
  const previous = process.env[FLAG];
  process.env[FLAG] = "false";
  try {
    const db = {
      department: {
        findMany() {
          throw new Error("flag off must not query departments");
        },
      },
    };
    const session = { authKind: "user", role: "MANAGER", uid: "user" } as FacilitySession;
    assert.equal(await loadDepartmentVisibility(db as never, session, "facility"), null);
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
});

test("a person sees employees and assets only in Departments they can view", () => {
  const visibility = memberView(["dietary"]);
  const employees = employeeVisibleWhere(visibility);
  assert.equal(JSON.stringify(employees).includes("dietary"), true);
  assert.equal(JSON.stringify(employees).includes("plant"), false);

  assert.deepEqual(
    assetVisibilityWhere({ visibility, activeDepartmentId: null }),
    { departmentId: { in: ["dietary"] } },
  );
  assert.deepEqual(
    assetVisibilityWhere({ visibility, activeDepartmentId: "plant" }),
    { departmentId: { in: ["dietary"] } },
  );
  assert.equal(departmentIsVisible(visibility, "plant"), false);
  assert.deepEqual(visibleDepartmentIdList(visibility), ["dietary"]);
});

test("a vendor summary stays out of the people list and out of Department pages", () => {
  const visibility = memberView(["dietary", "plant"], {
    coversEveryDepartment: true,
    seesEveryAsset: true,
    pageDepartmentIds: new Set(["plant"]),
    summaryDepartmentIds: new Set(["dietary"]),
    complianceDepartmentIds: new Set(["dietary", "plant"]),
    manageDepartmentIds: new Set(["plant"]),
  });
  const employees = JSON.stringify(employeeVisibleWhere(visibility));
  assert.equal(employees.includes("plant"), true);
  assert.equal(employees.includes("dietary"), false);
  assert.deepEqual(visibleDepartmentIdList(visibility), ["plant"]);
  assert.equal(departmentIsVisible(visibility, "dietary"), true);
});

test("the Facility Administrator keeps the facility-wide people list, and Plant sees every asset", () => {
  const administrator = memberView(["dietary", "plant"], {
    coversEveryDepartment: true,
    seesEveryAsset: true,
  });
  assert.deepEqual(employeeVisibleWhere(administrator), {});
  assert.equal(visibleDepartmentIdList(administrator), null);
  assert.deepEqual(
    assetVisibilityWhere({ visibility: administrator, activeDepartmentId: "dietary" }),
    {},
  );

  const plant = memberView(["plant"], { seesEveryAsset: true });
  assert.deepEqual(assetVisibilityWhere({ visibility: plant, activeDepartmentId: "plant" }), {});
});

test("the view notice appears only while enforcement is on", () => {
  const previous = process.env[FLAG];
  process.env[FLAG] = "false";
  try {
    assert.equal(departmentViewOnlyNotice(DEPARTMENT_VIEW_REASON), null);
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
  process.env[FLAG] = "true";
  try {
    assert.equal(departmentViewOnlyNotice(DEPARTMENT_VIEW_REASON), DEPARTMENT_VIEW_REASON);
    assert.equal(departmentViewOnlyNotice("Managers publish cycles."), null);
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
});

test("flag off keeps the existing asset department filter", () => {
  assert.deepEqual(
    assetVisibilityWhere({ visibility: null, activeDepartmentId: "dietary" }),
    assetResponsibleDepartmentWhere("dietary"),
  );
  assert.equal(departmentIsVisible(null, "anywhere"), true);
});
