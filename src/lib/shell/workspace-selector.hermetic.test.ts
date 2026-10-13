import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  currentContextKeyFromSession,
  filterWorkspacePresentations,
  groupWorkspaceSelectorPresentations,
  presentAvailableContexts,
  workspaceRowAccessibleName,
  workspaceSelectorCanSwitch,
} from "@/lib/available-contexts";
import type { AppJwtPayload } from "@/lib/auth";
import type { AvailableContextRecord } from "@/lib/available-contexts";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

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

const MULTI_HAT: AvailableContextRecord[] = [
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
      kind: "facility_internal",
      contextKey: "facility_internal:terrace",
      facilityId: "terrace",
      organizationId: "owner",
      accessId: "grant-1",
      role: "FACILITY_ADMINISTRATOR",
      isHome: true,
    },
    organizationName: "Owner Health",
    facilityName: "Terrace View",
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
      allowedDepartmentIds: ["dietary"],
    },
    organizationName: "Metz Culinary Management",
    facilityName: "Terrace View",
    partnerOrganizationName: "Metz Culinary Management",
    departmentNames: ["Food & Nutrition"],
  },
  {
    context: {
      kind: "facility_partner",
      contextKey: "facility_partner:metz-hp",
      facilityId: "highpointe",
      partnerOrganizationId: "metz",
      facilityPartnerOrganizationId: "metz-hp",
      effectivePartnerRole: "PARTNER_MANAGER",
      allowedDepartmentIds: ["dietary"],
    },
    organizationName: "Metz Culinary Management",
    facilityName: "HighPointe",
    partnerOrganizationName: "Metz Culinary Management",
    departmentNames: ["Food & Nutrition"],
  },
];

test("selector groups Facilities (internal + partner) separately from Organizations", () => {
  const items = presentAvailableContexts(MULTI_HAT);
  const groups = groupWorkspaceSelectorPresentations(items);
  assert.deepEqual(
    groups.map((entry) => entry.group),
    ["Facilities", "Organizations"],
  );
  const facilities = groups[0]!.items;
  const keys = facilities.map((item) => item.contextKey);
  assert.equal(keys.includes("facility_internal:terrace"), true);
  assert.equal(keys.includes("facility_partner:metz-terrace"), true);
  assert.equal(keys.includes("facility_partner:metz-hp"), true);
  assert.equal(keys.includes("organization:metz"), false);
  assert.equal(groups[1]!.items[0]?.contextKey, "organization:metz");
});

test("same-Facility multi-hat keeps distinct contextKeys and partner provenance", () => {
  const items = presentAvailableContexts(MULTI_HAT);
  const terrace = items.filter((item) => item.title === "Terrace View");
  assert.equal(terrace.length, 2);
  assert.deepEqual(new Set(terrace.map((item) => item.contextKey)).size, 2);
  assert.equal(
    terrace.some((item) => item.contextKey === "facility_internal:terrace"),
    true,
  );
  assert.equal(
    terrace.some((item) => item.contextKey === "facility_partner:metz-terrace"),
    true,
  );
  const partner = terrace.find((item) => item.kind === "facility_partner");
  assert.equal(partner?.subtitle.includes("Metz Culinary Management"), true);
  assert.equal(
    workspaceRowAccessibleName(partner!),
    "Terrace View, Partner Manager via Metz Culinary Management",
  );
});

test("search matches name, role, and partner provenance without inventing rows", () => {
  const items = presentAvailableContexts(MULTI_HAT);
  const via = filterWorkspacePresentations(items, "metz");
  assert.equal(via.some((item) => item.contextKey === "organization:metz"), true);
  assert.equal(via.some((item) => item.contextKey === "facility_partner:metz-hp"), true);
  assert.equal(via.some((item) => item.kind === "facility_internal"), false);
  const highpointe = filterWorkspacePresentations(items, "highpointe");
  assert.deepEqual(
    highpointe.map((item) => item.contextKey),
    ["facility_partner:metz-hp"],
  );
  assert.equal(filterWorkspacePresentations(items, "no-such-workspace").length, 0);
});

