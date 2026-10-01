/**
 * Vssyl Department Product registry.
 *
 * Vssyl Inc. publishes Department Products. A facility installs a product
 * as a Department row. This registry is not a shared-engine admission list
 * and not a plugin host.
 *
 * Industry is catalog metadata only — not a Facility or Organization field.
 */

export const DEPARTMENT_PRODUCT_INDUSTRIES = ["healthcare"] as const;
export type DepartmentProductIndustry = (typeof DEPARTMENT_PRODUCT_INDUSTRIES)[number];

export const DEPARTMENT_PRODUCT_KEYS = ["DIETARY", "EVS", "PLANT"] as const;
export type DepartmentProductKey = (typeof DEPARTMENT_PRODUCT_KEYS)[number];

export type DepartmentProductStatus = "published";

/**
 * Optional exact-key domain module attached to a product.
 * Null means the product uses shared Vssyl Core only.
 */
export type DepartmentProductDomainCapability = "dietary" | "evs" | "plant";

/**
 * References to existing product-owned starters.
 * Values name current modules; they do not copy starter data.
 */
export type DepartmentProductStarterRefs = {
  /** Configuration-time operating-rhythm starter. Plant has none. */
  cycleStarter?: "dietary" | "evs";
  /** `listWorkPlanPresetSummaries(productKey)` — configuration-time. */
  workPresets?: true;
  /** `OPERATIONAL_ROLE_REGISTRY` keyed by productKey — product-authoring. */
  assignmentRoles?: true;
  /** Generic Team Member / Lead / Supervisor / Manager tiers — lazy on load. */
  jobRoleTiers?: "generic";
  /** Facility Builder responsibility presets — configuration-time. */
  responsibilityPresets?: true;
};

export type DepartmentProduct = {
  productKey: DepartmentProductKey;
  name: string;
  industry: DepartmentProductIndustry;
  status: DepartmentProductStatus;
  /** Display / bootstrap sort on the facility Department row. */
  sortOrder: number;
  domainCapability: DepartmentProductDomainCapability | null;
  starters: DepartmentProductStarterRefs;
};

const DEPARTMENT_PRODUCTS: readonly DepartmentProduct[] = [
  {
    productKey: "DIETARY",
    name: "Dietary",
    industry: "healthcare",
    status: "published",
    sortOrder: 10,
    domainCapability: "dietary",
    starters: {
      cycleStarter: "dietary",
      workPresets: true,
      assignmentRoles: true,
      jobRoleTiers: "generic",
      responsibilityPresets: true,
    },
  },
  {
    productKey: "EVS",
    name: "Environmental Services",
    industry: "healthcare",
    status: "published",
    sortOrder: 20,
    domainCapability: "evs",
    starters: {
      cycleStarter: "evs",
      workPresets: true,
      assignmentRoles: true,
      jobRoleTiers: "generic",
      responsibilityPresets: true,
    },
  },
  {
    productKey: "PLANT",
    name: "Plant Operations",
    industry: "healthcare",
    status: "published",
    sortOrder: 30,
    domainCapability: "plant",
    starters: {
      assignmentRoles: true,
      jobRoleTiers: "generic",
      responsibilityPresets: true,
    },
  },
];

const PRODUCT_BY_KEY = new Map<string, DepartmentProduct>(
  DEPARTMENT_PRODUCTS.map((product) => [product.productKey, product]),
);

export function isDepartmentProductKey(
  key: string | null | undefined,
): key is DepartmentProductKey {
  return key === "DIETARY" || key === "EVS" || key === "PLANT";
}

export function getDepartmentProduct(
  productKey: string | null | undefined,
): DepartmentProduct | null {
  if (!productKey) return null;
  return PRODUCT_BY_KEY.get(productKey) ?? null;
}

export function listDepartmentProducts(): readonly DepartmentProduct[] {
  return DEPARTMENT_PRODUCTS;
}

export function listDepartmentProductsForIndustry(
  industry: DepartmentProductIndustry,
): readonly DepartmentProduct[] {
  return DEPARTMENT_PRODUCTS.filter((product) => product.industry === industry);
}

/**
 * Interpret an existing facility Department.key as a Vssyl product installation.
 * User-created keys that are not registry products return null.
 */
export function resolveDepartmentProductForInstallationKey(
  departmentKey: string | null | undefined,
): DepartmentProduct | null {
  return getDepartmentProduct(departmentKey);
}

export function isDepartmentProductAvailableForInstall(product: {
  status: DepartmentProductStatus;
}): boolean {
  return product.status === "published";
}
