import assert from "node:assert/strict";
import test from "node:test";

import type { AppRole } from "@/lib/access";
import type { AuthKind, FacilitySession, PartnerFacilitySession } from "@/lib/auth";
import {
  overrideDepartmentProductStatusForTest,
  resetDepartmentProductStatusOverridesForTest,
} from "@/lib/department-products/registry";

import {
  dashboardLayoutOwner,
  deriveDashboardAuthority,
  deriveDashboardViewer,
  resolveDashboardViewer,
  selectDashboardDepartments,
  type DashboardAccessFact,
  type DashboardDepartmentCatalog,
  type DashboardViewer,
  type DashboardViewerFacts,
} from "./index";

const FN = { id: "dept-fn", key: "DIETARY", name: "Food & Nutrition", sortOrder: 1 };
const EVS = { id: "dept-evs", key: "EVS", name: "Environmental Services", sortOrder: 2 };
const PLANT = { id: "dept-plant", key: "PLANT", name: "Plant Operations", sortOrder: 3 };
const ACTIVITIES = { id: "dept-activities", key: "ACTIVITIES", name: "Activities", sortOrder: 4 };
const ALL = [FN, EVS, PLANT, ACTIVITIES];

function session(role: AppRole, authKind: AuthKind = "user", uid = "viewer-1"): FacilitySession {
  return {
    uid,
    authKind,
    authMethod: authKind === "employee" ? "QUICK_PIN" : "PASSWORD",
    scopeKind: "facility",
    facilityId: "fac-1",
    role,
    name: "Viewer",
    email: "viewer@example.com",
    sessionVersion: 1,
  } as FacilitySession;
}

const MANAGE: DashboardAccessFact = {
  mode: "MANAGE",
  operatingModel: "FACILITY_OPERATED",
  operatorName: null,
  vendorHeadAccepted: false,
};

function accessFor(
  departments: readonly { id: string }[],
  overrides: Record<string, Partial<DashboardAccessFact>> = {},
): Map<string, DashboardAccessFact> {
  return new Map(departments.map((department) => [department.id, { ...MANAGE, ...overrides[department.id] }]));
}

function facts(overrides: Partial<DashboardViewerFacts> = {}): DashboardViewerFacts {
  return {
    session: session("FACILITY_ADMINISTRATOR"),
    facilityTimezone: "America/New_York",
    serviceDate: "2026-10-20",
    employeeId: null,
    primaryDepartmentId: null,
    ledDepartmentIds: [],
    candidateDepartments: ALL,
    access: accessFor(ALL),
    teamScope: null,
    routeFlags: {},
    ...overrides,
  };
}

function viewerOf(input: DashboardViewerFacts): DashboardViewer {
  const resolution = deriveDashboardViewer(input);
  assert.equal(resolution.kind, "viewer");
  return (resolution as { viewer: DashboardViewer }).viewer;
}

const TEAM = { mode: "TEAM_SCOPED" as const, activeTeams: [{ id: "team-1", name: "Second floor" }], roomIds: ["room-1", "room-2"] };

test("authority: precedence and the Supervisor floor", () => {
  assert.equal(deriveDashboardAuthority({ role: "STAFF", leadsDepartmentInScope: true }), null);
  assert.equal(deriveDashboardAuthority({ role: "LEAD_TEAM_MEMBER", leadsDepartmentInScope: false }), null);
  assert.equal(deriveDashboardAuthority({ role: "SUPERVISOR", leadsDepartmentInScope: false }), "SUPERVISOR");
  assert.equal(deriveDashboardAuthority({ role: "SUPERVISOR", leadsDepartmentInScope: true }), "DEPARTMENT_LEADER");
  assert.equal(deriveDashboardAuthority({ role: "MANAGER", leadsDepartmentInScope: false }), "MANAGER");
  assert.equal(deriveDashboardAuthority({ role: "GM", leadsDepartmentInScope: false }), "MANAGER");
  assert.equal(deriveDashboardAuthority({ role: "GM", leadsDepartmentInScope: true }), "DEPARTMENT_LEADER");
  assert.equal(
    deriveDashboardAuthority({ role: "FACILITY_ADMINISTRATOR", leadsDepartmentInScope: true }),
    "FACILITY_ADMINISTRATOR",
  );
});

test("Facility Administrator: Facility scope by default, every Department available", () => {
  const viewer = viewerOf(facts());
  assert.equal(viewer.authority, "FACILITY_ADMINISTRATOR");
  assert.deepEqual(viewer.scope, { kind: "FACILITY" });
  assert.deepEqual(viewer.scopeDepartmentIds, ALL.map((department) => department.id));
  assert.deepEqual(
    viewer.availableScopes.map((scope) => (scope.kind === "FACILITY" ? "facility" : scope.departmentId)),
    ["facility", ...ALL.map((department) => department.id)],
  );
  assert.deepEqual(viewer.notices, []);
  assert.equal(viewer.canCustomize, true);
});

