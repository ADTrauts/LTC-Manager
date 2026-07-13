import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOrganizationBelongsToFacilitySession,
  assertSameFacilityScope,
  canEditOrganizationSettings,
  canReassignFacilityOrganization,
  isOrganizationType,
  loadOrganizationContext,
  loadOrganizationContextForSessionFacility,
  normalizeOrganizationKey,
  resolveOrganizationCreateName,
} from "@/lib/organization";

test("normalizeOrganizationKey trims, collapses space, and lowercases", () => {
  assert.equal(normalizeOrganizationKey("  Metz   Culinary  "), "metz culinary");
  assert.equal(normalizeOrganizationKey("Metz Culinary"), normalizeOrganizationKey("metz culinary"));
});

test("resolveOrganizationCreateName uses management company when present", () => {
  const resolved = resolveOrganizationCreateName({
    facilityName: "Terrace View",
    managementCompanyName: "  Metz Culinary  ",
  });
  assert.equal(resolved.name, "Metz Culinary");
  assert.equal(resolved.organizationType, "MANAGEMENT_COMPANY");
});

test("resolveOrganizationCreateName falls back to facility Organization name", () => {
  const resolved = resolveOrganizationCreateName({
    facilityName: "Terrace View",
    managementCompanyName: null,
  });
  assert.equal(resolved.name, "Terrace View Organization");
  assert.equal(resolved.organizationType, "OTHER");
});

test("resolveOrganizationCreateName ignores blank management company", () => {
  const resolved = resolveOrganizationCreateName({
    facilityName: "ECMC Campus",
    managementCompanyName: "   ",
  });
  assert.equal(resolved.name, "ECMC Campus Organization");
});

test("isOrganizationType accepts known enum values only", () => {
  assert.equal(isOrganizationType("MANAGEMENT_COMPANY"), true);
  assert.equal(isOrganizationType("NOT_A_TYPE"), false);
});

test("canEditOrganizationSettings is FA-only", () => {
  assert.equal(canEditOrganizationSettings("FACILITY_ADMINISTRATOR"), true);
  assert.equal(canEditOrganizationSettings("GM"), false);
  assert.equal(canEditOrganizationSettings("MANAGER"), false);
  assert.equal(canEditOrganizationSettings("STAFF"), false);
});

test("canReassignFacilityOrganization is blocked for all roles in M1", () => {
  assert.equal(canReassignFacilityOrganization("FACILITY_ADMINISTRATOR"), false);
  assert.equal(canReassignFacilityOrganization("GM"), false);
});

test("assertSameFacilityScope denies sibling facility even under shared organization", () => {
  assert.doesNotThrow(() => assertSameFacilityScope("fac_a", "fac_a"));
  assert.throws(
    () => assertSameFacilityScope("fac_a", "fac_b"),
    /Cross-facility access denied/,
  );
});

test("assertOrganizationBelongsToFacilitySession denies cross-organization targets", () => {
  assert.doesNotThrow(() =>
    assertOrganizationBelongsToFacilitySession({
      sessionFacilityId: "fac_a",
      sessionOrganizationId: "org_1",
      targetOrganizationId: "org_1",
    }),
  );
  assert.throws(
    () =>
      assertOrganizationBelongsToFacilitySession({
        sessionFacilityId: "fac_a",
        sessionOrganizationId: "org_1",
        targetOrganizationId: "org_2",
      }),
    /Cross-organization access denied/,
  );
});

test("loadOrganizationContext derives org through facility and keeps facility as scope", async () => {
  const db = {
    facility: {
      findUnique: async () => ({
        id: "fac_1",
        displayName: "Terrace View",
        organizationId: "org_1",
        organization: {
          id: "org_1",
          name: "Metz Culinary Management",
          legalName: "Metz LLC",
          displayName: "Metz",
          organizationType: "MANAGEMENT_COMPANY",
          isActive: true,
        },
      }),
    },
  };

  const context = await loadOrganizationContext("fac_1", db as never);
  assert.equal(context.organizationId, "org_1");
  assert.equal(context.organizationName, "Metz");
  assert.equal(context.facilityId, "fac_1");
  assert.equal(context.facilityName, "Terrace View");
});

test("loadOrganizationContext rejects missing facility", async () => {
  const db = {
    facility: {
      findUnique: async () => null,
    },
  };
  await assert.rejects(() => loadOrganizationContext("missing", db as never), /Facility not found/);
});

test("loadOrganizationContext rejects missing organization relation", async () => {
  const db = {
    facility: {
      findUnique: async () => ({
        id: "fac_1",
        displayName: "Orphan",
        organizationId: "org_missing",
        organization: null,
      }),
    },
  };
  await assert.rejects(
    () => loadOrganizationContext("fac_1", db as never),
    /missing an Organization relation/,
  );
});

test("loadOrganizationContextForSessionFacility returns null safely", async () => {
  assert.equal(await loadOrganizationContextForSessionFacility(null), null);
  assert.equal(await loadOrganizationContextForSessionFacility(""), null);

  const db = {
    facility: {
      findUnique: async () => null,
    },
  };
  assert.equal(await loadOrganizationContextForSessionFacility("bad", db as never), null);
});

test("shared organization key grouping is deterministic for identical company names", () => {
  const a = normalizeOrganizationKey("Metz Culinary");
  const b = normalizeOrganizationKey("  Metz Culinary  ");
  assert.equal(a, b);
  // Minor spelling differences intentionally do NOT collapse
  assert.notEqual(normalizeOrganizationKey("Metz Culinary"), normalizeOrganizationKey("Metz Culnary"));
});

test("backfill naming contract: company orgs vs per-facility fallback", () => {
  const withCompany = resolveOrganizationCreateName({
    facilityName: "Site A",
    managementCompanyName: "Acme Food",
  });
  const without = resolveOrganizationCreateName({
    facilityName: "Site B",
    managementCompanyName: null,
  });
  assert.equal(withCompany.name, "Acme Food");
  assert.equal(without.name, "Site B Organization");
});
