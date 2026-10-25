import assert from "node:assert/strict";
import test from "node:test";

import type { PartnerFacilitySession } from "@/lib/auth";
import { dashboardHrefForViewer, isDashboardHrefAuthorized } from "@/lib/dashboard/drill-down";
import { currentDashboardRouteFlags, selectPartnerDashboardDepartments } from "@/lib/dashboard/viewer/resolve";

const food = { id: "food", name: "Food & Nutrition" };
const plant = { id: "plant", name: "Plant Operations" };

function access(mode: "MANAGE" | "NONE" | "VIEW", isHead = false) {
  return { mode, isHead };
}

test("a partner head sees only the Departments they head", () => {
  const selected = selectPartnerDashboardDepartments(
    [food, plant],
    new Map([
      ["food", access("MANAGE", true)],
      ["plant", access("MANAGE")],
    ]),
  );
  assert.equal(selected?.authority, "DEPARTMENT_LEADER");
  assert.equal(selected?.role, "GM");
  assert.deepEqual(
    selected?.departments.map((department) => department.id),
    ["food"],
  );
});

test("a partner who can manage a Department and does not head it sees the manager Dashboard", () => {
  const selected = selectPartnerDashboardDepartments(
    [food, plant],
    new Map([
      ["food", access("MANAGE")],
      ["plant", access("NONE")],
    ]),
  );
  assert.equal(selected?.authority, "MANAGER");
  assert.equal(selected?.role, "MANAGER");
  assert.deepEqual(
    selected?.departments.map((department) => department.id),
    ["food"],
  );
});

test("a partner with nothing to manage has no Dashboard", () => {
  assert.equal(
    selectPartnerDashboardDepartments([food], new Map([["food", access("NONE")]])),
    null,
  );
});

test("partner Dashboard links open the matching partner page", () => {
  const viewer = {
    role: "MANAGER" as const,
    session: {
      scopeKind: "facility",
      accessKind: "partner",
      authKind: "user",
      facilityId: "fac-1",
      partnerOrganizationId: "org-1",
      facilityPartnerOrganizationId: "fpo-1",
    } as PartnerFacilitySession,
    routeFlags: currentDashboardRouteFlags(),
  };
  assert.equal(
    dashboardHrefForViewer(viewer, "/reports?date=2026-10-22"),
    "/partner/reports?date=2026-10-22",
  );
  assert.equal(
    dashboardHrefForViewer(viewer, "/dashboard?scope=department:food"),
    "/partner?scope=department:food",
  );
  assert.equal(isDashboardHrefAuthorized(viewer, "/reports"), true);
  assert.equal(isDashboardHrefAuthorized(viewer, "/staffing"), false);
  assert.equal(dashboardHrefForViewer({ session: { scopeKind: "facility", facilityId: "fac-1", role: "GM" } as never }, "/reports"), "/reports");
});
