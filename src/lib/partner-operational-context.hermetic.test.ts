import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { APP_ROLES } from "@/lib/access";
import {
  orderPartnerDepartments,
  PARTNER_ACTIVE_DEPARTMENT_COOKIE,
  partnerDepartmentSwitch,
  selectPartnerActiveDepartment,
  type PartnerDepartmentChoice,
} from "@/lib/partner-operational-context";
import { canPartner } from "@/lib/partner-user-access";

const dietary: PartnerDepartmentChoice = { id: "dietary", name: "Food & Nutrition", sortOrder: 20 };
const evs: PartnerDepartmentChoice = { id: "evs", name: "EVS", sortOrder: 10 };

test("partner active department follows canonical sortOrder then name", () => {
  assert.deepEqual(
    orderPartnerDepartments([dietary, evs]).map((department) => department.id),
    ["evs", "dietary"],
  );
  assert.equal(selectPartnerActiveDepartment([dietary], null), "dietary");
  assert.equal(selectPartnerActiveDepartment([dietary, evs], "evs"), "evs");
  assert.equal(selectPartnerActiveDepartment([dietary], "evs"), "dietary");
  assert.equal(selectPartnerActiveDepartment([dietary, evs], null), "evs");
  assert.equal(selectPartnerActiveDepartment([], "dietary"), null);
});

test("partner department switch persists only an allowed department", () => {
  let partnerCookie = "dietary";
  const internalCookie = "evs";
  const allowed = partnerDepartmentSwitch([dietary, evs], "evs");
  if (allowed.ok) partnerCookie = allowed.departmentId;
  assert.equal(partnerCookie, "evs");
  assert.equal(internalCookie, "evs");

  partnerCookie = "dietary";
  const denied = partnerDepartmentSwitch([dietary], "evs");
  if (denied.ok) partnerCookie = denied.departmentId;
  assert.equal(denied.ok, false);
  assert.equal(partnerCookie, "dietary");
  assert.equal(PARTNER_ACTIVE_DEPARTMENT_COOKIE, "ltc_partner_active_department");
});

test("partner capabilities are named and reject facility roles", () => {
  assert.equal(canPartner("PARTNER_VIEWER", "logs.read"), true);
  assert.equal(canPartner("PARTNER_VIEWER", "logs.submit"), false);
  assert.equal(canPartner("PARTNER_VIEWER", "logs.correct"), false);
  assert.equal(canPartner("PARTNER_OPERATOR", "logs.read"), true);
  assert.equal(canPartner("PARTNER_OPERATOR", "logs.submit"), true);
  assert.equal(canPartner("PARTNER_OPERATOR", "logs.correct"), false);
  assert.equal(canPartner("PARTNER_MANAGER", "logs.read"), true);
  assert.equal(canPartner("PARTNER_MANAGER", "logs.submit"), true);
  assert.equal(canPartner("PARTNER_MANAGER", "logs.correct"), true);
  for (const role of APP_ROLES) {
    assert.equal(canPartner(role as never, "logs.read"), false);
  }
});

test("partner operational context stays off the internal department path", () => {
  const root = process.cwd();
  const context = readFileSync(join(root, "src/lib/partner-operational-context.ts"), "utf8");
  const shell = readFileSync(join(root, "src/components/partner/partner-facility-shell.tsx"), "utf8");
  const page = readFileSync(join(root, "src/app/partner/page.tsx"), "utf8");
  const action = readFileSync(join(root, "src/app/partner/actions.ts"), "utf8");
  const routes = readFileSync(join(root, "src/lib/route-registry/platform-routes.ts"), "utf8");
  for (const source of [context, shell, page]) {
    assert.equal(source.includes("departmentFilterIdsForSession"), false);
    assert.equal(source.includes("resolveActiveDepartmentForShell"), false);
    assert.equal(source.includes("getSession("), false);
    assert.equal(source.includes("employee.find"), false);
    assert.equal(source.includes("ltc_active_department"), false);
  }
  assert.match(action, /PARTNER_ACTIVE_DEPARTMENT_COOKIE/);
  assert.equal(action.includes('from "@/lib/department-nav"'), false);
  assert.equal(action.includes("ltc_active_department"), false);
  assert.equal(action.includes("primaryDepartmentId"), false);
  assert.equal(action.includes("employeeDepartment"), false);
  assert.match(routes, /pattern: "\/partner\/logs"/);
  assert.match(routes, /pattern: "\/staffing\/logs"/);
});
