import assert from "node:assert/strict";
import test from "node:test";

import type { AppRole } from "@/lib/access";
import type { AuthKind, FacilitySession } from "@/lib/auth";
import { authorizeRoute, type RouteFeatureFlags } from "@/lib/route-registry/authorize";

import {
  DASHBOARD_CAPABILITIES,
  type DashboardCapability,
  type DepartmentDashboardCapabilities,
  type NotConfiguredReason,
} from "../capabilities";
import type {
  DashboardAuthority,
  DashboardDepartmentAccessMode,
  DashboardScope,
  DashboardViewer,
} from "../viewer/types";

import { listEligibleCards, type DashboardCapabilityMap } from "./eligibility";
import { DASHBOARD_CARDS } from "./registry";
import type { DashboardCardId } from "./types";

const FN = { id: "dept-fn", key: "DIETARY", name: "Food & Nutrition", sortOrder: 1 };
const PLANT = { id: "dept-plant", key: "PLANT", name: "Plant Operations", sortOrder: 2 };
const EVS = { id: "dept-evs", key: "EVS", name: "Environmental Services", sortOrder: 3 };

const ALL_FLAGS: RouteFeatureFlags = {
  todaysWorkEnabled: true,
  dietaryOperationalEvidenceEnabled: true,
  dietaryWorkPlansEnabled: true,
  canonicalLogsEnabled: true,
};

function viewer(input: {
  role: AppRole;
  authority: DashboardAuthority;
  scope: DashboardScope | null;
  departments?: (typeof FN)[];
  access?: Record<string, DashboardDepartmentAccessMode>;
  routeFlags?: RouteFeatureFlags;
  authKind?: AuthKind;
}): DashboardViewer {
  const departments = input.departments ?? [FN];
  const session = {
    uid: "viewer",
    authKind: input.authKind ?? "user",
    scopeKind: "facility",
    facilityId: "fac-1",
    role: input.role,
  } as FacilitySession;
  return {
    facilityId: "fac-1",
    facilityTimezone: "America/New_York",
    serviceDate: "2026-10-20",
    session,
    role: input.role,
    authority: input.authority,
    employeeId: null,
    layoutOwner: { kind: "USER", userId: "viewer" },
    ledDepartmentIds: input.authority === "DEPARTMENT_LEADER" ? departments.map((row) => row.id) : [],
    departments,
    scopeDepartmentIds: departments.map((row) => row.id),
    departmentAccess:
      input.access ?? Object.fromEntries(departments.map((row) => [row.id, "MANAGE" as const])),
    operators: {},
    scope: input.scope,
    availableScopes: input.scope ? [input.scope] : [],
    notices: [],
    canCustomize: true,
    routeFlags: input.routeFlags ?? ALL_FLAGS,
  };
}

function capabilities(
  departmentId: string,
  departmentKey: string,
  has: readonly DashboardCapability[],
  notConfigured: readonly NotConfiguredReason[] = [],
): [string, DepartmentDashboardCapabilities] {
  return [departmentId, { departmentId, departmentKey, productKey: null, has: new Set(has), notConfigured }];
}

const EVERYTHING = DASHBOARD_CAPABILITIES.filter((capability) => capability !== "records.legacy");
const FULL: DashboardCapabilityMap = new Map([
  capabilities(FN.id, FN.key, EVERYTHING),
  capabilities(PLANT.id, PLANT.key, EVERYTHING),
  capabilities(EVS.id, EVS.key, EVERYTHING),
]);
const NONE: DashboardCapabilityMap = new Map([capabilities(FN.id, FN.key, [])]);

const department = (id = FN.id): DashboardScope => ({ kind: "DEPARTMENT", departmentId: id });
const team: DashboardScope = { kind: "TEAM", departmentId: FN.id, teamIds: ["t1"], roomIds: ["r1"] };
const facility: DashboardScope = { kind: "FACILITY" };

const ids = (rows: { card: { id: DashboardCardId } }[]) => rows.map((row) => row.card.id).sort();

