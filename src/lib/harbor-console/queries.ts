import { organizationDisplayLabel } from "@/lib/organization-membership/types";
import { isBillingEntitlementsEnabled } from "@/lib/feature-flags";
import { deriveFacilityDepartmentCatalog } from "@/lib/department-products/facility-catalog";
import type { Prisma, PrismaClient } from "@prisma/client";
import { authorizeImplementationStaff, type Actor } from "@/lib/implementation/authority";
import { implementationWorkWhere, type ImplementationWorkFilter } from "@/lib/implementation/work-queue";
import { HARBOR_CUSTOMER_PAGE_SIZE, harborCustomerPageWindow } from "@/lib/harbor-console/pagination";

import {
  billingStatusLabel,
  isPaymentProblem,
  onboardingLabel,
  setupPathLabel,
  type HarborSetupFilter,
} from "@/lib/harbor-console/presentation";
import {
  listDepartmentProducts,
  matchDepartmentRecordForProduct,
  type DepartmentProduct,
} from "@/lib/department-products";

type Db = PrismaClient | Prisma.TransactionClient;

const facilitySelect = {
  id: true,
  displayName: true,
  billingEmail: true,
  onboardingCurrentStep: true,
  onboardingCompletedAt: true,
  organizationId: true,
  stripeCustomerId: true,
  organization: { select: { id: true, name: true, displayName: true } },
  departments: { select: { id: true, key: true, isActive: true } },
  billing: {
    select: {
      status: true,
      interval: true,
      setupPath: true,
      stripeSubscriptionId: true,
      licensedDepartmentCount: true,
      updatedAt: true,
      entitlements: {
        select: { departmentKey: true, status: true },
        orderBy: { departmentKey: "asc" as const },
      },
    },
  },
} satisfies Prisma.FacilitySelect;

export type HarborFacilityRow = {
  id: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  billingEmail: string | null;
  onboarding: string;
  billingStatus: string;
  billingStatusRaw: string | null;
  setupPath: string;
  licensedDepartments: string[];
  paymentProblem: boolean;
};

export type HarborLicensingRow = {
  productKey: string;
  name: string;
  installationKey: string;
  licensed: boolean;
  installed: boolean;
  enabled: boolean;
  customerAccess: boolean;
};

export type HarborFacilityDetail = HarborFacilityRow & {
  setupAcknowledged: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingInterval: string | null;
  billingUpdatedAt: Date | null;
  billingSource: string;
  hasBillingRecord: boolean;
  licensing: HarborLicensingRow[];
  primaryAdmin: { id: string; name: string; email: string; role: string; invitePending: boolean } | null;
  users: Array<{ id: string; name: string; email: string; role: string; invitePending: boolean }>;
};

function toRow(
  facility: Prisma.FacilityGetPayload<{ select: typeof facilitySelect }>,
): HarborFacilityRow {
  const licensedDepartments = licensingRows(listDepartmentProducts(), facility)
    .filter((row) => row.licensed).map((row) => row.name);
  return {
    id: facility.id,
    displayName: facility.displayName,
    organizationId: facility.organizationId,
    organizationName: organizationDisplayLabel(facility.organization),
    billingEmail: facility.billingEmail,
    onboarding: onboardingLabel({
      onboardingCompletedAt: facility.onboardingCompletedAt,
      onboardingCurrentStep: facility.onboardingCurrentStep,
    }),
    billingStatus: billingStatusLabel(facility.billing?.status ?? null),
    billingStatusRaw: facility.billing?.status ?? null,
    setupPath: setupPathLabel(facility.billing?.setupPath),
    licensedDepartments,
    paymentProblem: isPaymentProblem(facility.billing?.status ?? null),
  };
}

function licensingRows(
  products: readonly DepartmentProduct[],
  facility: Prisma.FacilityGetPayload<{ select: typeof facilitySelect }>,
): HarborLicensingRow[] {
  const catalog = deriveFacilityDepartmentCatalog({
    products, departments: facility.departments ?? [],
    entitlements: facility.billing?.entitlements ?? [],
    billingStatus: facility.billing?.status ?? null, entitlementsEnforced: isBillingEntitlementsEnabled(),
  });
  return products.map((product) => {
    const item = catalog.find((row) => row.productKey === product.productKey);
    const installed = matchDepartmentRecordForProduct(facility.departments ?? [], product);
    return {
      productKey: product.productKey, name: product.name, installationKey: product.installationKey,
      licensed: item?.licensed ?? false, installed: Boolean(installed),
      enabled: installed?.isActive ?? false, customerAccess: item?.operable ?? false,
    };
  });
}

function billingSourceLabel(input: {
  hasBillingRecord: boolean;
  status: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}): string {
  if (!input.hasBillingRecord) {
    return input.stripeCustomerId ? "Stripe customer only" : "No billing record";
  }
  if (input.status === "UNMANAGED") {
    return "Unmanaged (grandfathered / not sold)";
  }
  if (input.stripeSubscriptionId || input.stripeCustomerId) {
    return "Stripe-managed";
  }
  return "Local mirror only";
}

type ImplementationFilter = { filter: ImplementationWorkFilter; actor: Actor };

function setupFilterWhere(setup?: HarborSetupFilter): Prisma.FacilityWhereInput {
  if (setup === "awaiting") return { onboardingCompletedAt: null };
  if (setup === "acknowledged") return { onboardingCompletedAt: { not: null } };
  return {};
}

