import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { resolveZoneForPathname } from "@/lib/nav-zones";
import { roleMayAccessRoute } from "@/lib/route-registry";
import { issueDetailPath, repairDetailAliasPath } from "@/lib/work/issues/issue-copy";

const FLAGS = { todaysWorkEnabled: true };

test("/issues detail keeps the same STAFF+ access as the /repairs alias", () => {
  for (const role of APP_ROLES) {
    const allowed = ROLE_PRIORITY[role as AppRole] >= ROLE_PRIORITY.STAFF;
    assert.equal(
      roleMayAccessRoute("/issues/clxxxxxxxxxxxxxxxxxxxxxxxx", role, FLAGS),
      allowed,
      `${role} /issues detail`,
    );
    assert.equal(
      roleMayAccessRoute("/repairs/clxxxxxxxxxxxxxxxxxxxxxxxx", role, FLAGS),
      allowed,
      `${role} /repairs alias`,
    );
  }
});

test("/issues maps to ADMINISTRATION zone and Dietary/EVS/Plant department visibility", () => {
  assert.equal(resolveZoneForPathname("/issues/abc"), "ADMINISTRATION");
  assert.equal(pathnameAllowedForDepartmentKey("/issues/abc", "DIETARY"), true);
  assert.equal(pathnameAllowedForDepartmentKey("/issues/abc", "PLANT"), true);
  assert.equal(pathnameAllowedForDepartmentKey("/issues/abc", "EVS"), true);
});

test("detail path helpers stay stable for bookmarks", () => {
  const id = "clissue000000000000000001";
  assert.equal(issueDetailPath(id), `/issues/${id}`);
  assert.equal(repairDetailAliasPath(id), `/repairs/${id}`);
});