test("Department leader: led Departments only, primary first, secondary membership never widens", () => {
  const viewer = viewerOf(
    facts({
      session: session("MANAGER"),
      employeeId: "emp-1",
      primaryDepartmentId: EVS.id,
      ledDepartmentIds: [FN.id, EVS.id],
    }),
  );
  assert.equal(viewer.authority, "DEPARTMENT_LEADER");
  assert.deepEqual(viewer.scopeDepartmentIds, [FN.id, EVS.id]);
  assert.deepEqual(viewer.scope, { kind: "DEPARTMENT", departmentId: EVS.id });

  const notPrimary = viewerOf(
    facts({ session: session("GM"), primaryDepartmentId: PLANT.id, ledDepartmentIds: [ACTIVITIES.id] }),
  );
  assert.deepEqual(notPrimary.scope, { kind: "DEPARTMENT", departmentId: ACTIVITIES.id });
  assert.deepEqual(notPrimary.scopeDepartmentIds, [ACTIVITIES.id]);
});

test("Manager without a head link: primary Department only", () => {
  const viewer = viewerOf(facts({ session: session("MANAGER"), primaryDepartmentId: FN.id }));
  assert.equal(viewer.authority, "MANAGER");
  assert.deepEqual(viewer.scopeDepartmentIds, [FN.id]);
  assert.deepEqual(viewer.availableScopes, [{ kind: "DEPARTMENT", departmentId: FN.id }]);
});

test("Supervisor: team scope with rooms, Department fallbacks with notices", () => {
  const supervisor = session("SUPERVISOR", "employee");
  const team = viewerOf(facts({ session: supervisor, primaryDepartmentId: FN.id, teamScope: TEAM }));
  assert.deepEqual(team.scope, { kind: "TEAM", departmentId: FN.id, teamIds: ["team-1"], roomIds: ["room-1", "room-2"] });
  assert.equal(team.availableScopes.length, 2);
  assert.equal(team.layoutOwner?.kind, "EMPLOYEE");

  const noRooms = viewerOf(
    facts({
      session: supervisor,
      primaryDepartmentId: FN.id,
      teamScope: { mode: "TEAM_WITHOUT_LOCATIONS", activeTeams: TEAM.activeTeams, roomIds: [] },
    }),
  );
  assert.deepEqual(noRooms.scope, { kind: "DEPARTMENT", departmentId: FN.id });
  assert.equal(noRooms.notices[0]?.code, "TEAM_WITHOUT_ROOMS");
  assert.equal(noRooms.notices[0]?.message, "Your team has no rooms yet. Your Dashboard shows all of Food & Nutrition.");

  const noTeam = viewerOf(facts({ session: supervisor, primaryDepartmentId: FN.id, teamScope: null }));
  assert.equal(noTeam.notices[0]?.code, "NO_TEAM_ASSIGNED");
  assert.equal(noTeam.notices[0]?.message, "No team assigned. Your Dashboard shows all of Food & Nutrition.");
});

test("no primary Department: a single plain notice and no scope", () => {
  for (const role of ["MANAGER", "SUPERVISOR"] as const) {
    const viewer = viewerOf(facts({ session: session(role), primaryDepartmentId: null }));
    assert.equal(viewer.scope, null);
    assert.deepEqual(viewer.scopeDepartmentIds, []);
    assert.deepEqual(
      viewer.notices.map((notice) => notice.code),
      ["NEEDS_DEPARTMENT"],
    );
    assert.equal(
      viewer.notices[0]?.message,
      "Your Dashboard needs a Department. Ask your Facility Administrator to set your primary Department.",
    );
  }
});

test("below Supervisor is not eligible", () => {
  for (const role of ["STAFF", "LEAD_TEAM_MEMBER"] as const) {
    const resolution = deriveDashboardViewer(facts({ session: session(role, "employee"), primaryDepartmentId: FN.id }));
    assert.deepEqual(resolution, { kind: "not_eligible", reason: "ROLE_BELOW_SUPERVISOR" });
  }
});

test("resolveDashboardViewer rejects partner sessions and floor roles before reading data", async () => {
  const previous = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  const explode = new Proxy({}, {
    get() {
      throw new Error("must not read data");
    },
  });
  const deps = { db: explode as never };
  const partner = {
    ...session("MANAGER"),
    role: undefined,
    accessKind: "partner",
    partnerOrganizationId: "org-p",
    facilityPartnerOrganizationId: "fpo-1",
  } as unknown as PartnerFacilitySession;
  assert.deepEqual(await resolveDashboardViewer(partner, {}, deps), { kind: "not_eligible", reason: "SESSION_KIND" });
  assert.deepEqual(await resolveDashboardViewer(session("STAFF", "employee"), {}, deps), {
    kind: "not_eligible",
    reason: "ROLE_BELOW_SUPERVISOR",
  });
  if (previous === undefined) delete process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  else process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previous;
});