async function harborFacilityWhere(
  client: Db,
  query?: string,
  implementation?: ImplementationFilter,
  setup?: HarborSetupFilter,
): Promise<Prisma.FacilityWhereInput> {
  if (implementation) await authorizeImplementationStaff(client, implementation.actor);
  const trimmed = query?.trim() ?? "";
  const where = setupFilterWhere(setup);
  if (trimmed) {
    where.OR = [
      { displayName: { contains: trimmed, mode: "insensitive" } },
      { billingEmail: { contains: trimmed, mode: "insensitive" } },
      { organization: { name: { contains: trimmed, mode: "insensitive" } } },
      { organization: { displayName: { contains: trimmed, mode: "insensitive" } } },
    ];
  }
  if (implementation) {
    where.implementationEngagements = { some: implementationWorkWhere(implementation.filter) };
  }
  return where;
}

export async function listHarborFacilities(
  client: Db,
  query?: string,
  implementation?: ImplementationFilter,
): Promise<HarborFacilityRow[]> {
  const rows = await client.facility.findMany({
    where: await harborFacilityWhere(client, query, implementation),
    select: facilitySelect,
    orderBy: { displayName: "asc" },
    take: 200,
  });
  return rows.map(toRow);
}

export async function loadHarborCustomerDirectoryPage(
  client: PrismaClient,
  input: { query?: string; implementation?: ImplementationFilter; setup?: HarborSetupFilter; page?: string | string[] },
) {
  return client.$transaction(async (tx) => {
    const where = await harborFacilityWhere(tx, input.query, input.implementation, input.setup);
    const total = await tx.facility.count({ where });
    const { page, pageCount, offset } = harborCustomerPageWindow(total, input.page);
    const rows = total ? await tx.facility.findMany({
      where,
      select: facilitySelect,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      skip: offset,
      take: HARBOR_CUSTOMER_PAGE_SIZE,
    }) : [];

    return { rows: rows.map(toRow), total, page, pageCount, offset };
  }, { isolationLevel: "RepeatableRead" });
}

export async function loadHarborToday(client: PrismaClient) {
  const [billingRows, setupFollowUp] = await Promise.all([
    listHarborFacilities(client),
    client.$transaction(async (tx) => {
      const where = setupFilterWhere("awaiting");
      const total = await tx.facility.count({ where });
      const rows = total ? await tx.facility.findMany({
        where,
        select: {
          id: true, displayName: true, onboardingCompletedAt: true, onboardingCurrentStep: true,
          organization: { select: { name: true, displayName: true } },
        },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        take: 5,
      }) : [];
      return {
        total,
        rows: rows.map((row) => ({
          id: row.id, displayName: row.displayName,
          organizationName: organizationDisplayLabel(row.organization), onboarding: onboardingLabel(row),
        })),
      };
    }, { isolationLevel: "RepeatableRead" }),
  ]);
  return { setupFollowUp, paymentProblems: billingRows.filter((row) => row.paymentProblem) };
}

export async function loadHarborOrganizationProfile(client: Db, organizationId: string) {
  return client.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      displayName: true,
      isActive: true,
      facilities: {
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        select: { id: true, displayName: true },
      },
    },
  });
}

export async function loadHarborFacility(
  client: Db,
  facilityId: string,
): Promise<HarborFacilityDetail | null> {
  const facility = await client.facility.findUnique({
    where: { id: facilityId },
    select: {
      ...facilitySelect,
      users: {
        where: { isActive: true },
        select: {
          id: true,
          displayName: true,
          email: true,
          passwordHash: true,
          role: { select: { key: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 12,
      },
    },
  });
  if (!facility) {
    return null;
  }

  const now = new Date();
  const accesses = await client.userFacilityAccess.findMany({
    where: { facilityId: facility.id, isActive: true, revokedAt: null },
    select: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          isActive: true,
          passwordHash: true,
        },
      },
      rolePeriods: {
        select: { roleKey: true, startsAt: true, endsAt: true },
      },
    },
    take: 24,
  });

  const usersByEmail = new Map<
    string,
    { id: string; name: string; email: string; role: string; invitePending: boolean }
  >();
  for (const user of facility.users) {
    if (!user.role?.key) continue;
    usersByEmail.set(user.email, {
      id: user.id,
      name: user.displayName,
      email: user.email,
      role: user.role.key,
      invitePending: user.passwordHash == null,
    });
  }
  for (const access of accesses) {
    if (!access.user?.isActive) continue;
    const current = access.rolePeriods.find(
      (period) => period.startsAt <= now && (period.endsAt == null || period.endsAt > now),
    );
    if (!current) continue;
    usersByEmail.set(access.user.email, {
      id: access.user.id,
      name: access.user.displayName,
      email: access.user.email,
      role: current.roleKey,
      invitePending: access.user.passwordHash == null,
    });
  }
  const users = [...usersByEmail.values()];
  const primaryAdmin =
    users.find((user) => user.role === "FACILITY_ADMINISTRATOR") ?? users[0] ?? null;

  const hasBillingRecord = Boolean(facility.billing);

  return {
    ...toRow(facility),
    setupAcknowledged: facility.onboardingCompletedAt != null,
    stripeCustomerId: facility.stripeCustomerId,
    stripeSubscriptionId: facility.billing?.stripeSubscriptionId ?? null,
    billingInterval: facility.billing?.interval ?? null,
    billingUpdatedAt: facility.billing?.updatedAt ?? null,
    billingSource: billingSourceLabel({
      hasBillingRecord,
      status: facility.billing?.status ?? null,
      stripeCustomerId: facility.stripeCustomerId,
      stripeSubscriptionId: facility.billing?.stripeSubscriptionId ?? null,
    }),
    hasBillingRecord,
    licensing: licensingRows(listDepartmentProducts(), facility),
    primaryAdmin,
    users,
  };
}

export async function listHarborOrganizations(client: Db) {
  return client.organization.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      legalName: true,
      displayName: true,
      organizationType: true,
      _count: { select: { facilities: true } },
    },
    orderBy: { name: "asc" },
  });
}
