/**
 * Canonical customer eligibility for a facility Department.
 *
 * Customer Department context is never "a Department row exists."
 * It is released Product + valid entitlement + installed + active.
 */

import {
  getDepartmentProduct,
  listDepartmentProducts,
  type DepartmentProductReleaseStatus,
} from "./registry";

export type DepartmentAccessAudience = "customer" | "internal";

export type DepartmentOperabilityReason =
  | "operable"
  | "unknown_product"
  | "development"
  | "not_entitled"
  | "not_installed"
  | "inactive"
  | "retired_not_offered";

export type DepartmentOperabilityInput = {
  productKey: string;
  releaseStatus: DepartmentProductReleaseStatus | null;
  installed: boolean;
  departmentActive: boolean;
  entitled: boolean;
};

export type DepartmentOperability = {
  operable: boolean;
  reason: DepartmentOperabilityReason;
};

export type BillingStatusForEntitlement =
  | "UNMANAGED"
  | "INCOMPLETE"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | null;

/**
 * Pure customer-operability rule. Callers resolve `entitled` first.
 * DEVELOPMENT is never customer-operable, even with a row, entitlement, or flag.
 */
export function evaluateCustomerDepartmentOperability(
  input: DepartmentOperabilityInput,
): DepartmentOperability {
  if (!input.releaseStatus) {
    return { operable: false, reason: "unknown_product" };
  }
  if (input.releaseStatus === "DEVELOPMENT") {
    return { operable: false, reason: "development" };
  }
  if (!input.installed) {
    return { operable: false, reason: "not_installed" };
  }
  if (!input.departmentActive) {
    return { operable: false, reason: "inactive" };
  }
  if (!input.entitled) {
    return { operable: false, reason: "not_entitled" };
  }
  return { operable: true, reason: "operable" };
}

/**
 * Resolve whether this facility is commercially entitled to operate a product.
 *
 * ACTIVE entitlement always counts.
 * When commercial enforcement is off, UNMANAGED/unbilled facilities may continue
 * operating already-installed AVAILABLE or RETIRED products (grandfather).
 * DEVELOPMENT is never entitled for customers.
 */
export function resolveCommercialEntitlement(input: {
  releaseStatus: DepartmentProductReleaseStatus | null;
  entitlementStatus: "ACTIVE" | "REVOKED" | null;
  billingStatus: BillingStatusForEntitlement;
  entitlementsEnforced: boolean;
  installed: boolean;
}): boolean {
  if (!input.releaseStatus || input.releaseStatus === "DEVELOPMENT") {
    return false;
  }
  if (input.entitlementStatus === "ACTIVE") {
    return true;
  }
  if (
    !input.entitlementsEnforced &&
    (input.billingStatus === "UNMANAGED" || input.billingStatus === null) &&
    input.installed &&
    (input.releaseStatus === "AVAILABLE" || input.releaseStatus === "RETIRED")
  ) {
    return true;
  }
  return false;
}

export function evaluateDepartmentForAudience(input: {
  audience: DepartmentAccessAudience;
  productKey: string;
  releaseStatus: DepartmentProductReleaseStatus | null;
  installed: boolean;
  departmentActive: boolean;
  entitled: boolean;
}): DepartmentOperability {
  if (input.audience === "internal") {
    if (!input.installed) return { operable: false, reason: "not_installed" };
    if (!input.departmentActive) return { operable: false, reason: "inactive" };
    return { operable: true, reason: "operable" };
  }
  return evaluateCustomerDepartmentOperability(input);
}

export function departmentProductReleaseStatus(
  productKey: string | null | undefined,
): DepartmentProductReleaseStatus | null {
  return getDepartmentProduct(productKey)?.status ?? null;
}

export type DepartmentPresentationAudience = "customer" | "internal";

/**
 * Current-state customer labels may only name commercially recognized products.
 * DEVELOPMENT remains historical provenance in the projection engine and
 * must not appear as a current operational Department.
 */
export function isCustomerCurrentDepartmentProductKey(
  productKey: string | null | undefined,
): boolean {
  const status = departmentProductReleaseStatus(productKey);
  return status === "AVAILABLE" || status === "RETIRED";
}

export function shouldPresentDepartmentOnCustomerCurrentSurface(
  productKey: string | null | undefined,
  audience: DepartmentPresentationAudience = "customer",
): boolean {
  if (audience === "internal") return Boolean(productKey);
  return isCustomerCurrentDepartmentProductKey(productKey);
}

/**
 * Current customer ownership label. DEVELOPMENT product names are omitted;
 * historical rows stay intact.
 */
export function customerCurrentDepartmentLabel(input: {
  name?: string | null;
  key?: string | null;
}): string | null {
  const name = input.name?.trim() || "";
  const product =
    getDepartmentProduct(input.key) ??
    listDepartmentProducts().find((item) => item.name === name) ??
    null;
  if (product && !isCustomerCurrentDepartmentProductKey(product.productKey)) {
    return null;
  }
  return name || null;
}

/**
 * Explicit internal/developer access — Harbor work sessions only.
 * Domain flags may exercise EVS/Plant behavior in tests, but they must not
 * convert a DEVELOPMENT Product into a customer-operable Department.
 */
export function hasInternalDepartmentProductAccess(input: {
  authKind?: string | null;
  productKey: string;
}): boolean {
  return input.authKind === "harbor_staff";
}

export function marketplaceDenialReason(input: {
  releaseStatus: DepartmentProductReleaseStatus | null;
  installed: boolean;
}): "hidden" | "installed" | "add" | "retired" {
  if (!input.releaseStatus || input.releaseStatus === "DEVELOPMENT") return "hidden";
  if (input.releaseStatus === "RETIRED") return "retired";
  return input.installed ? "installed" : "add";
}