test("lens: a forged cookie or ?scope= never widens scope", () => {
  const manager = facts({ session: session("MANAGER"), primaryDepartmentId: FN.id });
  for (const lens of [
    { cookieDepartmentId: PLANT.id },
    { scopeParam: "facility" },
    { scopeParam: `department:${PLANT.id}` },
    { scopeParam: `team:${FN.id}` },
    { scopeParam: "department:" },
    { scopeParam: "garbage" },
  ]) {
    const viewer = viewerOf({ ...manager, lens });
    assert.deepEqual(viewer.scope, { kind: "DEPARTMENT", departmentId: FN.id }, JSON.stringify(lens));
    assert.deepEqual(viewer.scopeDepartmentIds, [FN.id]);
    assert.equal(viewer.notices.at(-1)?.code, "LENS_NOT_AVAILABLE");
    assert.equal(viewer.notices.at(-1)?.message, "That view isn't available to you. Your Dashboard shows Food & Nutrition.");
  }

  const supervisorTeam = facts({ session: session("SUPERVISOR"), primaryDepartmentId: FN.id, teamScope: TEAM });
  const forged = viewerOf({ ...supervisorTeam, lens: { scopeParam: "facility" } });
  assert.equal(forged.scope?.kind, "TEAM");
  assert.equal(forged.notices[0]?.message, "That view isn't available to you. Your Dashboard shows your team in Food & Nutrition.");
});

test("lens: available choices are honoured, ?scope= outranks the sidebar cookie", () => {
  const admin = facts();
  assert.deepEqual(viewerOf({ ...admin, lens: { cookieDepartmentId: EVS.id } }).scope, {
    kind: "DEPARTMENT",
    departmentId: EVS.id,
  });
  assert.deepEqual(
    viewerOf({ ...admin, lens: { cookieDepartmentId: EVS.id, scopeParam: "facility" } }).scope,
    { kind: "FACILITY" },
  );
  assert.deepEqual(
    viewerOf({ ...admin, lens: { cookieDepartmentId: EVS.id, scopeParam: `department:${PLANT.id}` } }).scope,
    { kind: "DEPARTMENT", departmentId: PLANT.id },
  );
  assert.deepEqual(viewerOf({ ...admin, lens: { cookieDepartmentId: EVS.id } }).notices, []);

  const supervisorTeam = facts({ session: session("SUPERVISOR"), primaryDepartmentId: FN.id, teamScope: TEAM });
  assert.equal(viewerOf({ ...supervisorTeam, lens: { cookieDepartmentId: FN.id } }).scope?.kind, "TEAM");
  assert.equal(
    viewerOf({ ...supervisorTeam, lens: { scopeParam: `department:${FN.id}` } }).scope?.kind,
    "DEPARTMENT",
  );
});

test("access modes come from the CDA resolver: FA View when not head, Manage when head", () => {
  const admin = viewerOf(
    facts({
      access: accessFor(ALL, { [FN.id]: { mode: "VIEW" }, [EVS.id]: { mode: "VIEW" } }),
      ledDepartmentIds: [PLANT.id],
    }),
  );
  assert.equal(admin.departmentAccess[FN.id], "VIEW");
  assert.equal(admin.departmentAccess[PLANT.id], "MANAGE");
  assert.equal(admin.authority, "FACILITY_ADMINISTRATOR");
});

test("access modes: vendor-run Department after the vendor head accepts is Summary, with the operator recorded", () => {
  const viewer = viewerOf(
    facts({
      access: accessFor(ALL, {
        [FN.id]: { mode: "SUMMARY", operatingModel: "CONTRACTED", operatorName: "Metz Culinary", vendorHeadAccepted: true },
        [EVS.id]: { operatingModel: "CONTRACTED", operatorName: "HHS", vendorHeadAccepted: false },
      }),
    }),
  );
  assert.equal(viewer.departmentAccess[FN.id], "SUMMARY");
  assert.deepEqual(viewer.operators[FN.id], {
    operatingModel: "VENDOR_RUN",
    operatorName: "Metz Culinary",
    vendorHeadAccepted: true,
  });
  assert.deepEqual(viewer.operators[EVS.id], { operatingModel: "VENDOR_RUN", operatorName: "HHS", vendorHeadAccepted: false });
  assert.deepEqual(viewer.operators[PLANT.id], {
    operatingModel: "SELF_OPERATED",
    operatorName: null,
    vendorHeadAccepted: false,
  });
});

