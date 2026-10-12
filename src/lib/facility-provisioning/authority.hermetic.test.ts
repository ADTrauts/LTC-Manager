import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isHarborOwnerSession } from "@/lib/harbor-console/auth";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

test("only Harbor OWNER may provision", () => {
  assert.equal(isHarborOwnerSession({ staffRole: "OWNER" }), true);
  assert.equal(isHarborOwnerSession({ staffRole: "MEMBER" }), false);
  assert.equal(isHarborOwnerSession(null), false);
  assert.equal(isHarborOwnerSession(undefined), false);
});

test("Harbor provision surfaces require OWNER, not MEMBER or tenant sessions", () => {
  const auth = source("src/lib/harbor-console/auth.ts");
  const page = source("src/app/console/(staff)/customers/new/page.tsx");
  const actions = source("src/app/console/(staff)/customers/provision-actions.ts");
  const list = source("src/app/console/(staff)/customers/page.tsx");
  assert.match(auth, /export async function requireHarborOwner/);
  assert.match(auth, /if \(!staff \|\| !staff.isActive\)/);
  assert.match(auth, /staff.sessionVersion !== session.sessionVersion/);
  assert.match(auth, /HARBOR_SESSION_COOKIE/);
  assert.match(auth, /export async function requireHarborOwner/);
  assert.match(auth, /requireHarborStaff\(\)/);
  assert.match(page, /requireHarborOwner/);
  assert.match(actions, /requireHarborOwner/);
  assert.match(list, /isHarborOwnerSession/);
  assert.match(list, /New customer/);
  assert.doesNotMatch(actions, /assertFacilityAdministrator|ORG_ADMIN|requireFacilitySession/);
});
