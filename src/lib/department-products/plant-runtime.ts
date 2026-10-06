/**
 * Facility Plant Operations runtime eligibility.
 *
 * Marketplace / customer install stay DEVELOPMENT-gated elsewhere.
 * Runtime engines may run when:
 *   - internal override PLANT_OPERATIONS_ENABLED is on, or
 *   - Harbor/internal audience has an installed PLANT Department Product, or
 *   - the Facility is customer-operable for Plant (false while DEVELOPMENT;
 *     becomes a registry/entitlement decision when the Product is AVAILABLE).
 *
 * Association is by Product installation key, not a locally renamed Department.
 */

import { isDietaryAssetOperationsEnabled, isPlantOperationsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import { hasInternalDepartmentProductAccess } from "./eligibility";
import {
  isDepartmentRowCustomerOperable,
  loadFacilityDepartmentAccessContext,
} from "./load-facility-catalog";
import {
  getDepartmentProduct,
  matchDepartmentRecordForProduct,
  matchEntitlementStatusForProduct,
} from "./registry";

export type PlantRuntimeSession = {
  authKind?: string | null;
};

export function resolvePlantRuntimeFromFacts(input: {
  developmentOverride: boolean;
  productInstalled: boolean;
  harborAccess: boolean;
  customerOperable: boolean;
}): boolean {
  if (input.developmentOverride) return true;
  if (!input.productInstalled) return false;
  return input.harborAccess || input.customerOperable;
}

export function resolveSharedAssetOperationsFromFacts(input: {
  dietaryAssetOperationsEnabled: boolean;
  plantRuntimeEnabled: boolean;
}): boolean {
  return input.dietaryAssetOperationsEnabled || input.plantRuntimeEnabled;
}

export function isPlantOperationsDevelopmentOverrideEnabled(): boolean {
  return isPlantOperationsEnabled();
}

export async function isPlantDepartmentProductInstalled(
  facilityId: string,
): Promise<boolean> {
  const product = getDepartmentProduct("PLANT");
  if (!product) return false;
  const departments = await prisma.department.findMany({
    where: { facilityId, isActive: true },
    select: { key: true, isActive: true },
  });
  return Boolean(matchDepartmentRecordForProduct(departments, product));
}

export async function isPlantRuntimeEnabled(
  facilityId: string,
  session?: PlantRuntimeSession | null,
): Promise<boolean> {
  const developmentOverride = isPlantOperationsDevelopmentOverrideEnabled();
  if (developmentOverride) {
    return resolvePlantRuntimeFromFacts({
      developmentOverride: true,
      productInstalled: false,
      harborAccess: false,
      customerOperable: false,
    });
  }

  const product = getDepartmentProduct("PLANT");
  if (!product) {
    return resolvePlantRuntimeFromFacts({
      developmentOverride: false,
      productInstalled: false,
      harborAccess: false,
      customerOperable: false,
    });
  }

  const context = await loadFacilityDepartmentAccessContext(prisma, facilityId);
  const department = matchDepartmentRecordForProduct(context.departments, product);
  if (!department) {
    return resolvePlantRuntimeFromFacts({
      developmentOverride: false,
      productInstalled: false,
      harborAccess: false,
      customerOperable: false,
    });
  }

  return resolvePlantRuntimeFromFacts({
    developmentOverride: false,
    productInstalled: true,
    harborAccess: hasInternalDepartmentProductAccess({
      authKind: session?.authKind,
      productKey: "PLANT",
    }),
    customerOperable: isDepartmentRowCustomerOperable({
      key: department.key,
      isActive: department.isActive,
      entitlementStatus: matchEntitlementStatusForProduct(context.entitlements, product),
      billingStatus: context.billingStatus,
      entitlementsEnforced: context.entitlementsEnforced,
    }),
  });
}

/** Shared Asset Run/profile: Dietary flag or Plant runtime. */
export async function isSharedAssetOperationsEnabled(
  facilityId: string,
  session?: PlantRuntimeSession | null,
): Promise<boolean> {
  return resolveSharedAssetOperationsFromFacts({
    dietaryAssetOperationsEnabled: isDietaryAssetOperationsEnabled(),
    plantRuntimeEnabled: isDietaryAssetOperationsEnabled()
      ? true
      : await isPlantRuntimeEnabled(facilityId, session),
  });
}
