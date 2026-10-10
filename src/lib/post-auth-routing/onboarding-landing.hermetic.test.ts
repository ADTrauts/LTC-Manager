import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIRECT_MINTS = [
  "createSessionToken",
  "createOrganizationSessionToken",
  "createPartnerFacilitySessionToken",
  "createAccountSessionToken",
];

const LEGACY_REPAIR = [
  "resolveInternalFacilitySessionRole",
  "ensureCurrentInternalFacilityRole",
  "ensureUserFacilityAccessGrant",
];

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function assertNoDirectMints(relative: string) {
  const text = source(relative);
  for (const name of DIRECT_MINTS) {
    assert.equal(text.includes(name), false, `${relative} still mints via ${name}`);
  }
}

test("signup uses enterGrantedContext and keeps /setup", () => {
  const text = source("src/app/api/auth/signup/route.ts");
  assert.ok(text.includes("enterGrantedContext"));
  assert.ok(text.includes("internalFacilityContextKey"));
  assert.ok(text.includes("ONBOARDING_ENTRY_PATH"));
  assert.ok(text.includes("applyAuthenticatedUserLandingCookies"));
  assert.ok(text.includes("ensureUserFacilityAccessGrant"));
  assert.equal(text.includes("resolveInternalFacilitySessionRole"), false);
  assert.equal(text.includes("createSessionToken"), false);
  assert.equal(text.includes("user.role"), false);
  assertNoDirectMints("src/app/api/auth/signup/route.ts");
});

test("verification is signup completion with invite-pending and router fallback", () => {
  const text = source("src/app/api/auth/email-verification/confirm/route.ts");
  assert.ok(text.includes("enterGrantedContext"));
  assert.ok(text.includes("routeAuthenticatedUser"));
  assert.ok(text.includes("INVITE_PENDING"));
  assert.ok(text.includes("passwordHash"));
  assert.ok(text.includes("resolveCurrentInternalFacilityRole"));
  assert.ok(text.includes("isOnboardingComplete"));
  assert.equal(text.includes("resolveInternalFacilitySessionRole"), false);
  assert.equal(text.includes("ensureUserFacilityAccessGrant"), false);
  assert.equal(text.includes("user.role"), false);
  assertNoDirectMints("src/app/api/auth/email-verification/confirm/route.ts");
});

test("Facility account invite enters the home Facility without repairing grants", () => {
  const text = source("src/app/api/auth/account-invite/confirm/route.ts");
  assert.ok(text.includes("enterGrantedContext"));
  assert.ok(text.includes("internalFacilityContextKey"));
  assert.ok(text.includes("landing.redirectPath"));
  assert.equal(text.includes("/dashboard"), false);
  assert.equal(text.includes("resolveInternalFacilitySessionRole"), false);
  for (const name of LEGACY_REPAIR) {
    assert.equal(text.includes(name), false, name);
  }
  assertNoDirectMints("src/app/api/auth/account-invite/confirm/route.ts");
});

test("Organization invite and claim enter the accepted Organization", () => {
  const invite = source("src/app/api/auth/organization-member-invitation/accept/route.ts");
  const claim = source("src/app/api/auth/organization-claim/accept/route.ts");
  for (const [label, text] of [
    ["invite", invite],
    ["claim", claim],
  ] as const) {
    assert.ok(text.includes("enterGrantedContext"), label);
    assert.ok(text.includes("organizationContextKey"), label);
    assert.ok(text.includes("applyAuthenticatedUserLandingCookies"), label);
    assert.equal(text.includes("routeAuthenticatedUser"), false, label);
    assertNoDirectMints(
      label === "invite"
        ? "src/app/api/auth/organization-member-invitation/accept/route.ts"
        : "src/app/api/auth/organization-claim/accept/route.ts",
    );
  }
});

test("Employee link acceptance preserves the current session", () => {
  const text = source("src/app/api/auth/employee-link/accept/route.ts");
  assert.equal(text.includes("enterGrantedContext"), false);
  assert.equal(text.includes("routeAuthenticatedUser"), false);
  assert.equal(text.includes("enterContext"), false);
  assert.equal(text.includes("cookies.set"), false);
  assert.equal(text.includes("SESSION_COOKIE"), false);
  assertNoDirectMints("src/app/api/auth/employee-link/accept/route.ts");
});

test("password login, PIN, and Harbor stay on their certified planes", () => {
  const login = source("src/app/api/auth/login/route.ts");
  assert.ok(login.includes("routeAuthenticatedUser"));
  assert.equal(login.includes("enterGrantedContext"), false);
  const pin = source("src/app/api/auth/pin-login/route.ts");
  const harbor = source("src/app/api/console/auth/login/route.ts");
  for (const [label, text] of [
    ["pin", pin],
    ["harbor", harbor],
  ] as const) {
    assert.equal(text.includes("enterGrantedContext"), false, label);
    assert.equal(text.includes("routeAuthenticatedUser"), false, label);
    assert.equal(text.includes("listAvailableContexts"), false, label);
  }
});

test("legacy session-role repair helper is gone", () => {
  const impl = source("src/lib/facility-access/internal-facility-role.ts");
  const index = source("src/lib/facility-access/index.ts");
  assert.equal(impl.includes("resolveInternalFacilitySessionRole"), false);
  assert.equal(index.includes("resolveInternalFacilitySessionRole"), false);
});

test("clients follow server nextPath and drop /dashboard success fallback", () => {
  const invite = source("src/components/accept-invite-form.tsx");
  assert.ok(invite.includes("router.replace(nextPath)"));
  assert.equal(invite.includes("/dashboard"), false);
  const claim = source("src/components/organization-claim-accept-form.tsx");
  assert.ok(claim.includes("router.replace(nextPath)"));
  assert.equal(claim.includes('"/organization"'), false);
  const signup = source("src/components/signup-form.tsx");
  assert.ok(signup.includes("/setup"));
  const verify = source("src/components/verify-email-client.tsx");
  assert.ok(verify.includes("/setup"));
});