test("access modes: Department with no access entry or NONE is out of scope; a vendor GM manages their own only", () => {
  const vendorGm = viewerOf(
    facts({
      session: session("GM", "employee", "emp-metz-gm"),
      employeeId: "emp-metz-gm",
      primaryDepartmentId: FN.id,
      ledDepartmentIds: [FN.id],
      access: new Map([
        [FN.id, { mode: "MANAGE", operatingModel: "CONTRACTED", operatorName: "Metz Culinary", vendorHeadAccepted: true }],
        [EVS.id, { ...MANAGE, mode: "NONE" }],
      ]),
    }),
  );
  assert.deepEqual(vendorGm.scopeDepartmentIds, [FN.id]);
  assert.equal(vendorGm.departmentAccess[FN.id], "MANAGE");
  assert.equal(vendorGm.departmentAccess[EVS.id], undefined);

  const admin = viewerOf(facts({ access: accessFor([FN.id, PLANT.id].map((id) => ({ id }))) }));
  assert.deepEqual(admin.scopeDepartmentIds, [FN.id, PLANT.id]);
});

test("layout owner follows the session kind; Harbor work sessions cannot customize", () => {
  assert.deepEqual(dashboardLayoutOwner(session("MANAGER", "user", "user-9")), { kind: "USER", userId: "user-9" });
  assert.deepEqual(dashboardLayoutOwner(session("MANAGER", "employee", "emp-9")), {
    kind: "EMPLOYEE",
    employeeId: "emp-9",
  });
  assert.equal(dashboardLayoutOwner(session("FACILITY_ADMINISTRATOR", "harbor_staff")), null);
  assert.equal(viewerOf(facts({ session: session("FACILITY_ADMINISTRATOR", "harbor_staff") })).canCustomize, false);
});

function catalog(overrides: Partial<DashboardDepartmentCatalog> = {}): DashboardDepartmentCatalog {
  return {
    departments: [
      { ...FN, isActive: true, showInEmployeeApp: true },
      { ...EVS, isActive: true, showInEmployeeApp: true },
      { ...PLANT, isActive: true, showInEmployeeApp: false },
      { ...ACTIVITIES, isActive: true, showInEmployeeApp: true },
      { id: "dept-old", key: "LAUNDRY", name: "Laundry", sortOrder: 5, isActive: false, showInEmployeeApp: true },
    ],
    entitlements: [],
    billingStatus: "UNMANAGED",
    entitlementsEnforced: false,
    ...overrides,
  };
}

test("Department selection: released products, custom Departments, Plant by runtime, Harbor sees development", () => {
  const ids = (departments: { id: string }[]) => departments.map((department) => department.id);
  assert.deepEqual(
    ids(selectDashboardDepartments({ authKind: "user", catalog: catalog(), plantRuntimeEnabled: false })),
    [FN.id, ACTIVITIES.id],
    "EVS is DEVELOPMENT; Plant is hidden without runtime; inactive Departments never appear",
  );
  assert.deepEqual(
    ids(selectDashboardDepartments({ authKind: "user", catalog: catalog(), plantRuntimeEnabled: true })),
    [FN.id, PLANT.id, ACTIVITIES.id],
  );
  assert.deepEqual(
    ids(selectDashboardDepartments({ authKind: "harbor_staff", catalog: catalog(), plantRuntimeEnabled: false })),
    [FN.id, EVS.id, PLANT.id, ACTIVITIES.id],
    "EVS installed internally is visible to Harbor only",
  );
});

test("Department selection: EVS follows its release status", () => {
  try {
    overrideDepartmentProductStatusForTest("EVS", "AVAILABLE");
    assert.ok(
      selectDashboardDepartments({ authKind: "user", catalog: catalog(), plantRuntimeEnabled: false }).some(
        (department) => department.id === EVS.id,
      ),
    );
    overrideDepartmentProductStatusForTest("EVS", "RETIRED");
    assert.equal(
      selectDashboardDepartments({ authKind: "user", catalog: catalog(), plantRuntimeEnabled: false }).some(
        (department) => department.id === EVS.id,
      ),
      false,
    );
  } finally {
    resetDepartmentProductStatusOverridesForTest();
  }
});

test("Department selection: enforced entitlements gate products, never custom Departments", () => {
  const enforced = catalog({
    entitlementsEnforced: true,
    billingStatus: "ACTIVE",
    entitlements: [{ departmentKey: "DIETARY", status: "REVOKED" }],
  });
  const selected = selectDashboardDepartments({ authKind: "user", catalog: enforced, plantRuntimeEnabled: false });
  assert.equal(selected.some((department) => department.id === FN.id), false);
  assert.ok(selected.some((department) => department.id === ACTIVITIES.id));
});
