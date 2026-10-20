import { resolveCommercialEntitlement } from "@/lib/department-products/eligibility";
import { getDepartmentProduct, matchEntitlementStatusForProduct } from "@/lib/department-products/registry";
export type { FacilityBillingStatus } from "@prisma/client";
import type { FacilityBillingStatus } from "@prisma/client";

export type DepartmentEntitlementRecord = { departmentKey: string; status: "ACTIVE" | "REVOKED" };

/** Compatibility entrypoint delegates to the canonical commercial rule. */
export function isDepartmentLicensed(input: {
  enforcementEnabled: boolean;
  billingStatus: FacilityBillingStatus | null;
  entitlements: DepartmentEntitlementRecord[];
  departmentKey: string;
  installed?: boolean;
}): boolean {
  const product = getDepartmentProduct(input.departmentKey);
  return resolveCommercialEntitlement({
    releaseStatus: product?.status ?? null,
    entitlementStatus: product ? matchEntitlementStatusForProduct(input.entitlements, product) : null,
    billingStatus: input.billingStatus,
    entitlementsEnforced: input.enforcementEnabled,
    installed: input.installed ?? false,
  });
}
