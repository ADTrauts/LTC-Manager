import assert from "node:assert/strict";
import test from "node:test";

import type { FacilitySession } from "@/lib/auth";
import type { DepartmentOperatingModel } from "@/lib/department-operators/types";

import {
  canReadComplianceRecordsInMode,
  decideDepartmentAccess,
  departmentAccessReason,
  DepartmentAccessError,
  DEPARTMENT_NONE_REASON,
  DEPARTMENT_VIEW_REASON,
  requireDepartmentManage,
  type DepartmentAccess,
  type DepartmentAccessDecisionInput,
  type DepartmentAccessMode,
  type DepartmentSessionKind,
} from "./access";
import { deriveLedDepartmentIds, resolveLedDepartmentIds } from "./led-departments";
import { resolveDepartmentAccess, resolveDepartmentAccessMap } from "./resolve";

const FLAG = "CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED";

function withFlag<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  });
}

const booleans = [false, true] as const;
const sessionKinds: DepartmentSessionKind[] = ["internal", "vendor", "harbor"];
const models: DepartmentOperatingModel[] = ["FACILITY_OPERATED", "CONTRACTED"];

function* everyInput(): Generator<DepartmentAccessDecisionInput> {
  for (const enforcementEnabled of booleans)
    for (const sessionKind of sessionKinds)
      for (const operatingModel of models)
        for (const vendorHeadAccepted of booleans)
          for (const isFacilityAdministrator of booleans)
            for (const isMember of booleans)
              for (const isHead of booleans)
                for (const vendorOperatesDepartment of booleans)
                  yield {
                    enforcementEnabled,
                    sessionKind,
                    operatingModel,
                    vendorHeadAccepted,
                    isFacilityAdministrator,
                    isMember,
                    isHead,
                    vendorOperatesDepartment,
                  };
}

function label(input: DepartmentAccessDecisionInput): string {
  return JSON.stringify(input);
}

test("decision matrix: every combination follows rules R1–R9", () => {
  let count = 0;
  for (const input of everyInput()) {
    count += 1;
    const mode = decideDepartmentAccess(input);
    const inDepartment = input.isMember || input.isHead;

    if (!input.enforcementEnabled) {
      assert.equal(mode, "MANAGE", `R1 flag off: ${label(input)}`);
      continue;
    }
    if (input.sessionKind === "harbor") {
      assert.equal(mode, "MANAGE", `R9 harbor follows support mode: ${label(input)}`);
      continue;
    }
    if (input.sessionKind === "vendor") {
      const expected = input.vendorOperatesDepartment && inDepartment ? "MANAGE" : "NONE";
      assert.equal(mode, expected, `R8 vendor: ${label(input)}`);
      continue;
    }
    if (inDepartment) {
      assert.equal(mode, "MANAGE", `R2 head or member: ${label(input)}`);
      continue;
    }
    if (input.isFacilityAdministrator) {
      const expected: DepartmentAccessMode =
        input.operatingModel === "FACILITY_OPERATED"
          ? "VIEW"
          : input.vendorHeadAccepted
            ? "SUMMARY"
            : "MANAGE";
      assert.equal(mode, expected, `R3/R4/R5 Facility Administrator: ${label(input)}`);
      continue;
    }
    assert.equal(mode, "NONE", `R6 outsider: ${label(input)}`);
  }
  assert.equal(count, 2 * 3 * 2 * 2 * 2 * 2 * 2 * 2);
});

test("decision matrix: VIEW and SUMMARY only ever reach the Facility Administrator", () => {
  for (const input of everyInput()) {
    const mode = decideDepartmentAccess(input);
    if (mode === "VIEW" || mode === "SUMMARY") {
      assert.equal(input.isFacilityAdministrator, true, label(input));
      assert.equal(input.sessionKind, "internal", label(input));
      assert.equal(input.isMember || input.isHead, false, label(input));
    }
  }
});

const enforced = (overrides: Partial<DepartmentAccessDecisionInput>): DepartmentAccessDecisionInput => ({
  enforcementEnabled: true,
  sessionKind: "internal",
  operatingModel: "FACILITY_OPERATED",
  vendorHeadAccepted: false,
  isFacilityAdministrator: false,
  isMember: false,
  isHead: false,
  vendorOperatesDepartment: false,
  ...overrides,
});