test("current Workspace is keyed by contextKey, not Facility id", () => {
  const internal = currentContextKeyFromSession(
    userSession({
      scopeKind: "facility",
      facilityId: "terrace",
      role: "FACILITY_ADMINISTRATOR",
    }),
  );
  const partner = currentContextKeyFromSession(
    userSession({
      scopeKind: "facility",
      accessKind: "partner",
      facilityId: "terrace",
      partnerOrganizationId: "metz",
      facilityPartnerOrganizationId: "metz-terrace",
    }),
  );
  const organization = currentContextKeyFromSession(
    userSession({
      scopeKind: "organization",
      organizationId: "metz",
    }),
  );
  assert.equal(internal, "facility_internal:terrace");
  assert.equal(partner, "facility_partner:metz-terrace");
  assert.equal(organization, "organization:metz");
  assert.notEqual(internal, partner);

  const items = presentAvailableContexts(MULTI_HAT);
  assert.equal(workspaceSelectorCanSwitch(items, internal), true);
  assert.equal(workspaceSelectorCanSwitch(items.slice(0, 1), "organization:metz"), true);
  assert.equal(workspaceSelectorCanSwitch([], "organization:metz"), false);
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
});

test("selector posts only contextKey to enterContextAction", () => {
  const selector = source("src/components/shell/workspace-selector.tsx");
  assert.match(selector, /\/access\/enter/);
  assert.match(selector, /name="contextKey"/);
  assert.doesNotMatch(selector, /enterContextAction/);
  assert.match(selector, /Switch workspace/);
  assert.match(selector, /View My Access/);
  assert.match(selector, /data-workspace-surface/);
  assert.match(selector, /popover/);
  assert.match(selector, /fullscreen/);
  assert.match(selector, /sheet/);
  assert.match(selector, /createPortal/);
  assert.match(selector, /pointerup/);
  assert.match(selector, /position: "fixed"/);
  assert.match(selector, /max-h-\[min\(32rem/);
  assert.match(selector, /28 \* 16/);
  assert.match(selector, /w-fit min-w-0/);
  assert.doesNotMatch(selector, /facilityId/);
  assert.doesNotMatch(selector, /switch-facility/);
  assert.doesNotMatch(selector, /switchOrganizationAction/);
  assert.doesNotMatch(selector, /leavePartnerFacilityAction/);
  assert.doesNotMatch(selector, /listAvailableContexts\(/);
});

test("shells load the request-cached directory and omit PIN from the selector", () => {
  const shell = source("src/components/app-shell.tsx");
  const org = source("src/app/(organization-account)/layout.tsx");
  const partner = source("src/components/partner/partner-facility-shell.tsx");
  const model = source("src/lib/available-contexts/selector-model.ts");
  assert.match(shell, /loadWorkspaceSelectorModel/);
  assert.match(org, /loadWorkspaceSelectorModel/);
  assert.match(partner, /loadWorkspaceSelectorModel/);
  assert.match(model, /listAvailableContextsForRequest/);
  assert.match(model, /authKind !== "user"/);
  assert.match(shell, /authKind === "user" \? \(/);
  assert.match(shell, /workspaceSelectorNode\(\)/);
  assert.match(shell, /WorkspaceShellHeader/);
  assert.doesNotMatch(shell, /FacilitySwitcher/);
  assert.doesNotMatch(org, /OrganizationSwitcher/);
  assert.doesNotMatch(partner, /Return to/);
});

test("account menu stays identity-only; My Access remains a global surface", () => {
  const menu = source("src/components/sign-out-controls.tsx");
  const access = source("src/app/access/page.tsx");
  const card = source("src/components/access/context-card.tsx");
  const entry = source("src/app/access/actions.ts");
  assert.match(menu, /GlobalUserNavLinks/);
  assert.doesNotMatch(menu, /workspace-selector-row|FacilitySwitcher/);
  assert.match(access, /ContextCard/);
  assert.match(card, /OpenContextButton/);
  assert.match(entry, /enterContext\(/);
  assert.match(entry, /INVALID_CONTEXT_KEY/);
  const requestValidation = source("src/lib/session-revocation/request-validation.ts");
  assert.match(requestValidation, /facilityPartnerOrganizationId/);
  assert.match(requestValidation, /accessKind/);
  assert.match(entry, /if \(!contextKey\)/);
  assert.match(entry, /resolveDepartmentCarryoverForFacilitySwitch/);
  assert.match(entry, /applyContextTransitionCookies/);
  assert.match(access, /CONTEXT_NOT_AVAILABLE/);
});

test("legacy switcher files remain but are no longer shell chrome", () => {
  const facility = source("src/components/facility-switcher.tsx");
  const organization = source("src/components/organization-switcher.tsx");
  const leave = source("src/app/partner/actions.ts");
  assert.match(facility, /export function FacilitySwitcher/);
  assert.match(organization, /export function OrganizationSwitcher/);
  assert.match(leave, /leavePartnerFacilityAction/);
  assert.match(leave, /completePartnerFacilityTransition/);
});
