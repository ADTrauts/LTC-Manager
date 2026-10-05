import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";

import {
  evaluateCustomerDepartmentOperability,
  resolveCommercialEntitlement,
  type BillingStatusForEntitlement,
} from "./eligibility";
import {
  getDepartmentProduct,
  isDepartmentProductCustomerVisible,
  listDepartmentProducts,
  matchDepartmentRecordForProduct,
  matchEntitlementStatusForProduct,
  type DepartmentProduct,
  type DepartmentProductReleaseStatus,
} from "./registry";

export type FacilityDepartmentRecord = {
  id: string;
  key: string;
  isActive: boolean;
};

export type FacilityEntitlementRecord = {
  departmentKey: string;
  status: "ACTIVE" | "REVOKED";
};

export type FacilityDepartmentCatalogItem = {
  productKey: string;
  installationKey: string;
  name: string;
  industry: DepartmentProduct["industry"];
  releaseStatus: DepartmentProductReleaseStatus;
  shortDescription: string | null;
  customerCapabilities: readonly string[];
  installed: boolean;
  departmentId: string | null;
  departmentActive: boolean;
  licensed: boolean;
  entitled: boolean;
  operable: boolean;
  availableToAdd: boolean;
};

export function canPurchaseDepartmentProducts(role: AppRole): boolean {
  return hasAtLeastRole(role, "FACILITY_ADMINISTRATOR");
}

export function deriveFacilityDepartmentCatalog(input: {
  products?: readonly DepartmentProduct[];
  departments: readonly FacilityDepartmentRecord[];
  entitlements: readonly FacilityEntitlementRecord[];
  billingStatus?: BillingStatusForEntitlement;
  entitlementsEnforced?: boolean;
}): FacilityDepartmentCatalogItem[] {
  const products = (input.products ?? listDepartmentProducts()).filter((product) =>
    isDepartmentProductCustomerVisible(product),
  );
  const billingStatus = input.billingStatus ?? null;
  const entitlementsEnforced = input.entitlementsEnforced ?? false;

  return products.map((product) => {
    const department = matchDepartmentRecordForProduct(input.departments, product);
    const installed = Boolean(department);
    const entitlementStatus = matchEntitlementStatusForProduct(input.entitlements, product);
    const licensed = entitlementStatus === "ACTIVE";
    const entitled = resolveCommercialEntitlement({
      releaseStatus: product.status,
      entitlementStatus,
      billingStatus,
      entitlementsEnforced,
      installed,
    });
    const operability = evaluateCustomerDepartmentOperability({
      productKey: product.productKey,
      releaseStatus: product.status,
      installed,
      departmentActive: department?.isActive ?? false,
      entitled,
    });
    return {
      productKey: product.productKey,
      installationKey: product.installationKey,
      name: product.name,
      industry: product.industry,
      releaseStatus: product.status,
      shortDescription: product.shortDescription ?? null,
      customerCapabilities: product.customerCapabilities ?? [],
      installed,
      departmentId: department?.id ?? null,
      departmentActive: department?.isActive ?? false,
      licensed,
      entitled,
      operable: operability.operable,
      availableToAdd: !installed && !licensed,
    };
  });
}

export function findCatalogItemForDepartmentKey(
  catalog: readonly FacilityDepartmentCatalogItem[],
  departmentKey: string,
): FacilityDepartmentCatalogItem | undefined {
  const product = getDepartmentProduct(departmentKey);
  if (!product) return catalog.find((item) => item.productKey === departmentKey);
  return catalog.find((item) => item.productKey === product.productKey);
}

export function publishedCatalogProductKeys(
  items: readonly FacilityDepartmentCatalogItem[],
): string[] {
  return items.map((item) => item.productKey);
}

export function availableToAddProductKeys(
  items: readonly FacilityDepartmentCatalogItem[],
): string[] {
  return items.filter((item) => item.availableToAdd).map((item) => item.productKey);
}

export function industryCatalogLabel(industry: DepartmentProduct["industry"] | string): string {
  if (industry === "healthcare") return "Healthcare";
  return industry;
}

export function groupCatalogByIndustry(
  items: readonly FacilityDepartmentCatalogItem[],
): Array<{
  industry: DepartmentProduct["industry"] | string;
  label: string;
  products: FacilityDepartmentCatalogItem[];
}> {
  const groups = new Map<string, FacilityDepartmentCatalogItem[]>();
  for (const item of items) {
    const existing = groups.get(item.industry) ?? [];
    existing.push(item);
    groups.set(item.industry, existing);
  }
  return [...groups.entries()].map(([industry, products]) => ({
    industry,
    label: industryCatalogLabel(industry),
    products,
  }));
}

export function selectOperableCatalogItems(
  items: readonly FacilityDepartmentCatalogItem[],
): FacilityDepartmentCatalogItem[] {
  return items.filter((item) => item.operable);
}
