import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { bootstrapFacilityCustomer } from "./bootstrap";
import { previewHarborAdministrator, provisionFacilityForHarbor } from "./harbor";
import { FacilityProvisioningError } from "./errors";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

type Period = {
  id: string;
  userFacilityAccessId: string;
  roleKey: string;
  startsAt: Date;
  endsAt: Date | null;
};

function buildDb(seed?: {
  organizations?: Array<{
    id: string;
    name: string;
    displayName?: string | null;
    isActive?: boolean;
  }>;
  users?: Array<{
    id: string;
    email: string;
    displayName: string;
    isActive?: boolean;
    roleId?: string;
    facilityId?: string | null;
  }>;
  facilities?: Array<{
    id: string;
    organizationId: string;
    displayName: string;
    onboardingCompletedAt?: Date | null;
  }>;
  accesses?: Array<{ id: string; userId: string; facilityId: string }>;
  periods?: Period[];
  memberships?: Array<{ userId: string; organizationId: string }>;
}) {
  let seq = 1;
  const id = (prefix: string) => `${prefix}_${seq++}`;
  const roles = [{ id: "role_fa", key: "FACILITY_ADMINISTRATOR", isActive: true }];
  const organizations = [...(seed?.organizations ?? [])].map((row) => ({
    isActive: true,
    displayName: row.displayName ?? row.name,
    ...row,
  }));
  const facilities: Array<Record<string, unknown>> = [...(seed?.facilities ?? [])];
  const users = [...(seed?.users ?? [])].map((user) => ({
    isActive: true,
    roleId: "role_fa",
    facilityId: null as string | null,
    passwordHash: "existing",
    ...user,
  }));
  const employees: Array<Record<string, unknown>> = [];
  const accesses = [...(seed?.accesses ?? [])].map((row) => ({
    isActive: true,
    revokedAt: null as Date | null,
    ...row,
  }));
  const periods = [...(seed?.periods ?? [])];
  const memberships = [...(seed?.memberships ?? [])];
  const departments: Array<Record<string, unknown>> = [];
  const billings: Array<Record<string, unknown>> = [];

  const db = {
    role: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        roles.find((role) => role.key === where.key) ?? null,
      findFirst: async ({ where }: { where: { key: string; isActive?: boolean } }) =>
        roles.find((role) => role.key === where.key && (where.isActive == null || role.isActive === where.isActive)) ??
        null,
      findMany: async ({ where }: { where: { key?: { in: string[] }; isActive?: boolean } }) =>
        roles.filter(
          (role) =>
            (!where.key?.in || where.key.in.includes(role.key)) &&
            (where.isActive == null || role.isActive === where.isActive),
        ),
    },
    organization: {
      create: async ({ data }: { data: { name: string; displayName: string; organizationType?: string } }) => {
        const row = { id: id("org"), name: data.name, displayName: data.displayName, isActive: true };
        organizations.push(row);
        return { id: row.id, name: row.name };
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        organizations.find((row) => row.id === where.id) ?? null,
    },
    facility: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("fac"), stripeCustomerId: null, onboardingCompletedAt: null, ...data };
        facilities.push(row);
        return { id: row.id, displayName: row.displayName };
      },
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; displayName: string; onboardingCompletedAt?: null };
      }) =>
        facilities
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (row.displayName !== where.displayName) return false;
            if (where.onboardingCompletedAt === null && row.onboardingCompletedAt) return false;
            return true;
          })
          .map((row) => ({
            id: row.id,
            displayName: row.displayName,
            userFacilityAccesses: accesses
              .filter((access) => access.facilityId === row.id && access.isActive && !access.revokedAt)
              .map((access) => ({
                rolePeriods: periods.filter((period) => period.userFacilityAccessId === access.id),
              })),
          })),
    },
    user: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("user"), isActive: true, ...data };
        users.push(row as (typeof users)[number]);
        return { id: row.id, email: row.email, displayName: row.displayName };
      },
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const user = users.find((row) => row.id === where.id || row.email === where.email);
        if (!user) return null;
        const role = roles.find((item) => item.id === user.roleId);
        return {
          ...user,
          role: role ? { key: role.key, isActive: role.isActive } : null,
        };
      },
    },
    employee: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("emp"), ...data };
        employees.push(row);
        return row;
      },
    },
    userFacilityAccess: {
      findUnique: async ({ where }: { where: { userId_facilityId: { userId: string; facilityId: string } } }) =>
        accesses.find(
          (row) =>
            row.userId === where.userId_facilityId.userId && row.facilityId === where.userId_facilityId.facilityId,
        ) ?? null,
      findFirst: async ({ where }: { where: { userId: string; facilityId: string; isActive?: boolean } }) => {
        const access = accesses.find(
          (row) =>
            row.userId === where.userId &&
            row.facilityId === where.facilityId &&
            (where.isActive == null || row.isActive === where.isActive) &&
            !row.revokedAt,
        );
        if (!access) return null;
        return {
          ...access,
          rolePeriods: periods.filter((period) => period.userFacilityAccessId === access.id),
        };
      },
      create: async ({ data }: { data: { userId: string; facilityId: string } }) => {
        const row = { id: id("access"), isActive: true, revokedAt: null, ...data };
        accesses.push(row);
        return { id: row.id };
      },
    },
    userFacilityRolePeriod: {
      create: async ({ data }: { data: Omit<Period, "id"> }) => {
        const row = { id: id("period"), ...data };
        periods.push(row);
        return row;
      },
      findFirst: async ({
        where,
      }: {
        where: { roleKey: string; endsAt: null; userFacilityAccess: { facilityId: string; userId?: { not: string } } };
      }) => {
        for (const period of periods) {
          const access = accesses.find((row) => row.id === period.userFacilityAccessId);
          if (
            access &&
            period.roleKey === where.roleKey &&
            period.endsAt === null &&
            access.facilityId === where.userFacilityAccess.facilityId &&
            access.userId !== where.userFacilityAccess.userId?.not
          ) {
            return { id: period.id, userFacilityAccess: { userId: access.userId } };
          }
        }
        return null;
      },
    },
    userOrganizationMembership: {
      findMany: async () => memberships,
    },
    department: {
      findMany: async () => departments,
    },
    facilityBilling: {
      findMany: async () => billings,
    },
    $queryRaw: async () => [],
    $transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => {
      const snapshot = {
        organizations: organizations.map((row) => ({ ...row })),
        facilities: facilities.map((row) => ({ ...row })),
        users: users.map((row) => ({ ...row })),
        employees: employees.map((row) => ({ ...row })),
        accesses: accesses.map((row) => ({ ...row })),
        periods: periods.map((row) => ({ ...row })),
        memberships: memberships.map((row) => ({ ...row })),
      };
      try {
        return await fn(db);
      } catch (error) {
        organizations.splice(0, organizations.length, ...snapshot.organizations);
        facilities.splice(0, facilities.length, ...snapshot.facilities);
        users.splice(0, users.length, ...snapshot.users);
        employees.splice(0, employees.length, ...snapshot.employees);
        accesses.splice(0, accesses.length, ...snapshot.accesses);
        periods.splice(0, periods.length, ...snapshot.periods);
        memberships.splice(0, memberships.length, ...snapshot.memberships);
        throw error;
      }
    },
  };

  return {
    db: db as never,
    organizations,
    facilities,
    users,
    employees,
    accesses,
    periods,
    memberships,
    departments,
    billings,
  };
}

