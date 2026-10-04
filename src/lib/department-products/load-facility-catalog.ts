import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { isBillingEntitlementsEnabled } from "@/lib/feature-flags";

import {
  departmentProductReleaseStatus,
  evaluateCustomerDepartmentOperability,
  resolveCommercialEntitlement,
  type BillingStatusForEntitlement,
} from "./eligibility";
import {
  deriveFacilityDepartmentCatalog,
  type FacilityDepartmentCatalogItem,
} from "./facility-catalog";

type CatalogDbClient = PrismaClient | Prisma.TransactionClient;

export type FacilityDepartmentAccessRow = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  showInEmployeeApp: boolean;
  sortOrder: number;
};

export async function loadFacilityDepartmentCatalog(
  prisma: CatalogDbClient,
  facilityId: string,
): Promise<FacilityDepartmentCatalogItem[]> {
  const [departments, entitlements, billing] = await Promise.all([
    prisma.department.findMany({
      where: { facilityId },
      select: { id: true, key: true, isActive: true },
    }),
    prisma.facilityDepartmentEntitlement.findMany({
      where: { facilityId },
      select: { departmentKey: true, status: true },
    }),
    prisma.facilityBilling.findUnique({
      where: { facilityId },
      select: { status: true },
    }),
  ]);

  return deriveFacilityDepartmentCatalog({
    departments,
    entitlements,
    billingStatus: (billing?.status ?? null) as BillingStatusForEntitlement,
    entitlementsEnforced: isBillingEntitlementsEnabled(),
  });
}

export async function loadFacilityDepartmentAccessContext(
  prisma: CatalogDbClient,
  facilityId: string,
): Promise<{
  departments: FacilityDepartmentAccessRow[];
  entitlements: Array<{ departmentKey: string; status: "ACTIVE" | "REVOKED" }>;
  billingStatus: BillingStatusForEntitlement;
  entitlementsEnforced: boolean;
}> {
  const [departments, entitlements, billing] = await Promise.all([
    prisma.department.findMany({
      where: { facilityId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        isActive: true,
        showInEmployeeApp: true,
        sortOrder: true,
      },
    }),
    prisma.facilityDepartmentEntitlement.findMany({
      where: { facilityId },
      select: { departmentKey: true, status: true },
    }),
    prisma.facilityBilling.findUnique({
      where: { facilityId },
      select: { status: true },
    }),
  ]);

  return {
    departments,
    entitlements,
    billingStatus: (billing?.status ?? null) as BillingStatusForEntitlement,
    entitlementsEnforced: isBillingEntitlementsEnabled(),
  };
}

export function isDepartmentRowCustomerOperable(input: {
  key: string;
  isActive: boolean;
  entitlementStatus: "ACTIVE" | "REVOKED" | null;
  billingStatus: BillingStatusForEntitlement;
  entitlementsEnforced: boolean;
}): boolean {
  const releaseStatus = departmentProductReleaseStatus(input.key);
  const entitled = resolveCommercialEntitlement({
    releaseStatus,
    entitlementStatus: input.entitlementStatus,
    billingStatus: input.billingStatus,
    entitlementsEnforced: input.entitlementsEnforced,
    installed: true,
  });
  return evaluateCustomerDepartmentOperability({
    productKey: input.key,
    releaseStatus,
    installed: true,
    departmentActive: input.isActive,
    entitled,
  }).operable;
}

export function selectCustomerOperableDepartments<T extends { key: string; isActive: boolean }>(
  departments: readonly T[],
  input: {
    entitlements: readonly { departmentKey: string; status: "ACTIVE" | "REVOKED" }[];
    billingStatus: BillingStatusForEntitlement;
    entitlementsEnforced: boolean;
  },
): T[] {
  const entitlementByKey = new Map(
    input.entitlements.map((row) => [row.departmentKey, row.status]),
  );
  return departments.filter((department) =>
    isDepartmentRowCustomerOperable({
      key: department.key,
      isActive: department.isActive,
      entitlementStatus: entitlementByKey.get(department.key) ?? null,
      billingStatus: input.billingStatus,
      entitlementsEnforced: input.entitlementsEnforced,
    }),
  );
}

export async function loadCustomerOperableDepartments(
  prisma: CatalogDbClient,
  facilityId: string,
): Promise<FacilityDepartmentAccessRow[]> {
  const context = await loadFacilityDepartmentAccessContext(prisma, facilityId);
  return selectCustomerOperableDepartments(context.departments, context);
}
