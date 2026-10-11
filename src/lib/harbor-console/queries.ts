import type { Prisma, PrismaClient } from "@prisma/client";

import {
  billingStatusLabel,
  departmentKeyLabel,
  isPaymentProblem,
  isStuckSetup,
  onboardingLabel,
  setupPathLabel,
} from "@/lib/harbor-console/presentation";
import {
  listDepartmentProducts,
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
  billing: {
    select: {
      status: true,
      interval: true,
      setupPath: true,
      stripeSubscriptionId: true,
      licensedDepartmentCount: true,
      updatedAt: true,
      entitlements: {
        where: { status: "ACTIVE" },
        select: { departmentKey: true },
        orderBy: { departmentKey: "asc" as const },
      },
    },
  },
} satisfies Prisma.FacilitySelect;

export type HarborFacilityRow = {
  id: string;
  displayName: string;
  organizationName: string;
  billingEmail: string | null;
  onboarding: string;
  billingStatus: string;
  billingStatusRaw: string | null;
  setupPath: string;
  licensedDepartments: string[];
  stuckSetup: boolean;
  paymentProblem: boolean;
};

export type HarborLicensingRow = {
  productKey: string;
  name: string;
  installationKey: string;
  licensed: boolean;
};

export type HarborFacilityDetail = HarborFacilityRow & {
  organizationId: string;
  isLive: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingInterval: string | null;
  billingUpdatedAt: Date | null;
  billingSource: string;
  hasBillingRecord: boolean;
  licensing: HarborLicensingRow[];
  primaryAdmin: { name: string; email: string; role: string } | null;
  users: Array<{ name: string; email: string; role: string }>;
};

function toRow(
  facility: Prisma.FacilityGetPayload<{ select: typeof facilitySelect }>,
): HarborFacilityRow {
  const licensedDepartments = (facility.billing?.entitlements ?? []).map((row) =>
    departmentKeyLabel(row.departmentKey),
  );
  return {
    id: facility.id,
    displayName: facility.displayName,
    organizationName: facility.organization.displayName?.trim() || facility.organization.name,
    billingEmail: facility.billingEmail,
    onboarding: onboardingLabel({
      onboardingCompletedAt: facility.onboardingCompletedAt,
      onboardingCurrentStep: facility.onboardingCurrentStep,
    }),
    billingStatus: billingStatusLabel(facility.billing?.status ?? null),
    billingStatusRaw: facility.billing?.status ?? null,
    setupPath: setupPathLabel(facility.billing?.setupPath),
    licensedDepartments,
    stuckSetup: isStuckSetup(facility.onboardingCompletedAt),
    paymentProblem: isPaymentProblem(facility.billing?.status ?? null),
  };
}

function licensingRows(
  products: readonly DepartmentProduct[],
  activeKeys: readonly string[],
): HarborLicensingRow[] {
  const licensed = new Set(activeKeys);
  return products.map((product) => ({
    productKey: product.productKey,
    name: product.name,
    installationKey: product.installationKey,
    licensed: licensed.has(product.installationKey) || licensed.has(product.productKey),
  }));
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

export async function listHarborFacilities(client: Db, query?: string): Promise<HarborFacilityRow[]> {
  const trimmed = query?.trim() ?? "";
  const rows = await client.facility.findMany({
    where:
      trimmed.length > 0
        ? {
            OR: [
              { displayName: { contains: trimmed, mode: "insensitive" } },
              { billingEmail: { contains: trimmed, mode: "insensitive" } },
              { organization: { name: { contains: trimmed, mode: "insensitive" } } },
              { organization: { displayName: { contains: trimmed, mode: "insensitive" } } },
            ],
          }
        : undefined,
    select: facilitySelect,
    orderBy: { displayName: "asc" },
    take: 200,
  });
  return rows.map(toRow);
}

export async function loadHarborToday(client: Db) {
  const rows = await listHarborFacilities(client);
  return {
    stuckSetups: rows.filter((row) => row.stuckSetup),
    paymentProblems: rows.filter((row) => row.paymentProblem),
  };
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
          displayName: true,
          email: true,
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

  const users = facility.users.flatMap((user) => {
    if (!user.role?.key) return [];
    return [
      {
        name: user.displayName,
        email: user.email,
        role: user.role.key,
      },
    ];
  });
  const primaryAdmin =
    users.find((user) => user.role === "FACILITY_ADMINISTRATOR") ?? users[0] ?? null;

  const activeKeys = (facility.billing?.entitlements ?? []).map((row) => row.departmentKey);
  const hasBillingRecord = Boolean(facility.billing);

  return {
    ...toRow(facility),
    organizationId: facility.organizationId,
    isLive: facility.onboardingCompletedAt != null,
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
    licensing: licensingRows(listDepartmentProducts(), activeKeys),
    primaryAdmin,
    users,
  };
}
