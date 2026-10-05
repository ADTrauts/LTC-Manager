/**
 * Vssyl Department Product registry.
 *
 * Vssyl Inc. publishes Department Products. A facility installs a product
 * as a Department row. This registry is not a shared-engine admission list
 * and not a plugin host.
 *
 * Industry and facility-type applicability are catalog metadata only.
 * They do not grant entitlement, release visibility, or installation.
 * Facility classification is derived from existing Organization.organizationType
 * and Facility.vocabularyProfile — not a second persisted taxonomy.
 *
 * A product existing in this registry does not make it customer-visible.
 * Customer visibility requires release status AVAILABLE.
 *
 * Product identity and facility Department identity are not the same thing.
 * Healthcare Food & Nutrition is the Vssyl Product. A facility may locally
 * name its installed Department Dietary, Food & Nutrition, or something else.
 *
 * Compatibility:
 *   Canonical product key: HEALTHCARE_FOOD_NUTRITION
 *   Legacy alias / persisted install key: DIETARY
 *   DIETARY is not a second sellable Product. It resolves to the same lineage.
 */

import {
  FACILITY_INDUSTRIES,
  FACILITY_TYPES,
  type FacilityIndustry,
  type FacilityType,
} from "@/lib/facility-classification";

export const DEPARTMENT_PRODUCT_INDUSTRIES = FACILITY_INDUSTRIES;
export type DepartmentProductIndustry = FacilityIndustry;

export const DEPARTMENT_PRODUCT_FACILITY_TYPES = FACILITY_TYPES;
export type DepartmentProductFacilityType = FacilityType;

export const DEPARTMENT_PRODUCT_KEYS = ["HEALTHCARE_FOOD_NUTRITION", "EVS", "PLANT"] as const;
export type DepartmentProductKey = (typeof DEPARTMENT_PRODUCT_KEYS)[number];

/**
 * Historical commercial/install key. One product lineage — not a second Product.
 * Persisted Department.key and FacilityDepartmentEntitlement.departmentKey stay
 * on this value so existing installations and Stripe metadata do not fork.
 */
export const LEGACY_DEPARTMENT_PRODUCT_ALIASES = {
  DIETARY: "HEALTHCARE_FOOD_NUTRITION",
} as const satisfies Record<string, DepartmentProductKey>;

export type LegacyDepartmentProductAlias = keyof typeof LEGACY_DEPARTMENT_PRODUCT_ALIASES;

export type DepartmentProductReferenceKey = DepartmentProductKey | LegacyDepartmentProductAlias;

export const DEPARTMENT_PRODUCT_RELEASE_STATUSES = [
  "DEVELOPMENT",
  "AVAILABLE",
  "RETIRED",
] as const;
export type DepartmentProductReleaseStatus = (typeof DEPARTMENT_PRODUCT_RELEASE_STATUSES)[number];
export type DepartmentProductStatus = DepartmentProductReleaseStatus;

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
  /**
   * Persisted Department.key and entitlement.departmentKey for this lineage.
   * May differ from productKey when a legacy install key is preserved.
   */
  installationKey: string;
  /** Default facility Department.name on first install. Not the commercial name. */
  defaultDepartmentName: string;
  industry: DepartmentProductIndustry;
  /** Operating environments this Product was designed for. Not a second Product. */
  facilityTypes: readonly DepartmentProductFacilityType[];
  status: DepartmentProductReleaseStatus;
  /** Customer marketplace subtitle. Omit for products that are not customer-visible. */
  shortDescription?: string;
  /** Customer marketplace capability list. Only certified AVAILABLE products declare these. */
  customerCapabilities?: readonly string[];
  /** Display / bootstrap sort on the facility Department row. */
  sortOrder: number;
  domainCapability: DepartmentProductDomainCapability | null;
  starters: DepartmentProductStarterRefs;
};

