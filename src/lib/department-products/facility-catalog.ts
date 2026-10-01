import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";

import {
  isDepartmentProductAvailableForInstall,
  listDepartmentProducts,
  type DepartmentProduct,
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
  name: string;
  industry: DepartmentProduct["industry"];
  installed: boolean;
  departmentId: string | null;
  departmentActive: boolean;
  licensed: boolean;
  availableToAdd: boolean;
};

export function canPurchaseDepartmentProducts(role: AppRole): boolean {
  return hasAtLeastRole(role, "FACILITY_ADMINISTRATOR");
}

export function deriveFacilityDepartmentCatalog(input: {
  products?: readonly DepartmentProduct[];
  departments: readonly FacilityDepartmentRecord[];
  entitlements: readonly FacilityEntitlementRecord[];
}): FacilityDepartmentCatalogItem[] {
  const products = (input.products ?? listDepartmentProducts()).filter((product) =>
    isDepartmentProductAvailableForInstall(product),
  );
  const departmentByKey = new Map(input.departments.map((row) => [row.key, row]));
  const licensedKeys = new Set(
    input.entitlements
      .filter((row) => row.status === "ACTIVE")
      .map((row) => row.departmentKey),
  );

  return products.map((product) => {
    const department = departmentByKey.get(product.productKey);
    const installed = Boolean(department);
    const licensed = licensedKeys.has(product.productKey);
    return {
      productKey: product.productKey,
      name: product.name,
      industry: product.industry,
      installed,
      departmentId: department?.id ?? null,
      departmentActive: department?.isActive ?? false,
      licensed,
      availableToAdd: !installed && !licensed,
    };
  });
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