test("Terrace View scenarios", () => {
  assert.equal(
    decideDepartmentAccess(enforced({ isFacilityAdministrator: true })),
    "VIEW",
    "Facility Administrator on self-operated EVS",
  );
  assert.equal(
    decideDepartmentAccess(enforced({ isFacilityAdministrator: true, isHead: true })),
    "MANAGE",
    "Facility Administrator after naming themselves EVS head",
  );
  assert.equal(decideDepartmentAccess(enforced({})), "NONE", "EVS head opening Plant");

  const metz = { operatingModel: "CONTRACTED" as const, isFacilityAdministrator: true };
  assert.equal(decideDepartmentAccess(enforced(metz)), "MANAGE", "Facility Administrator before Metz's head accepts");
  assert.equal(
    decideDepartmentAccess(enforced({ ...metz, vendorHeadAccepted: true })),
    "SUMMARY",
    "Facility Administrator after Metz's head accepts",
  );

  const metzGm = { sessionKind: "vendor" as const, operatingModel: "CONTRACTED" as const, isHead: true };
  assert.equal(
    decideDepartmentAccess(enforced({ ...metzGm, vendorOperatesDepartment: true })),
    "MANAGE",
    "Metz GM on Food & Nutrition",
  );
  assert.equal(
    decideDepartmentAccess(enforced({ ...metzGm, vendorOperatesDepartment: false })),
    "NONE",
    "Metz GM on a Department Metz does not run",
  );
});

test("compliance Records: MANAGE, VIEW, and the Facility Administrator in SUMMARY", () => {
  assert.equal(canReadComplianceRecordsInMode("MANAGE", false), true);
  assert.equal(canReadComplianceRecordsInMode("VIEW", true), true);
  assert.equal(canReadComplianceRecordsInMode("SUMMARY", true), true);
  assert.equal(canReadComplianceRecordsInMode("SUMMARY", false), false);
  assert.equal(canReadComplianceRecordsInMode("NONE", true), false);
});

test("shared reason text", () => {
  assert.equal(departmentAccessReason("MANAGE", null), null);
  assert.equal(
    departmentAccessReason("VIEW", null),
    "You can view this Department. Changes are made by its head and team.",
  );
  assert.equal(
    departmentAccessReason("SUMMARY", "Metz Culinary"),
    "Metz Culinary runs this Department. You can see its summary and its compliance Records.",
  );
  assert.match(departmentAccessReason("SUMMARY", "  ") ?? "", /^Its operator runs this Department\./);
  assert.equal(departmentAccessReason("NONE", "Metz Culinary"), DEPARTMENT_NONE_REASON);
});

function access(mode: DepartmentAccessMode): DepartmentAccess {
  return {
    departmentId: "dept_evs",
    mode,
    canReadComplianceRecords: canReadComplianceRecordsInMode(mode, true),
    operatingModel: "FACILITY_OPERATED",
    operatorName: null,
    operatorPeriodId: null,
    vendorHeadAccepted: false,
    isMember: false,
    isHead: false,
    reason: departmentAccessReason(mode, null),
  };
}

test("requireDepartmentManage throws with the reason below MANAGE", () => {
  assert.doesNotThrow(() => requireDepartmentManage(access("MANAGE")));
  for (const mode of ["VIEW", "SUMMARY", "NONE"] as const) {
    assert.throws(
      () => requireDepartmentManage(access(mode)),
      (error: unknown) =>
        error instanceof DepartmentAccessError &&
        error.mode === mode &&
        error.departmentId === "dept_evs" &&
        error.message === departmentAccessReason(mode, null),
    );
  }
  assert.throws(() => requireDepartmentManage(access("VIEW")), { message: DEPARTMENT_VIEW_REASON });
});

test("led Departments: head link, or GM on the primary Department", () => {
  assert.deepEqual(
    deriveLedDepartmentIds({ headedDepartmentIds: ["evs"], roleType: "STAFF", primaryDepartmentId: "plant" }),
    ["evs"],
  );
  assert.deepEqual(
    deriveLedDepartmentIds({ headedDepartmentIds: [], roleType: "GM", primaryDepartmentId: "dietary" }),
    ["dietary"],
  );
  assert.deepEqual(
    deriveLedDepartmentIds({ headedDepartmentIds: ["dietary"], roleType: "GM", primaryDepartmentId: "dietary" }),
    ["dietary"],
  );
  assert.deepEqual(
    deriveLedDepartmentIds({ headedDepartmentIds: [], roleType: "GM", primaryDepartmentId: null }),
    [],
  );
  assert.deepEqual(
    deriveLedDepartmentIds({ headedDepartmentIds: [], roleType: "MANAGER", primaryDepartmentId: "evs" }),
    [],
  );
});

type FakeEmployee = {
  id: string;
  facilityId: string;
  userId: string | null;
  roleType: "GM" | "MANAGER" | "STAFF";
  primaryDepartmentId: string | null;
  additionalDepartmentIds: string[];
};
type FakeDepartment = { id: string; facilityId: string; headEmployeeId: string | null };
type FakeOperator = {
  id: string;
  departmentId: string;
  organizationId: string;
  organization: { id: string; name: string; displayName: string | null };
};

