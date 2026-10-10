import assert from "node:assert/strict";
import test from "node:test";

import type { AppJwtPayload } from "@/lib/auth";

import { presentCurrentContextFromSession } from "./current-presentation";

function userSession(overrides: Partial<AppJwtPayload> = {}): AppJwtPayload {
  return {
    uid: "andrew",
    authKind: "user",
    authMethod: "PASSWORD",
    name: "Andrew Trautman",
    email: "andrew@example.com",
    sessionVersion: 1,
    scopeKind: "account",
    ...overrides,
  } as AppJwtPayload;
}

test("presentCurrentContextFromSession labels Internal with session role and shell Facility name", () => {
  const presented = presentCurrentContextFromSession(
    userSession({
      scopeKind: "facility",
      facilityId: "terrace",
      role: "MANAGER",
    }),
    { facilityName: "Terrace View" },
  );
  assert.deepEqual(presented, { title: "Terrace View", subtitle: "Internal · Manager" });
});

test("presentCurrentContextFromSession labels partner Via org without listing other contexts", () => {
  const presented = presentCurrentContextFromSession(
    userSession({
      scopeKind: "facility",
      accessKind: "partner",
      facilityId: "terrace",
      partnerOrganizationId: "metz",
      facilityPartnerOrganizationId: "metz-terrace",
    }),
    {
      facilityName: "Terrace View",
      partnerOrganizationName: "Metz",
      partnerRole: "PARTNER_MANAGER",
    },
  );
  assert.deepEqual(presented, {
    title: "Terrace View",
    subtitle: "Via Metz · Partner Manager",
  });
});

test("presentCurrentContextFromSession labels Organization from shell membership facts", () => {
  const presented = presentCurrentContextFromSession(
    userSession({
      scopeKind: "organization",
      organizationId: "metz",
    }),
    { organizationName: "Metz", organizationRole: "ORG_ADMIN" },
  );
  assert.deepEqual(presented, {
    title: "Metz",
    subtitle: "Organization · Administrator",
  });
});

test("presentCurrentContextFromSession uses the account empty-workspace label", () => {
  assert.deepEqual(presentCurrentContextFromSession(userSession({ scopeKind: "account" })), {
    title: "My Access",
    subtitle: "No workspace selected",
  });
});

test("presentCurrentContextFromSession hides PIN and Harbor", () => {
  assert.equal(
    presentCurrentContextFromSession(
      userSession({
        authKind: "employee",
        scopeKind: "facility",
        facilityId: "terrace",
        role: "STAFF",
        authMethod: "QUICK_PIN",
      }),
      { facilityName: "Terrace View" },
    ),
    null,
  );
  assert.equal(
    presentCurrentContextFromSession(
      userSession({
        authKind: "harbor_staff",
        scopeKind: "facility",
        facilityId: "terrace",
        role: "FACILITY_ADMINISTRATOR",
      }),
      { facilityName: "Terrace View" },
    ),
    null,
  );
});