test("registry: 18 platform cards, unique ids, sizes include the default", () => {
  assert.equal(DASHBOARD_CARDS.length, 18);
  assert.equal(new Set(DASHBOARD_CARDS.map((card) => card.id)).size, 18);
  for (const card of DASHBOARD_CARDS) {
    assert.ok(card.sizes.includes(card.defaultSize), card.id);
    assert.ok(Object.isFrozen(card), card.id);
  }
  assert.ok(Object.isFrozen(DASHBOARD_CARDS));
});

test("no scope: nothing is eligible", () => {
  assert.deepEqual(listEligibleCards(viewer({ role: "MANAGER", authority: "MANAGER", scope: null }), FULL), []);
});

test("scope kinds and authority: each band sees the catalog's cards", () => {
  const admin = listEligibleCards(
    viewer({ role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR", scope: facility, departments: [FN, PLANT] }),
    FULL,
  );
  assert.deepEqual(
    ids(admin),
    [
      "attention",
      "call_offs",
      "coverage",
      "departments_glance",
      "facility_setup",
      "maintenance_open",
      "pm_due",
      "recent_activity",
      "records_due",
      "request_triage",
      "shortcuts",
    ],
  );

  const leader = listEligibleCards(viewer({ role: "GM", authority: "DEPARTMENT_LEADER", scope: department() }), FULL);
  assert.deepEqual(
    ids(leader),
    [
      "attention",
      "call_offs",
      "coverage",
      "department_setup",
      "expected_work",
      "handoff",
      "maintenance_open",
      "menu_today",
      "pm_due",
      "recent_activity",
      "records_due",
      "request_triage",
      "rounds",
      "shift_now",
      "shortcuts",
      "timeline",
    ],
  );

  const manager = listEligibleCards(viewer({ role: "MANAGER", authority: "MANAGER", scope: department() }), FULL);
  assert.deepEqual(
    ids(manager),
    ids(leader).filter((id) => id !== "department_setup"),
  );

  const supervisorTeam = listEligibleCards(viewer({ role: "SUPERVISOR", authority: "SUPERVISOR", scope: team }), FULL);
  assert.deepEqual(
    ids(supervisorTeam),
    ["attention", "call_offs", "coverage", "handoff", "maintenance_open", "menu_today", "records_due", "rounds", "shift_now", "shortcuts"],
    "no timeline or recent activity (Manager+), no PM or triage at Team scope, no Work Plans link below Manager",
  );
});

test("capabilities: a missing capability hides the card, even from the Facility Administrator", () => {
  const manager = listEligibleCards(viewer({ role: "MANAGER", authority: "MANAGER", scope: department() }), NONE);
  assert.deepEqual(ids(manager), ["recent_activity", "shortcuts"]);

  const partial = new Map([capabilities(FN.id, FN.key, ["maintenance.shared"])]);
  const atFacility = listEligibleCards(
    viewer({ role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR", scope: facility }),
    partial,
  );
  assert.ok(ids(atFacility).includes("maintenance_open"));
  assert.ok(ids(atFacility).includes("attention"), "any attention source admits the card");
  assert.equal(ids(atFacility).includes("pm_due"), false);
});

test("not configured: leaders and managing administrators can fix; viewing administrators read; others see nothing", () => {
  const reason = { capability: "coverage.planned" as const, message: "No coverage plan is set." };
  const legacy = { capability: "records.legacy" as const, message: "This Department still uses legacy Records." };
  const missing = new Map([capabilities(FN.id, FN.key, ["records.legacy"], [reason, legacy])]);

  const leader = listEligibleCards(viewer({ role: "GM", authority: "DEPARTMENT_LEADER", scope: department() }), missing);
  const leaderCoverage = leader.find((row) => row.card.id === "coverage")!;
  assert.equal(leaderCoverage.form, "not_configured");
  assert.deepEqual(leaderCoverage.notConfigured, reason);
  assert.equal(leaderCoverage.canFix, true);
  const leaderRecords = leader.find((row) => row.card.id === "records_due")!;
  assert.deepEqual(leaderRecords.notConfigured, legacy, "missing canonical Records report the legacy reason");

  const viewingAdmin = listEligibleCards(
    viewer({
      role: "FACILITY_ADMINISTRATOR",
      authority: "FACILITY_ADMINISTRATOR",
      scope: department(),
      access: { [FN.id]: "VIEW" },
    }),
    missing,
  );
  const adminCoverage = viewingAdmin.find((row) => row.card.id === "coverage")!;
  assert.equal(adminCoverage.form, "not_configured");
  assert.equal(adminCoverage.canFix, false);

  const managingAdmin = listEligibleCards(
    viewer({ role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR", scope: department() }),
    missing,
  );
  assert.equal(managingAdmin.find((row) => row.card.id === "coverage")!.canFix, true);

  for (const [role, authority] of [
    ["MANAGER", "MANAGER"],
    ["SUPERVISOR", "SUPERVISOR"],
  ] as const) {
    const rows = listEligibleCards(viewer({ role, authority, scope: department() }), missing);
    assert.equal(rows.some((row) => row.form === "not_configured"), false, role);
  }

  const atFacility = listEligibleCards(
    viewer({ role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR", scope: facility }),
    missing,
  );
  assert.equal(atFacility.some((row) => row.form === "not_configured"), false, "setup reasons are per Department");
});

test("route flags: a card whose required link is closed is not eligible", () => {
  const supervisor = (routeFlags: RouteFeatureFlags) =>
    ids(listEligibleCards(viewer({ role: "SUPERVISOR", authority: "SUPERVISOR", scope: department(), routeFlags }), FULL));
  const closedTodaysWork = supervisor({ ...ALL_FLAGS, todaysWorkEnabled: false });
  assert.equal(closedTodaysWork.includes("handoff"), false);
  assert.equal(closedTodaysWork.includes("rounds"), false);
  assert.ok(closedTodaysWork.includes("coverage"));

  const manager = (routeFlags: RouteFeatureFlags) =>
    ids(listEligibleCards(viewer({ role: "MANAGER", authority: "MANAGER", scope: department(), routeFlags }), FULL));
  assert.equal(manager({ ...ALL_FLAGS, dietaryWorkPlansEnabled: false }).includes("expected_work"), false);
  assert.equal(
    manager({ ...ALL_FLAGS, dietaryOperationalEvidenceEnabled: false }).includes("records_due"),
    false,
  );
});

test("access modes: View swaps manage links for view links and turns actions off", () => {
  const rows = listEligibleCards(
    viewer({
      role: "FACILITY_ADMINISTRATOR",
      authority: "FACILITY_ADMINISTRATOR",
      scope: department(),
      access: { [FN.id]: "VIEW" },
    }),
    FULL,
  );
  for (const row of rows) {
    assert.equal(row.accessMode, "VIEW");
    assert.equal(row.actionsAllowed, false, row.card.id);
    assert.equal(row.canFix, false, row.card.id);
    if (row.drillDown) assert.equal(row.drillDown.intent, "view", row.card.id);
  }
  assert.deepEqual(rows.find((row) => row.card.id === "attention")!.drillDown, { href: "/units", intent: "view" });
  assert.equal(rows.find((row) => row.card.id === "coverage")!.drillDown, null);

  const managed = listEligibleCards(
    viewer({ role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR", scope: department() }),
    FULL,
  );
  assert.deepEqual(managed.find((row) => row.card.id === "coverage")!.drillDown, { href: "/staffing", intent: "manage" });
  assert.ok(managed.every((row) => row.actionsAllowed));
});

test("access modes: Summary shows summary-capable cards only, with no links or actions", () => {
  const rows = listEligibleCards(
    viewer({
      role: "FACILITY_ADMINISTRATOR",
      authority: "FACILITY_ADMINISTRATOR",
      scope: department(),
      access: { [FN.id]: "SUMMARY" },
    }),
    FULL,
  );
  assert.deepEqual(ids(rows), ["coverage", "department_setup", "records_due", "shift_now", "timeline"]);
  for (const row of rows) {
    assert.equal(row.form, "summary");
    assert.equal(row.drillDown, null);
    assert.equal(row.actionsAllowed, false);
  }
});

test("access modes: Facility scope is View unless every Department is managed", () => {
  const mixed = listEligibleCards(
    viewer({
      role: "FACILITY_ADMINISTRATOR",
      authority: "FACILITY_ADMINISTRATOR",
      scope: facility,
      departments: [FN, PLANT],
      access: { [FN.id]: "MANAGE", [PLANT.id]: "VIEW" },
    }),
    FULL,
  );
  assert.ok(mixed.every((row) => row.accessMode === "VIEW" && !row.actionsAllowed));
  assert.equal(mixed.find((row) => row.card.id === "facility_setup")!.drillDown, null);
});

test("release status: an internally installed EVS Department is eligible like any other for Harbor", () => {
  const rows = listEligibleCards(
    viewer({
      role: "FACILITY_ADMINISTRATOR",
      authority: "FACILITY_ADMINISTRATOR",
      scope: department(EVS.id),
      departments: [EVS],
      authKind: "harbor_staff",
    }),
    FULL,
  );
  assert.ok(ids(rows).includes("attention"));
  assert.ok(ids(rows).includes("shift_now"));
});

const BANDS: { role: AppRole; authority: DashboardAuthority }[] = [
  { role: "SUPERVISOR", authority: "SUPERVISOR" },
  { role: "SUPERVISOR", authority: "DEPARTMENT_LEADER" },
  { role: "MANAGER", authority: "MANAGER" },
  { role: "GM", authority: "DEPARTMENT_LEADER" },
  { role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR" },
];

test("drill-downs: every eligible card's link opens for the viewer, in every band, scope and access mode", () => {
  let checked = 0;
  for (const band of BANDS) {
    for (const scope of [facility, department(), team]) {
      for (const mode of ["MANAGE", "VIEW"] as const) {
        const subject = viewer({ ...band, scope, access: { [FN.id]: mode } });
        for (const row of listEligibleCards(subject, FULL)) {
          const hrefs = [
            ...(row.drillDown ? [row.drillDown.href] : []),
            ...row.card.drillDowns(scope.kind === "FACILITY" ? null : FN.id).flatMap((link) =>
              row.card.drillDownRequired ? [link.href, ...(link.viewHref ? [link.viewHref] : [])] : [],
            ),
          ];
          for (const href of hrefs) {
            const decision = authorizeRoute({
              pathname: href.split(/[?#]/)[0]!,
              role: band.role,
              sessionScope: "facility",
              authKind: "user",
              featureFlags: ALL_FLAGS,
            });
            assert.equal(decision.outcome, "ALLOW", `${band.role}/${band.authority} ${scope.kind} ${row.card.id} ${href}`);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 100);
});

test("drill-downs: catalog conflicts resolve toward hiding, never toward a dead link", () => {
  const supervisor = listEligibleCards(viewer({ role: "SUPERVISOR", authority: "SUPERVISOR", scope: department() }), FULL);
  assert.equal(ids(supervisor).includes("expected_work"), false, "Work Plans open from Manager");

  const supervisorHead = listEligibleCards(
    viewer({ role: "SUPERVISOR", authority: "DEPARTMENT_LEADER", scope: department() }),
    FULL,
  );
  const setup = supervisorHead.find((row) => row.card.id === "department_setup")!;
  assert.ok(setup, "a Supervisor who heads the Department still sees setup");
  assert.equal(setup.drillDown, null, "Department Builder opens from Manager");

  const gm = listEligibleCards(viewer({ role: "GM", authority: "DEPARTMENT_LEADER", scope: department() }), FULL);
  assert.deepEqual(gm.find((row) => row.card.id === "department_setup")!.drillDown, {
    href: `/build/departments/${FN.id}`,
    intent: "manage",
  });

  for (const card of DASHBOARD_CARDS) {
    for (const link of card.drillDowns(FN.id)) {
      assert.equal(link.href.startsWith("/issues"), false, `${card.id} links to a legacy surface`);
      assert.equal(link.href.startsWith("/workspace"), false, card.id);
      assert.equal(link.href.startsWith("/today?"), false, card.id);
    }
  }
});