const DEPARTMENT_PRODUCTS: readonly DepartmentProduct[] = [
  {
    productKey: "HEALTHCARE_FOOD_NUTRITION",
    name: "Healthcare Food & Nutrition",
    installationKey: "DIETARY",
    defaultDepartmentName: "Dietary",
    industry: "HEALTHCARE",
    facilityTypes: ["HOSPITAL", "LONG_TERM_CARE"],
    status: "AVAILABLE",
    shortDescription: "Food and nutrition operations for hospitals and long-term care.",
    customerCapabilities: [
      "Location Functions",
      "Operating Rhythm",
      "Work",
      "Records",
      "Menus",
      "Audit / Reports",
    ],
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
    installationKey: "EVS",
    defaultDepartmentName: "Environmental Services",
    industry: "HEALTHCARE",
    facilityTypes: ["HOSPITAL", "LONG_TERM_CARE"],
    status: "DEVELOPMENT",
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
    installationKey: "PLANT",
    defaultDepartmentName: "Plant Operations",
    industry: "HEALTHCARE",
    facilityTypes: ["HOSPITAL", "LONG_TERM_CARE"],
    status: "DEVELOPMENT",
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

export function canonicalizeDepartmentProductKey(
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed in LEGACY_DEPARTMENT_PRODUCT_ALIASES) {
    return LEGACY_DEPARTMENT_PRODUCT_ALIASES[trimmed as LegacyDepartmentProductAlias];
  }
  return trimmed;
}

export function isLegacyDepartmentProductAlias(
  key: string | null | undefined,
): key is LegacyDepartmentProductAlias {
  return key === "DIETARY";
}

export function isCanonicalDepartmentProductKey(
  key: string | null | undefined,
): key is DepartmentProductKey {
  return key === "HEALTHCARE_FOOD_NUTRITION" || key === "EVS" || key === "PLANT";
}

export function getDepartmentProduct(
  productKey: string | null | undefined,
): DepartmentProduct | null {
  const canonical = canonicalizeDepartmentProductKey(productKey);
  if (!canonical) return null;
  return PRODUCT_BY_KEY.get(canonical) ?? null;
}

export function isDepartmentProductKey(
  key: string | null | undefined,
): key is DepartmentProductReferenceKey {
  return getDepartmentProduct(key) !== null;
}

export function departmentProductLineageKeys(
  product: { productKey: string; installationKey: string },
): readonly string[] {
  if (product.installationKey === product.productKey) {
    return [product.productKey];
  }
  return [product.productKey, product.installationKey];
}

export function persistableDepartmentProductKey(
  key: string | null | undefined,
): string | null {
  return getDepartmentProduct(key)?.installationKey ?? null;
}

export function departmentProductKeysBelongToSameLineage(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftProduct = getDepartmentProduct(left);
  const rightProduct = getDepartmentProduct(right);
  return Boolean(leftProduct && rightProduct && leftProduct.productKey === rightProduct.productKey);
}

export function matchDepartmentRecordForProduct<T extends { key: string }>(
  departments: readonly T[],
  product: { productKey: string; installationKey: string },
): T | undefined {
  return (
    departments.find((row) => row.key === product.installationKey) ??
    departments.find((row) => row.key === product.productKey)
  );
}

export function matchEntitlementStatusForProduct(
  entitlements: readonly { departmentKey: string; status: "ACTIVE" | "REVOKED" }[],
  product: { productKey: string; installationKey: string },
): "ACTIVE" | "REVOKED" | null {
  const lineage = new Set(departmentProductLineageKeys(product));
  const matches = entitlements.filter((row) => lineage.has(row.departmentKey));
  if (matches.some((row) => row.status === "ACTIVE")) return "ACTIVE";
  if (matches.length > 0) return "REVOKED";
  return null;
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

/** AVAILABLE products may be sold, entitled, and newly installed. */
export function isDepartmentProductOfferedForSale(product: {
  status: DepartmentProductReleaseStatus;
}): boolean {
  return product.status === "AVAILABLE";
}

/** Customer marketplace and new facility installation. */
export function isDepartmentProductAvailableForInstall(product: {
  status: DepartmentProductReleaseStatus;
}): boolean {
  return isDepartmentProductOfferedForSale(product);
}

export function isDepartmentProductCustomerVisible(product: {
  status: DepartmentProductReleaseStatus;
}): boolean {
  return product.status === "AVAILABLE";
}

/**
 * Commercially recognized products may keep an existing entitlement.
 * DEVELOPMENT is never a customer commercial product.
 */
export function isDepartmentProductCommerciallyRecognized(product: {
  status: DepartmentProductReleaseStatus;
}): boolean {
  return product.status === "AVAILABLE" || product.status === "RETIRED";
}
