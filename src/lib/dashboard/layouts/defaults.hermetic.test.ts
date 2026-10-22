import assert from "node:assert/strict";
import test from "node:test";

import { getDashboardCard } from "../cards/registry";
import type { EligibleDashboardCard } from "../cards/eligibility";
import type { DashboardCardId } from "../cards/types";
import type { DashboardAuthority, DashboardScopeKind } from "../viewer/types";

import { defaultLayoutFor, placeDashboardCards } from "./defaults";

function eligible(id: DashboardCardId): EligibleDashboardCard {
  const card = getDashboardCard(id);
  if (!card) throw new Error(id);
  return {
    card,
    form: "full",
    accessMode: "MANAGE",
    drillDown: null,
    actionsAllowed: true,
    notConfigured: null,
    canFix: false,
  };
}

function layout(authority: DashboardAuthority, kind: DashboardScopeKind) {
  return defaultLayoutFor({
    authority,
    scope: kind === "FACILITY" ? { kind } : { kind, departmentId: "dept" },
  });
}

test("each role gets its catalog layout, and a Department lens uses the leader list", () => {
  assert.deepEqual(layout("SUPERVISOR", "TEAM").map((item) => item.id).slice(0, 2), ["shift_now", "attention"]);
  assert.equal(layout("SUPERVISOR", "TEAM").find((item) => item.id === "shift_now")?.size, "L");
  assert.equal(layout("MANAGER", "DEPARTMENT").some((item) => item.id === "shift_now"), false);
  assert.equal(layout("MANAGER", "DEPARTMENT").some((item) => item.id === "department_setup"), false);

  const leader = layout("DEPARTMENT_LEADER", "DEPARTMENT").map((item) => item.id);
  assert.equal(leader[leader.indexOf("timeline") + 1], "department_setup");
  assert.deepEqual(layout("FACILITY_ADMINISTRATOR", "DEPARTMENT").map((item) => item.id), leader);

  assert.deepEqual(layout("FACILITY_ADMINISTRATOR", "FACILITY").map((item) => item.id).slice(0, 3), [
    "attention",
    "departments_glance",
    "facility_setup",
  ]);
});

test("placement keeps layout order and drops cards the Department cannot show", () => {
  const food = placeDashboardCards(
    ["shift_now", "attention", "menu_today", "pm_due", "timeline"].map(eligible),
    layout("SUPERVISOR", "TEAM"),
  );
  assert.deepEqual(
    food.map((item) => item.eligible.card.id),
    ["shift_now", "attention", "menu_today", "pm_due"],
  );
  assert.equal(food[0]?.size, "L");

  const plant = placeDashboardCards(
    ["attention", "maintenance_open", "pm_due", "request_triage"].map(eligible),
    layout("DEPARTMENT_LEADER", "DEPARTMENT"),
  );
  assert.deepEqual(
    plant.map((item) => item.eligible.card.id),
    ["attention", "request_triage", "pm_due", "maintenance_open"],
  );
  assert.equal(plant.some((item) => item.eligible.card.id === "timeline"), false);
  assert.equal(plant.some((item) => item.eligible.card.id === "menu_today"), false);
});