test("new Organization and new User create FA shell without billing or Departments", async () => {
  const world = buildDb();
  const result = await bootstrapFacilityCustomer(world.db, {
    organization: { mode: "create", facilityName: "Facility A", organizationName: "ABC Senior Living" },
    facility: {
      displayName: "Facility A",
      billingEmail: "billing@abc.example",
      timezone: "America/Chicago",
    },
    administrator: {
      mode: "create",
      email: "sarah@abc.example",
      displayName: "Sarah Admin",
      passwordHash: null,
      emailVerifiedAt: null,
    },
  });

  assert.equal(result.organization.created, true);
  assert.equal(result.organization.name, "ABC Senior Living");
  assert.equal(result.facility.created, true);
  assert.equal(result.user.created, true);
  assert.equal(result.replayed, false);
  assert.equal(world.facilities[0]?.timezone, "America/Chicago");
  assert.equal(world.facilities[0]?.onboardingCurrentStep, "facility");
  assert.equal(world.facilities[0]?.onboardingCompletedAt, null);
  assert.equal(world.facilities[0]?.stripeCustomerId, null);
  assert.equal(world.employees.length, 1);
  assert.equal(world.employees[0]?.roleType, "FACILITY_ADMINISTRATOR");
  assert.equal(world.accesses.length, 1);
  assert.equal(world.periods[0]?.roleKey, "FACILITY_ADMINISTRATOR");
  assert.equal(world.departments.length, 0);
  assert.equal(world.billings.length, 0);
  assert.equal(world.memberships.length, 0);
});

test("existing Organization and new User attach Facility without membership", async () => {
  const world = buildDb({
    organizations: [{ id: "org_ecmc", name: "ECMC", displayName: "ECMC" }],
    memberships: [{ userId: "user_orgadmin", organizationId: "org_ecmc" }],
  });
  const result = await bootstrapFacilityCustomer(world.db, {
    organization: { mode: "existing", organizationId: "org_ecmc" },
    facility: {
      displayName: "Facility X",
      billingEmail: "billing@ecmc.example",
      timezone: "America/New_York",
    },
    administrator: {
      mode: "create",
      email: "newfa@ecmc.example",
      displayName: "New FA",
      passwordHash: null,
      emailVerifiedAt: null,
    },
  });
  assert.equal(result.organization.id, "org_ecmc");
  assert.equal(result.organization.created, false);
  assert.equal(result.user.created, true);
  assert.equal(world.organizations.length, 1);
  assert.equal(world.memberships.length, 1);
  assert.equal(world.accesses.length, 1);
});