function fakeDb(world: {
  facility: { id: string; organizationId: string; timezone: string };
  departments: FakeDepartment[];
  employees: FakeEmployee[];
  operators: FakeOperator[];
  vendorHeads?: { departmentId: string; operatorRelationshipId: string; assigneeUserId: string }[];
}) {
  const matchesEmployee = (where: Record<string, unknown>, employee: FakeEmployee) =>
    employee.facilityId === where.facilityId &&
    (where.id === undefined || where.id === employee.id) &&
    (where.userId === undefined || where.userId === employee.userId);

  return {
    employee: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const employee = world.employees.find((row) => matchesEmployee(where, row));
        if (!employee) return null;
        return {
          id: employee.id,
          roleType: employee.roleType,
          primaryDepartmentId: employee.primaryDepartmentId,
          employeeDepartments: employee.additionalDepartmentIds.map((departmentId) => ({ departmentId })),
        };
      },
    },
    department: {
      findMany: async ({ where }: { where: { facilityId: string; id?: { in: string[] }; headEmployeeId?: string } }) =>
        world.departments
          .filter((row) => row.facilityId === where.facilityId)
          .filter((row) => !where.id || where.id.in.includes(row.id))
          .filter((row) => where.headEmployeeId === undefined || row.headEmployeeId === where.headEmployeeId)
          .map((row) => ({ id: row.id, headEmployeeId: row.headEmployeeId })),
    },
    facility: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === world.facility.id ? world.facility : null,
    },
    departmentVendorHeadAssignment: {
      findMany: async () => world.vendorHeads ?? [],
    },
    departmentOperatorRelationship: {
      findMany: async ({ where }: { where: { departmentId: { in: string[] } } }) =>
        world.operators
          .filter((row) => where.departmentId.in.includes(row.departmentId))
          .map((row) => ({
            ...row,
            organization: { ...row.organization, legalName: null, organizationType: null, isActive: true },
            effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
            effectiveTo: null,
            notes: null,
            externalAccountCode: null,
            contractReference: null,
            createdByUserId: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          })),
    },
  };
}

function terraceView(
  vendorHeads?: { departmentId: string; operatorRelationshipId: string; assigneeUserId: string }[],
) {
  return fakeDb({
    facility: { id: "fac_tv", organizationId: "org_ecmc", timezone: "America/New_York" },
    departments: [
      { id: "dept_fn", facilityId: "fac_tv", headEmployeeId: null },
      { id: "dept_evs", facilityId: "fac_tv", headEmployeeId: "emp_evs_head" },
      { id: "dept_plant", facilityId: "fac_tv", headEmployeeId: null },
      { id: "dept_elsewhere", facilityId: "fac_other", headEmployeeId: null },
    ],
    employees: [
      {
        id: "emp_evs_head",
        facilityId: "fac_tv",
        userId: "user_evs_head",
        roleType: "MANAGER",
        primaryDepartmentId: "dept_evs",
        additionalDepartmentIds: [],
      },
      {
        id: "emp_plant_gm",
        facilityId: "fac_tv",
        userId: null,
        roleType: "GM",
        primaryDepartmentId: "dept_plant",
        additionalDepartmentIds: ["dept_evs"],
      },
    ],
    operators: [
      {
        id: "period_metz",
        departmentId: "dept_fn",
        organizationId: "org_metz",
        organization: { id: "org_metz", name: "metz", displayName: "Metz Culinary" },
      },
      {
        id: "period_evs",
        departmentId: "dept_evs",
        organizationId: "org_ecmc",
        organization: { id: "org_ecmc", name: "ECMC", displayName: null },
      },
    ],
    vendorHeads,
  });
}

function internalSession(overrides: Partial<FacilitySession>): FacilitySession {
  return {
    uid: "user_admin",
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "FACILITY_ADMINISTRATOR",
    name: "Test",
    email: "test@example.com",
    facilityId: "fac_tv",
    sessionVersion: 1,
    ...overrides,
  } as FacilitySession;
}

const ALL = ["dept_fn", "dept_evs", "dept_plant", "dept_elsewhere"];

test("resolver: flag off answers MANAGE everywhere and still reports the facts", async () => {
  await withFlag(undefined, async () => {
    const db = terraceView() as never;
    const map = await resolveDepartmentAccessMap(db, internalSession({}), { facilityId: "fac_tv", departmentIds: ALL });
    assert.deepEqual([...map.keys()].sort(), ["dept_evs", "dept_fn", "dept_plant"]);
    for (const value of map.values()) {
      assert.equal(value.mode, "MANAGE");
      assert.equal(value.reason, null);
      assert.equal(value.canReadComplianceRecords, true);
    }
    const fn = map.get("dept_fn")!;
    assert.equal(fn.operatingModel, "CONTRACTED");
    assert.equal(fn.operatorName, "Metz Culinary");
    assert.equal(fn.operatorPeriodId, "period_metz");
    const plant = map.get("dept_plant")!;
    assert.equal(plant.operatingModel, "FACILITY_OPERATED");
    assert.equal(plant.operatorPeriodId, null);
    assert.equal(plant.operatorName, null);
  });
});

