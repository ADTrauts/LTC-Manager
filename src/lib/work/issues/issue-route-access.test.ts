import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { resolveZoneForPathname } from "@/lib/nav-zones";
import { roleMayAccessRoute } from "@/lib/route-registry";
import { issueDetailPath, repairDetailAliasPath } from "@/lib/work/issues/issue-copy";

const FLAGS = { };

test("repair detail is STAFF+ and is not registered at /issues", () => {
  for (const role of APP_ROLES) {
    const allowed = ROLE_PRIORITY[role as AppRole] >= ROLE_PRIORITY.STAFF;
    assert.equal(
      roleMayAccessRoute("/repairs/clxxxxxxxxxxxxxxxxxxxxxxxx", role, FLAGS),
      allowed,
      `${role} /repairs`,
    );
    assert.equal(roleMayAccessRoute("/issues/clxxxxxxxxxxxxxxxxxxxxxxxx", role, FLAGS), false);
  }
});

test("repairs map to ADMINISTRATION and stay visible for Dietary, EVS, and Plant", () => {
  assert.equal(resolveZoneForPathname("/repairs/abc"), "ADMINISTRATION");
  assert.equal(pathnameAllowedForDepartmentKey("/repairs/abc", "DIETARY"), true);
  assert.equal(pathnameAllowedForDepartmentKey("/repairs/abc", "PLANT"), true);
  assert.equal(pathnameAllowedForDepartmentKey("/repairs/abc", "EVS"), true);
});

test("/asset-issues list is a registered STAFF+ frontline surface", () => {
  for (const role of APP_ROLES) {
    const allowed = ROLE_PRIORITY[role as AppRole] >= ROLE_PRIORITY.STAFF;
    assert.equal(roleMayAccessRoute("/asset-issues", role, FLAGS), allowed, `${role} /asset-issues`);
    assert.equal(
      roleMayAccessRoute("/asset-issues/clxxxxxxxxxxxxxxxxxxxxxxxx", role, FLAGS),
      allowed,
      `${role} /asset-issues detail`,
    );
  }
  assert.equal(pathnameAllowedForDepartmentKey("/asset-issues", "DIETARY"), true);
  assert.equal(pathnameAllowedForDepartmentKey("/asset-issues", "PLANT"), true);
});

test("detail path helpers point at canonical /repairs", () => {
  const id = "clissue000000000000000001";
  assert.equal(issueDetailPath(id), `/repairs/${id}`);
  assert.equal(repairDetailAliasPath(id), `/repairs/${id}`);
});