test("new Organization and existing User reuse the global User and skip invite path", async () => {
  const world = buildDb({
    users: [{ id: "user_sarah", email: "sarah@example.com", displayName: "Sarah", facilityId: "fac_old" }],
  });
  const result = await provisionFacilityForHarbor(world.db, {
    organizationMode: "create",
    organizationName: "ABC Senior Living",
    organizationType: "MANAGEMENT_COMPANY",
    facilityDisplayName: "Facility A",
    timezone: "America/Chicago",
    billingEmail: "billing@abc.example",
    administratorName: "Sarah",
    administratorEmail: "sarah@example.com",
  });
  assert.equal(result.organization.created, true);
  assert.equal(result.user.created, false);
  assert.equal(result.user.id, "user_sarah");
  assert.equal(world.users.length, 1);
  assert.equal(world.users[0]?.facilityId, "fac_old");
  assert.equal(world.employees.length, 1);
  assert.equal(world.employees[0]?.userId, "user_sarah");
  assert.equal(world.memberships.length, 0);
});

test("existing Organization and existing User reuse identity and grant only Sarah", async () => {
  const world = buildDb({
    organizations: [{ id: "org_ecmc", name: "ECMC", displayName: "ECMC" }],
    users: [
      { id: "user_sarah", email: "sarah@example.com", displayName: "Sarah" },
      { id: "user_other", email: "orgadmin@example.com", displayName: "Other Org Admin" },
    ],
    memberships: [{ userId: "user_other", organizationId: "org_ecmc" }],
  });

  const result = await bootstrapFacilityCustomer(world.db, {
    organization: { mode: "existing", organizationId: "org_ecmc" },
    facility: { displayName: "Facility X", billingEmail: "billing@ecmc.example" },
    administrator: { mode: "reuse", userId: "user_sarah" },
  });

  assert.equal(result.organization.created, false);
  assert.equal(result.user.created, false);
  assert.equal(result.user.id, "user_sarah");
  assert.equal(world.users.length, 2);
  assert.equal(world.accesses.filter((row) => row.userId === "user_sarah").length, 1);
  assert.equal(world.accesses.filter((row) => row.userId === "user_other").length, 0);
  assert.equal(world.memberships.length, 1);
});

test("exact replay reuses the incomplete Facility", async () => {
  const world = buildDb();
  const first = await provisionFacilityForHarbor(world.db, {
    organizationMode: "create",
    organizationName: "NewCo",
    organizationType: "OTHER",
    facilityDisplayName: "Facility X",
    timezone: "America/New_York",
    billingEmail: "billing@newco.example",
    administratorName: "Sarah Admin",
    administratorEmail: "sarah@newco.example",
  });
  const second = await provisionFacilityForHarbor(world.db, {
    organizationMode: "existing",
    organizationId: first.organization.id,
    facilityDisplayName: "Facility X",
    timezone: "America/New_York",
    billingEmail: "billing@newco.example",
    administratorName: "Sarah Admin",
    administratorEmail: "sarah@newco.example",
  });
  assert.equal(second.replayed, true);
  assert.equal(second.facility.id, first.facility.id);
  assert.equal(world.facilities.length, 1);
});

test("same Organization name with a different FA requires explicit duplicate confirmation", async () => {
  const world = buildDb({
    organizations: [{ id: "org_1", name: "ECMC" }],
    facilities: [{ id: "fac_old", organizationId: "org_1", displayName: "Terrace View" }],
    users: [{ id: "user_sarah", email: "sarah@example.com", displayName: "Sarah" }],
  });
  await assert.rejects(
    () =>
      provisionFacilityForHarbor(world.db, {
        organizationMode: "existing",
        organizationId: "org_1",
        facilityDisplayName: "Terrace View",
        timezone: "America/New_York",
        billingEmail: "billing@ecmc.example",
        administratorName: "Sarah",
        administratorEmail: "sarah@example.com",
      }),
    (error: unknown) => error instanceof FacilityProvisioningError && error.code === "DUPLICATE_NAME",
  );
  const created = await provisionFacilityForHarbor(world.db, {
    organizationMode: "existing",
    organizationId: "org_1",
    facilityDisplayName: "Terrace View",
    timezone: "America/New_York",
    billingEmail: "billing@ecmc.example",
    administratorName: "Sarah",
    administratorEmail: "sarah@example.com",
    confirmDuplicateName: true,
  });
  assert.equal(created.facility.created, true);
  assert.equal(world.facilities.length, 2);
});

