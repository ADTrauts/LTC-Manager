import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { AppJwtPayload } from "@/lib/auth";

import { currentContextKeyFromSession } from "./current-key";
import { groupAvailableContextPresentations, presentAvailableContexts } from "./presentation";
import type { AvailableContextPresentation, AvailableContextRecord } from "./types";

const ACCESS_FILES = [
  "src/app/access/page.tsx",
  "src/app/access/layout.tsx",
  "src/components/access/context-card.tsx",
  "src/components/access/open-context-button.tsx",
];

function userSession(overrides: Partial<AppJwtPayload> = {}): AppJwtPayload {
  return {
    uid: "sarah",
    authKind: "user",
    authMethod: "PASSWORD",
    name: "Sarah",
    email: "sarah@example.com",
    sessionVersion: 1,
    scopeKind: "account",
    ...overrides,
  } as AppJwtPayload;
}

test("currentContextKeyFromSession maps exact User workspace keys and rejects PIN", () => {
  assert.equal(currentContextKeyFromSession(userSession({ scopeKind: "account" })), null);
  assert.equal(
    currentContextKeyFromSession(
      userSession({
        scopeKind: "organization",
        organizationId: "metz",
      }),
    ),
    "organization:metz",
  );
  assert.equal(
    currentContextKeyFromSession(
      userSession({
        scopeKind: "facility",
        facilityId: "terrace",
        role: "MANAGER",
      }),
    ),
    "facility_internal:terrace",
  );
  assert.equal(
    currentContextKeyFromSession(
      userSession({
        scopeKind: "facility",
        accessKind: "partner",
        facilityId: "terrace",
        partnerOrganizationId: "metz",
        facilityPartnerOrganizationId: "metz-terrace",
      }),
    ),
    "facility_partner:metz-terrace",
  );
  assert.equal(
    currentContextKeyFromSession(
      userSession({
        authKind: "employee",
        scopeKind: "facility",
        facilityId: "terrace",
        role: "STAFF",
        authMethod: "QUICK_PIN",
      }),
    ),
    null,
  );
  assert.equal(
    currentContextKeyFromSession(
      userSession({
        authKind: "harbor_staff",
        scopeKind: "facility",
        facilityId: "terrace",
        role: "FACILITY_ADMINISTRATOR",
      }),
    ),
    null,
  );
});

test("presentation groups omit empty sections and keep dual Facility contexts separate", () => {
  const records: AvailableContextRecord[] = [
    {
      context: {
        kind: "organization",
        contextKey: "organization:metz",
        organizationId: "metz",
        membershipId: "mem-1",
        organizationRole: "ORG_ADMIN",
      },
      organizationName: "Metz Culinary Management",
      facilityName: null,
      partnerOrganizationName: null,
      departmentNames: [],
    },
    {
      context: {
        kind: "organization",
        contextKey: "organization:owner",
        organizationId: "owner",
        membershipId: "mem-2",
        organizationRole: "ORG_MEMBER",
      },
      organizationName: "Owner Health",
      facilityName: null,
      partnerOrganizationName: null,
      departmentNames: [],
    },
    {
      context: {
        kind: "facility_internal",
        contextKey: "facility_internal:terrace",
        facilityId: "terrace",
        organizationId: "owner",
        accessId: "grant-1",
        role: "MANAGER",
        isHome: true,
      },
      organizationName: "Owner Health",
      facilityName: "Terrace View",
      partnerOrganizationName: null,
      departmentNames: [],
    },
    {
      context: {
        kind: "facility_internal",
        contextKey: "facility_internal:ecmc",
        facilityId: "ecmc",
        organizationId: "owner",
        accessId: "grant-2",
        role: "STAFF",
        isHome: false,
      },
      organizationName: "Owner Health",
      facilityName: "ECMC Hospital",
      partnerOrganizationName: null,
      departmentNames: [],
    },
    {
      context: {
        kind: "facility_partner",
        contextKey: "facility_partner:metz-terrace",
        facilityId: "terrace",
        partnerOrganizationId: "metz",
        facilityPartnerOrganizationId: "metz-terrace",
        effectivePartnerRole: "PARTNER_MANAGER",
        allowedDepartmentIds: ["dept-1"],
      },
      organizationName: "Metz Culinary Management",
      facilityName: "Terrace View",
      partnerOrganizationName: "Metz Culinary Management",
      departmentNames: ["Food & Nutrition"],
    },
    {
      context: {
        kind: "facility_partner",
        contextKey: "facility_partner:vendor-terrace",
        facilityId: "terrace",
        partnerOrganizationId: "vendor-b",
        facilityPartnerOrganizationId: "vendor-terrace",
        effectivePartnerRole: "PARTNER_VIEWER",
        allowedDepartmentIds: ["dept-1", "dept-2", "dept-3"],
      },
      organizationName: "Vendor B",
      facilityName: "Terrace View",
      partnerOrganizationName: "Vendor B",
      departmentNames: ["Food & Nutrition", "EVS", "Plant"],
    },
  ];

  const presentations = presentAvailableContexts(records);
  const groups = groupAvailableContextPresentations(presentations);
  assert.deepEqual(
    groups.map((entry) => entry.group),
    ["Organizations", "Internal Facilities", "Client Facilities"],
  );
  assert.equal(groups.find((entry) => entry.group === "Organizations")?.items.length, 2);

  const internals = groups.find((entry) => entry.group === "Internal Facilities")?.items ?? [];
  const terraceInternal = internals.find((item) => item.contextKey === "facility_internal:terrace");
  const ecmc = internals.find((item) => item.contextKey === "facility_internal:ecmc");
  assert.equal(terraceInternal?.subtitle, "Internal · Manager");
  assert.equal(terraceInternal?.isHome, true);
  assert.equal(ecmc?.subtitle, "Internal · Team Member");
  assert.equal(ecmc?.isHome, false);

  const clients = groups.find((entry) => entry.group === "Client Facilities")?.items ?? [];
  assert.equal(clients.length, 2);
  const viaMetz = clients.find((item) => item.contextKey === "facility_partner:metz-terrace");
  const viaVendor = clients.find((item) => item.contextKey === "facility_partner:vendor-terrace");
  assert.equal(viaMetz?.title, "Terrace View");
  assert.equal(viaMetz?.subtitle, "Via Metz Culinary Management · Partner Manager");
  assert.equal(viaMetz?.departmentSummary, "Food & Nutrition");
  assert.equal(viaVendor?.subtitle, "Via Vendor B · Partner Viewer");
  assert.equal(viaVendor?.departmentSummary, "3 Departments");

  const terraceCards = presentations.filter((item) => item.title === "Terrace View");
  assert.equal(terraceCards.length, 3);
  assert.deepEqual(
    terraceCards.map((item) => item.contextKey).sort(),
    ["facility_internal:terrace", "facility_partner:metz-terrace", "facility_partner:vendor-terrace"].sort(),
  );
});

