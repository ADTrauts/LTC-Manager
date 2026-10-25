import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { cache } from "react";

import type { AuthKind } from "@/lib/auth";
import { isBillingEntitlementsEnabled } from "@/lib/feature-flags";
import { prisma as prismaClient } from "@/lib/prisma";

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
import { getDepartmentProduct, matchEntitlementStatusForProduct } from "./registry";

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

async function queryFacilityDepartmentAccessContext(
  db: CatalogDbClient,
  facilityId: string,
): Promise<{
  departments: FacilityDepartmentAccessRow[];
  entitlements: Array<{ departmentKey: string; status: "ACTIVE" | "REVOKED" }>;
  billingStatus: BillingStatusForEntitlement;
  entitlementsEnforced: boolean;
}> {
  const [departments, entitlements, billing] = await Promise.all([
    db.department.findMany({
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
    db.facilityDepartmentEntitlement.findMany({
      where: { facilityId },
      select: { departmentKey: true, status: true },
    }),
    db.facilityBilling.findUnique({
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

const queryFacilityDepartmentAccessContextForRequest = cache((facilityId: string) =>
  queryFacilityDepartmentAccessContext(prismaClient, facilityId),
);

export async function loadFacilityDepartmentAccessContext(
  db: CatalogDbClient,
  facilityId: string,
): Promise<{
  departments: FacilityDepartmentAccessRow[];
  entitlements: Array<{ departmentKey: string; status: "ACTIVE" | "REVOKED" }>;
  billingStatus: BillingStatusForEntitlement;
  entitlementsEnforced: boolean;
}> {
  if (db === prismaClient) return queryFacilityDepartmentAccessContextForRequest(facilityId);
  return queryFacilityDepartmentAccessContext(db, facilityId);
}

export function isDepartmentRowCustomerOperable(input: {
  key: string;
  isActive: boolean;
  entitlementStatus: "ACTIVE" | "REVOKED" | null;
  billingStatus: BillingStatusForEntitlement;
  entitlementsEnforced: boolean;
}): boolean {
  const product = getDepartmentProduct(input.key);
  const releaseStatus = product?.status ?? departmentProductReleaseStatus(input.key);
  const entitled = resolveCommercialEntitlement({
    releaseStatus,
    entitlementStatus: input.entitlementStatus,
    billingStatus: input.billingStatus,
    entitlementsEnforced: input.entitlementsEnforced,
    installed: true,
  });
  return evaluateCustomerDepartmentOperability({
    productKey: product?.productKey ?? input.key,
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
  return departments.filter((department) => {
    const product = getDepartmentProduct(department.key);
    const entitlementStatus = product
      ? matchEntitlementStatusForProduct(input.entitlements, product)
      : input.entitlements.find((row) => row.departmentKey === department.key)?.status ?? null;
    return isDepartmentRowCustomerOperable({
      key: department.key,
      isActive: department.isActive,
      entitlementStatus,
      billingStatus: input.billingStatus,
      entitlementsEnforced: input.entitlementsEnforced,
    });
  });
}

export async function loadCustomerOperableDepartments(
  prisma: CatalogDbClient,
  facilityId: string,
): Promise<FacilityDepartmentAccessRow[]> {
  const context = await loadFacilityDepartmentAccessContext(prisma, facilityId);
  return selectCustomerOperableDepartments(context.departments, context);
}

/**
 * Current-state customer lists. Harbor work sessions may still see installed
 * DEVELOPMENT rows; ordinary facility users never do.
 */
export async function loadDepartmentsForCurrentSurface(
  prisma: CatalogDbClient,
  facilityId: string,
  session?: { authKind?: AuthKind | null },
): Promise<FacilityDepartmentAccessRow[]> {
  if (session?.authKind === "harbor_staff") {
    const context = await loadFacilityDepartmentAccessContext(prisma, facilityId);
    return context.departments.filter((row) => row.isActive);
  }
  return loadCustomerOperableDepartments(prisma, facilityId);
}

/** Commercial boundary for canonical Product Build/Run owners. Custom shared-engine
 * Departments keep their existing admission contract. Caller still checks role,
 * relationship, feature rollout and the concrete resource's Facility.
 */
export async function isCustomerDepartmentAccessAllowed(
  db: CatalogDbClient,
  session: { facilityId: string; authKind?: string | null },
  departmentId: string,
): Promise<boolean> {
  const context = await loadFacilityDepartmentAccessContext(db, session.facilityId);
  const department = context.departments.find((row) => row.id === departmentId);
  if (!department?.isActive) return false;
  if (session.authKind === "harbor_staff") return true;
  const product = getDepartmentProduct(department.key);
  if (!product) return true;
  return isDepartmentRowCustomerOperable({
    key: department.key, isActive: department.isActive,
    entitlementStatus: matchEntitlementStatusForProduct(context.entitlements, product),
    billingStatus: context.billingStatus, entitlementsEnforced: context.entitlementsEnforced,
  });
}