test("resolver: flag on — Facility Administrator, head, GM and member", async () => {
  await withFlag("true", async () => {
    const db = terraceView() as never;

    const admin = await resolveDepartmentAccessMap(db, internalSession({}), { facilityId: "fac_tv", departmentIds: ALL });
    assert.equal(admin.get("dept_fn")!.mode, "MANAGE");
    assert.equal(admin.get("dept_fn")!.vendorHeadAccepted, false);
    assert.equal(admin.get("dept_evs")!.mode, "VIEW");
    assert.equal(admin.get("dept_evs")!.reason, DEPARTMENT_VIEW_REASON);
    assert.equal(admin.get("dept_plant")!.mode, "VIEW");

    const evsHead = await resolveDepartmentAccessMap(
      db,
      internalSession({ uid: "user_evs_head", role: "MANAGER" }),
      { facilityId: "fac_tv", departmentIds: ALL },
    );
    assert.equal(evsHead.get("dept_evs")!.mode, "MANAGE");
    assert.equal(evsHead.get("dept_evs")!.isHead, true);
    assert.equal(evsHead.get("dept_evs")!.isMember, true);
    assert.equal(evsHead.get("dept_plant")!.mode, "NONE");
    assert.equal(evsHead.get("dept_plant")!.canReadComplianceRecords, false);
    assert.equal(evsHead.get("dept_fn")!.mode, "NONE");

    const plantGm = await resolveDepartmentAccessMap(
      db,
      internalSession({ uid: "emp_plant_gm", authKind: "employee", authMethod: "QUICK_PIN", role: "GM" }),
      { facilityId: "fac_tv", departmentIds: ALL },
    );
    assert.equal(plantGm.get("dept_plant")!.isHead, true);
    assert.equal(plantGm.get("dept_plant")!.mode, "MANAGE");
    assert.equal(plantGm.get("dept_evs")!.isHead, false);
    assert.equal(plantGm.get("dept_evs")!.isMember, true);
    assert.equal(plantGm.get("dept_evs")!.mode, "MANAGE");

    const single = await resolveDepartmentAccess(db, internalSession({}), {
      facilityId: "fac_tv",
      departmentId: "dept_elsewhere",
    });
    assert.equal(single, null);
  });
});

test("resolver: an accepted vendor head drops the Facility Administrator to SUMMARY", async () => {
  await withFlag("true", async () => {
    const db = terraceView([
      { departmentId: "dept_fn", operatorRelationshipId: "period_metz", assigneeUserId: "user_gm" },
    ]) as never;
    const admin = await resolveDepartmentAccessMap(db, internalSession({}), {
      facilityId: "fac_tv",
      departmentIds: ALL,
    });
    assert.equal(admin.get("dept_fn")!.vendorHeadAccepted, true);
    assert.equal(admin.get("dept_fn")!.mode, "SUMMARY");
    assert.equal(admin.get("dept_fn")!.canReadComplianceRecords, true);
    assert.equal(admin.get("dept_evs")!.mode, "VIEW");
    assert.equal(admin.get("dept_fn")!.isHead, false);
  });
});

test("resolver: a session for another facility is an outsider", async () => {
  await withFlag("true", async () => {
    const map = await resolveDepartmentAccessMap(
      terraceView() as never,
      internalSession({ facilityId: "fac_other", uid: "user_evs_head" }),
      { facilityId: "fac_tv", departmentIds: ALL },
    );
    for (const value of map.values()) {
      assert.equal(value.mode, "NONE");
      assert.equal(value.isMember, false);
      assert.equal(value.isHead, false);
    }
  });
});

test("resolver: Harbor support sessions are out of scope", async () => {
  await withFlag("true", async () => {
    const map = await resolveDepartmentAccessMap(
      terraceView() as never,
      internalSession({ authKind: "harbor_staff", uid: "harbor_1" }),
      { facilityId: "fac_tv", departmentIds: ALL },
    );
    for (const value of map.values()) assert.equal(value.mode, "MANAGE");
  });
});

test("resolveLedDepartmentIds reads the head link and the GM primary Department", async () => {
  const db = terraceView() as never;
  assert.deepEqual(await resolveLedDepartmentIds(db, { facilityId: "fac_tv", employeeId: "emp_evs_head" }), [
    "dept_evs",
  ]);
  assert.deepEqual(await resolveLedDepartmentIds(db, { facilityId: "fac_tv", employeeId: "emp_plant_gm" }), [
    "dept_plant",
  ]);
  assert.deepEqual(await resolveLedDepartmentIds(db, { facilityId: "fac_tv", employeeId: "nobody" }), []);
});
