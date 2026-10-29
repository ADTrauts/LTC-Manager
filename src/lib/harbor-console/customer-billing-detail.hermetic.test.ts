import assert from "node:assert/strict";
import test from "node:test";

import { loadHarborFacility } from "./queries";

type FacilityRow = {
  id: string;
  displayName: string;
  billingEmail: string | null;
  onboardingCurrentStep: string | null;
  onboardingCompletedAt: Date | null;
  organizationId: string;
  stripeCustomerId: string | null;
  organization: { id: string; name: string; displayName: string | null };
  billing: {
    status: "ACTIVE" | "UNMANAGED" | "CANCELED" | "PAST_DUE" | "INCOMPLETE";
    interval: "ANNUAL" | "MONTHLY";
    setupPath: "SELF_SERVE" | "ASSISTED";
    stripeSubscriptionId: string | null;
    licensedDepartmentCount: number | null;
    updatedAt: Date;
    entitlements: Array<{ departmentKey: string; status: "ACTIVE" | "REVOKED" }>;
  } | null;
  users: Array<{
    id: string;
    displayName: string;
    email: string;
    passwordHash: string | null;
    role: { key: string };
  }>;
};

function mockClient(
  facility: FacilityRow | null,
  accesses: Array<{
    user: {
      id: string;
      displayName: string;
      email: string;
      isActive: boolean;
      passwordHash: string | null;
    };
    rolePeriods: Array<{ roleKey: string; startsAt: Date; endsAt: Date | null }>;
  }> = [],
) {
  return {
    facility: {
      async findUnique({ where }: { where: { id: string } }) {
        if (!facility || facility.id !== where.id) return null;
        return facility;
      },
    },
    userFacilityAccess: {
      async findMany() {
        return accesses;
      },
    },
  };
}

test("authorized detail load presents billing and entitlement mirror", async () => {
  const updatedAt = new Date("2026-10-07T12:00:00.000Z");
  const detail = await loadHarborFacility(
    mockClient({
      id: "fac_1",
      displayName: "Terrace View Long Term Care",
      billingEmail: "billing@example.com",
      onboardingCurrentStep: "complete",
      onboardingCompletedAt: new Date("2026-09-01T00:00:00.000Z"),
      organizationId: "org_1",
      stripeCustomerId: "cus_123",
      organization: { id: "org_1", name: "terrace", displayName: "Terrace Org" },
      billing: {
        status: "ACTIVE",
        interval: "ANNUAL",
        setupPath: "SELF_SERVE",
        stripeSubscriptionId: "sub_123",
        licensedDepartmentCount: 1,
        updatedAt,
        entitlements: [{ departmentKey: "DIETARY", status: "ACTIVE" }],
      },
      users: [
        {
          id: "user_ada",
          displayName: "Ada Admin",
          email: "ada@example.com",
          passwordHash: "hash",
          role: { key: "FACILITY_ADMINISTRATOR" },
        },
      ],
    }) as never,
    "fac_1",
  );

  assert.ok(detail);
  assert.equal(detail.displayName, "Terrace View Long Term Care");
  assert.equal(detail.organizationId, "org_1");
  assert.equal(detail.setupAcknowledged, true);
  assert.equal(detail.billingStatus, "Active");
  assert.equal(detail.billingSource, "Stripe-managed");
  assert.equal(detail.stripeCustomerId, "cus_123");
  assert.equal(detail.stripeSubscriptionId, "sub_123");
  assert.equal(detail.billingUpdatedAt?.toISOString(), updatedAt.toISOString());
  assert.equal(detail.primaryAdmin?.email, "ada@example.com");

  const food = detail.licensing.find((row) => row.productKey === "HEALTHCARE_FOOD_NUTRITION");
  const plant = detail.licensing.find((row) => row.productKey === "PLANT");
  const evs = detail.licensing.find((row) => row.productKey === "EVS");
  assert.equal(food?.licensed, true);
  assert.equal(food?.name, "Food and Nutrition");
  assert.equal(plant?.licensed, false);
  assert.equal(evs?.licensed, false);
});

test("unknown facility fails safely", async () => {
  const detail = await loadHarborFacility(mockClient(null) as never, "missing");
  assert.equal(detail, null);
});

test("missing billing record is presented neutrally", async () => {
  const detail = await loadHarborFacility(
    mockClient({
      id: "fac_2",
      displayName: "New Site",
      billingEmail: null,
      onboardingCurrentStep: null,
      onboardingCompletedAt: null,
      organizationId: "org_2",
      stripeCustomerId: null,
      organization: { id: "org_2", name: "new", displayName: null },
      billing: null,
      users: [],
    }) as never,
    "fac_2",
  );
  assert.ok(detail);
  assert.equal(detail.hasBillingRecord, false);
  assert.equal(detail.billingStatus, "No billing record");
  assert.equal(detail.billingSource, "No billing record");
  assert.equal(detail.stripeCustomerId, null);
  assert.equal(detail.stripeSubscriptionId, null);
  assert.equal(detail.setupAcknowledged, false);
});

test("existing-user FA grant appears even when home Facility is elsewhere", async () => {
  const detail = await loadHarborFacility(
    mockClient(
      {
        id: "fac_x",
        displayName: "Facility X",
        billingEmail: "billing@ecmc.example",
        onboardingCurrentStep: "facility",
        onboardingCompletedAt: null,
        organizationId: "org_ecmc",
        stripeCustomerId: null,
        organization: { id: "org_ecmc", name: "ECMC", displayName: "ECMC" },
        billing: null,
        users: [],
      },
      [
        {
          user: {
            id: "user_sarah",
            displayName: "Sarah",
            email: "sarah@example.com",
            isActive: true,
            passwordHash: "existing",
          },
          rolePeriods: [
            { roleKey: "FACILITY_ADMINISTRATOR", startsAt: new Date("2020-01-01"), endsAt: null },
          ],
        },
      ],
    ) as never,
    "fac_x",
  );
  assert.equal(detail?.primaryAdmin?.email, "sarah@example.com");
  assert.equal(detail?.primaryAdmin?.invitePending, false);
  assert.equal(detail?.onboarding, "Setup: facility");
});
