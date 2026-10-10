import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const ACCOUNT_FILES = [
  "src/app/account/page.tsx",
  "src/app/account/layout.tsx",
  "src/app/account/security/page.tsx",
  "src/app/account/security/actions.ts",
  "src/components/global-user-layout.tsx",
  "src/components/global-user-menu.tsx",
];

test("global account pages are User-session profile and security, not Facility AppShell", () => {
  const profile = source("src/app/account/page.tsx");
  const security = source("src/app/account/security/page.tsx");
  const layout = source("src/app/account/layout.tsx");
  const accessLayout = source("src/app/access/layout.tsx");

  assert.match(profile, /getAuthenticatedUserSession/);
  assert.match(profile, /displayName/);
  assert.match(profile, /user\.email/);
  assert.match(profile, /href="\/account\/security"/);
  assert.equal(profile.includes("requireFacilitySession"), false);
  assert.equal(profile.includes("AppShell"), false);
  assert.equal(profile.includes("facilityId"), false);
  assert.equal(profile.includes("Employee"), false);
  assert.equal(profile.includes("Home Facility"), false);
  assert.equal(profile.includes("enterAccountContext"), false);

  assert.match(security, /ChangePasswordForm/);
  assert.match(security, /signs you out of Vssyl on all devices, including this one/);
  assert.equal(security.includes("sign out other sessions"), false);
  assert.equal(security.includes("requireFacilitySession"), false);

  assert.match(layout, /GlobalUserLayout/);
  assert.match(accessLayout, /GlobalUserLayout/);
  assert.equal(layout.includes("OrganizationSwitcher"), false);
  assert.equal(layout.includes("PartnerDepartmentSwitch"), false);
});

test("shared User menu is links plus current-context display, not a second chooser", () => {
  const menu = source("src/components/global-user-menu.tsx");
  const layout = source("src/components/global-user-layout.tsx");
  assert.match(menu, /My Access/);
  assert.match(menu, /My Account/);
  assert.match(menu, /Sign out/);
  assert.match(menu, /href="\/access"/);
  assert.match(menu, /href="\/account"/);
  assert.equal(menu.includes("listAvailableContexts"), false);
  assert.equal(menu.includes("enterContext"), false);
  assert.match(layout, /My Access/);
  assert.match(layout, /My Account/);
  assert.match(layout, /Sign out/);
  assert.equal(layout.includes("listAvailableContexts"), false);
});

test("global account surfaces do not import Employee, PIN, or topology authority", () => {
  for (const file of ACCOUNT_FILES) {
    const text = source(file);
    assert.equal(text.includes("employee-identity"), false, file);
    assert.equal(text.includes("pinDigest"), false, file);
    assert.equal(text.includes("PlatformStaff"), false, file);
    assert.equal(text.includes("listAvailableContexts"), false, file);
    assert.equal(text.includes("User.facilityId"), false, file);
  }
});
