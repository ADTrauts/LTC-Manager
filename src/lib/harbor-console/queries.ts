import type { Prisma, PrismaClient } from "@prisma/client";

import {
  billingStatusLabel,
  departmentKeyLabel,
  isPaymentProblem,
  isStuckSetup,
  onboardingLabel,
  setupPathLabel,
} from "@/lib/harbor-console/presentation";

type Db = PrismaClient | Prisma.TransactionClient;

const facilitySelect = {
  id: true,
  displayName: true,
  billingEmail: true,
  onboardingCurrentStep: true,
  onboardingCompletedAt: true,
  organization: { select: { name: true, displayName: true } },
  billing: {
    select: {
      status: true,
      interval: true,
      setupPath: true,
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

export async function loadHarborFacility(client: Db, facilityId: string) {
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
  return {
    ...toRow(facility),
    users: facility.users.map((user) => ({
      name: user.displayName,
      email: user.email,
      role: user.role.key,
    })),
  };
}