test("empty presentation list yields no group headings", () => {
  const empty: AvailableContextPresentation[] = [];
  assert.deepEqual(groupAvailableContextPresentations(empty), []);
});

test("My Access page uses certified resolver and posts only contextKey", () => {
  const page = readFileSync(join(process.cwd(), "src/app/access/page.tsx"), "utf8");
  const button = readFileSync(join(process.cwd(), "src/components/access/open-context-button.tsx"), "utf8");
  const card = readFileSync(join(process.cwd(), "src/components/access/context-card.tsx"), "utf8");
  const layout = readFileSync(join(process.cwd(), "src/app/access/layout.tsx"), "utf8");

  assert.match(page, /listAvailableContextsForRequest/);
  assert.match(page, /presentAvailableContexts/);
  assert.match(page, /currentContextKeyFromSession/);
  assert.match(page, /getAuthenticatedUserSession/);
  assert.equal(page.includes("getSession("), false);
  assert.equal(page.includes("enterAccountContext"), false);
  assert.match(page, /That access is no longer available/);
  assert.match(page, /Your access list has been refreshed/);
  assert.match(page, /That request was invalid/);
  assert.match(page, /You do not currently have access to any organizations or facilities/);
  assert.match(page, /Your account is still active/);
  assert.match(page, /Choose where you would like to work/);

  assert.match(button, /enterContextAction/);
  assert.match(button, /name="contextKey"/);
  assert.match(button, /Opening…/);
  assert.equal(button.includes("name=\"role\""), false);
  assert.equal(button.includes("organizationRole"), false);
  assert.equal(button.includes("facilityId"), false);

  assert.match(card, /Home/);
  assert.match(card, /Current/);
  assert.match(card, /aria-current/);
  assert.equal(card.includes("@prisma"), false);
  assert.equal(card.includes("resolveFacilityAuthorization"), false);
  assert.equal(layout.includes("AppShell"), false);
  assert.equal(layout.includes("OrganizationSwitcher"), false);
  assert.match(layout, /GlobalUserLayout/);
  assert.equal(layout.includes("enterAccountContext"), false);
});

test("My Access UI does not import Employee, PIN, or topology authority", () => {
  for (const file of ACCESS_FILES) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.equal(source.includes("employee-identity"), false, file);
    assert.equal(source.includes("Employee.userId"), false, file);
    assert.equal(source.includes("pinDigest"), false, file);
    assert.equal(source.includes("PlatformStaff"), false, file);
    assert.equal(source.includes("listAuthorizedPartnerFacilitiesForUser"), false, file);
    assert.equal(source.includes("Facility.organizationId"), false, file);
  }
});

test("AccountMenu shows My Access only when opted in; PIN stays hidden", () => {
  const menu = readFileSync(join(process.cwd(), "src/components/sign-out-controls.tsx"), "utf8");
  const shell = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
  assert.match(menu, /showMyAccess/);
  assert.match(menu, /GlobalUserNavLinks/);
  assert.match(shell, /showMyAccess=\{authKind === "user"\}/);
  assert.equal(shell.includes('showMyAccess={true}'), false);
  assert.equal(menu.includes("listAvailableContexts"), false);
  assert.equal(shell.includes("listAvailableContexts"), false);
});

test("Organization and partner shells use the shared User menu without replacing leave behavior", () => {
  const organization = readFileSync(
    join(process.cwd(), "src/app/(organization-account)/layout.tsx"),
    "utf8",
  );
  const partner = readFileSync(
    join(process.cwd(), "src/components/partner/partner-facility-shell.tsx"),
    "utf8",
  );
  assert.match(organization, /GlobalUserMenu/);
  assert.match(organization, /OrganizationSwitcher/);
  assert.equal(organization.includes("listAvailableContexts"), false);
  assert.match(partner, /GlobalUserMenu/);
  assert.match(partner, /leavePartnerFacilityAction/);
  assert.match(partner, /Return to \{shell\.partnerOrganizationName\}/);
  assert.equal(partner.includes("enterAccountContext"), false);
  assert.equal(partner.includes("listAvailableContexts"), false);
});