test("preview distinguishes existing and new administrators", async () => {
  const world = buildDb({
    users: [{ id: "user_sarah", email: "sarah@example.com", displayName: "Sarah Admin" }],
  });
  const existing = await previewHarborAdministrator(world.db, "Sarah@example.com");
  assert.equal(existing.exists, true);
  assert.equal(existing.displayName, "Sarah Admin");
  const created = await previewHarborAdministrator(world.db, "new@example.com");
  assert.equal(created.exists, false);
});

test("transaction rollback leaves no partial tenant", async () => {
  const world = buildDb();
  const originalCreate = world.db.employee.create;
  world.db.employee.create = async () => {
    throw new Error("employee write failed");
  };
  await assert.rejects(() =>
    world.db.$transaction((tx) =>
      bootstrapFacilityCustomer(tx, {
        organization: { mode: "create", facilityName: "Facility A", organizationName: "NewCo" },
        facility: { displayName: "Facility A", billingEmail: "billing@newco.example" },
        administrator: {
          mode: "create",
          email: "sarah@newco.example",
          displayName: "Sarah",
          passwordHash: null,
          emailVerifiedAt: null,
        },
      }),
    ),
  );
  world.db.employee.create = originalCreate;
  assert.equal(world.organizations.length, 0);
  assert.equal(world.facilities.length, 0);
  assert.equal(world.users.length, 0);
  assert.equal(world.accesses.length, 0);
  assert.equal(world.employees.length, 0);
});

test("signup and Harbor share bootstrap and do not install products or claims", () => {
  const signup = source("src/app/api/auth/signup/route.ts");
  const bootstrap = source("src/lib/facility-provisioning/bootstrap.ts");
  const harbor = source("src/lib/facility-provisioning/harbor.ts");
  const actions = source("src/app/console/(staff)/customers/provision-actions.ts");
  const form = source("src/components/harbor-console/provision-facility-form.tsx");
  const detail = source("src/app/console/(staff)/customers/[facilityId]/page.tsx");
  const proxy = source("src/proxy.ts");
  assert.match(signup, /bootstrapFacilityCustomer/);
  assert.match(signup, /isPublicSignupEnabled/);
  assert.match(signup, /passwordHash/);
  assert.doesNotMatch(signup, /mode: \"reuse\"/);
  assert.doesNotMatch(bootstrap, /installDepartmentProduct|installDepartmentsForActiveEntitlements/);
  assert.doesNotMatch(bootstrap, /PUBLIC_SIGNUP_ENABLED|BILLING_ENTITLEMENTS_ENABLED/);
  assert.doesNotMatch(harbor, /OrganizationClaimInvitation|claimOrganization|createOrganizationMembership/);
  assert.doesNotMatch(harbor, /PUBLIC_SIGNUP_ENABLED|BILLING_ENTITLEMENTS_ENABLED/);
  assert.doesNotMatch(actions, /stripe\.customers|subscriptions\.create|checkout\.sessions/);
  assert.doesNotMatch(actions, /PUBLIC_SIGNUP_ENABLED|BILLING_ENTITLEMENTS_ENABLED/);
  assert.match(actions, /issueAndSendAccountInvite/);
  assert.match(actions, /PROVISION_FACILITY/);
  assert.ok(actions.indexOf("prisma.$transaction") < actions.indexOf("issueAndSendAccountInvite({"));
  assert.match(detail, /Facility created\. Administrator invite could not be delivered/);
  assert.match(detail, /resendHarborProvisionInviteAction/);
  assert.doesNotMatch(actions, /createHarborWorkToken|WORK_SESSION_START/);
  assert.match(form, /from \"@\/lib\/facility-provisioning\/timezones\"/);
  assert.doesNotMatch(form, /from \"@\/lib\/facility-provisioning\"/);
  assert.doesNotMatch(form, /from \"@\/lib\/organization\"/);
  assert.match(form, /from \"@\/lib\/organization\/types\"/);
  const partnerPanel = source("src/components/facility-partners/partner-user-access-panel.tsx");
  assert.match(partnerPanel, /from \"@\/lib\/organization-membership\/types\"/);
  assert.doesNotMatch(partnerPanel, /from \"@\/lib\/organization-membership\"/);
  assert.doesNotMatch(partnerPanel, /from \"@\/lib\/partner-user-access\"/);
  // Setup is explicit authorized navigation, not a blanket journey redirect.
  assert.doesNotMatch(proxy, /onboardingCompletedAt|ONBOARDING_ENTRY_PATH/);
  assert.match(proxy, /authorizeRoute/);
  assert.match(proxy, /validateSessionAuthority/);
});
