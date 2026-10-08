/**
 * Harbor-only unified Console catalog projection.
 *
 * Department Products, catalog Records, and Work presets stay in their own
 * sources. This module reads them in batches and returns one list. It does
 * not persist a Marketplace item, and it does not authorize the caller.
 * Console pages keep calling requireHarborStaff() before any Harbor read,
 * the same boundary listHarborCatalogLines uses.
 */

import type { CatalogLogPurposeType, Prisma, PrismaClient } from "@prisma/client";

import { catalogCategoryLabel } from "@/lib/canonical-logs/catalog-browse";
import { listFacilityCatalogInstallCounts } from "@/lib/canonical-logs/facility-catalog-install";
import {
  buildWorkPlanPresetDraft,
  DEPARTMENT_WORK_PRESET_KEYS,
  workPresetOwningProductKey,
  type DepartmentWorkPresetKey,
} from "@/lib/department-work/work-presets";
import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import { facilityIndustryLabel } from "@/lib/facility-classification";
import { isBillingEntitlementsEnabled } from "@/lib/feature-flags";

import {
  catalogProjectionStatusLabel,
  catalogProjectionVersionDisplay,
  type CatalogVersionSummary,
} from "@/lib/harbor-console/catalog-presentation";
import {
  departmentProductLineageKeys,
  getDepartmentProduct,
  listDepartmentProducts,
  matchDepartmentRecordForProduct,
  matchEntitlementStatusForProduct,
  type DepartmentProduct,
} from "@/lib/department-products/registry";
import {
  evaluateCustomerDepartmentOperability,
  resolveCommercialEntitlement,
  type BillingStatusForEntitlement,
} from "@/lib/department-products/eligibility";

type Db = PrismaClient | Prisma.TransactionClient;

export const CONSOLE_CATALOG_EMPTY = "\u2014";

export const CONSOLE_CATALOG_SOURCE_TYPES = [
  "DEPARTMENT_PRODUCT",
  "CATALOG_RECORD",
  "WORK_PRESET",
] as const;

export type ConsoleCatalogSourceType = (typeof CONSOLE_CATALOG_SOURCE_TYPES)[number];

export const CONSOLE_CATALOG_FAMILIES = ["DEPARTMENTS", "RECORDS", "WORK"] as const;

export type ConsoleCatalogFamily = (typeof CONSOLE_CATALOG_FAMILIES)[number];

export const CONSOLE_CATALOG_RECORD_SUBTYPES = ["LOG", "CHECKLIST", "INSPECTION"] as const;

export type ConsoleCatalogRecordSubtype = (typeof CONSOLE_CATALOG_RECORD_SUBTYPES)[number];

export type ConsoleCatalogUsageLabel = "users" | "placements" | "published plans";

export type ConsoleCatalogItem = {
  sourceType: ConsoleCatalogSourceType;
  sourceId: string;
  stableKey: string;
  name: string;
  catalogFamily: ConsoleCatalogFamily;
  catalogSubtype: ConsoleCatalogRecordSubtype | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  versionDisplay: string;
  statusKey: string | null;
  statusLabel: string;
  facilityInstallCount: number;
  usageCount: number | null;
  usageLabel: ConsoleCatalogUsageLabel | null;
  detailHref: string;
  actions: {
    view: boolean;
    author: boolean;
  };
};

const RECORD_SUBTYPE_SET = new Set<string>(CONSOLE_CATALOG_RECORD_SUBTYPES);

type DepartmentInstallRow = {
  id: string;
  facilityId: string;
  key: string;
  isActive: boolean;
};

type EntitlementRow = {
  facilityId: string;
  departmentKey: string;
  status: "ACTIVE" | "REVOKED";
};

type EmployeeAccessRow = {
  id: string;
  facilityId: string;
  email: string | null;
  status: "ACTIVE" | "OFF" | "TERMINATED";
  primaryDepartmentId: string | null;
  employeeDepartments: Array<{ departmentId: string }>;
  roleType?: string | null;
};

type FacilityAdministratorRow = {
  id: string;
  facilityId: string;
  email: string;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  roleKey: string;
};

type CatalogDefinitionRow = {
  id: string;
  stableKey: string;
  version: number;
  status: CatalogVersionSummary["status"];
  name: string;
  category: Parameters<typeof catalogCategoryLabel>[0];
  purposeType: CatalogLogPurposeType;
};

export type WorkPresetAdoptionPlan = {
  presetKey: string | null;
  stableKey: string;
  facilityId: string;
  departmentId: string;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
};

type WorkPlanAdoptionRow = WorkPresetAdoptionPlan;

export function consoleCatalogProductDetailHref(productKey: string): string {
  return `/console/catalog/products/${productKey}`;
}

export function consoleCatalogRecordDetailHref(stableKey: string): string {
  return `/console/catalog/${stableKey}`;
}

export function consoleCatalogWorkDetailHref(presetKey: string): string {
  return `/console/catalog/work/${presetKey}`;
}

function isRecordSubtype(purposeType: string): purposeType is ConsoleCatalogRecordSubtype {
  return RECORD_SUBTYPE_SET.has(purposeType);
}

export function billingStatusFor(status: string | null | undefined): BillingStatusForEntitlement {
  if (
    status === "UNMANAGED" ||
    status === "INCOMPLETE" ||
    status === "ACTIVE" ||
    status === "PAST_DUE" ||
    status === "CANCELED"
  ) {
    return status;
  }
  return null;
}

export function accessIdentity(email: string | null | undefined, fallback: string): string {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized ? `email:${normalized}` : fallback;
}

export function departmentInstallIsCustomerOperable(input: {
  product: DepartmentProduct;
  department: Pick<DepartmentInstallRow, "isActive">;
  entitlements: readonly EntitlementRow[];
  billingStatus: BillingStatusForEntitlement;
  entitlementsEnforced: boolean;
}): boolean {
  const entitlementStatus = matchEntitlementStatusForProduct(input.entitlements, input.product);
  const entitled = resolveCommercialEntitlement({
    releaseStatus: input.product.status,
    entitlementStatus,
    billingStatus: input.billingStatus,
    entitlementsEnforced: input.entitlementsEnforced,
    installed: true,
  });
  return evaluateCustomerDepartmentOperability({
    productKey: input.product.productKey,
    releaseStatus: input.product.status,
    installed: true,
    departmentActive: input.department.isActive,
    entitled,
  }).operable;
}

export const PRODUCT_ACCESS_ROLES = [
  "generalManagers",
  "managers",
  "supervisors",
  "staff",
  "facilityAdministrators",
] as const;

export type ProductAccessRole = (typeof PRODUCT_ACCESS_ROLES)[number];

const PRODUCT_ACCESS_ROLE_RANK: Record<ProductAccessRole, number> = {
  generalManagers: 5,
  managers: 4,
  supervisors: 3,
  staff: 2,
  facilityAdministrators: 1,
};

/** Employee.roleType is the operational role. Lead Team Member counts as Staff. */
export function employeeProductAccessRole(roleType: string | null | undefined): ProductAccessRole | null {
  switch (roleType) {
    case "GM":
      return "generalManagers";
    case "MANAGER":
      return "managers";
    case "SUPERVISOR":
      return "supervisors";
    case "STAFF":
    case "LEAD_TEAM_MEMBER":
      return "staff";
    case "FACILITY_ADMINISTRATOR":
      return "facilityAdministrators";
    default:
      return null;
  }
}

export type ProductFacilityAccessIdentity = {
  identity: string;
  role: ProductAccessRole | null;
};

/**
 * People who can access one installed, customer-operable Department.
 * Dedup is inside this facility: the same email is one person. An employee
 * operational role wins over a Facility Administrator user with that email.
 * When two employees share an email, the higher operational role wins.
 */
export function productFacilityAccessIdentities(input: {
  facilityId: string;
  departmentId: string;
  employees: readonly EmployeeAccessRow[];
  administrators: readonly FacilityAdministratorRow[];
}): ProductFacilityAccessIdentity[] {
  const roles = new Map<string, ProductAccessRole | null>();
  const ranks = new Map<string, number>();
  for (const employee of input.employees) {
    if (employee.facilityId !== input.facilityId || employee.status !== "ACTIVE") continue;
    if (!employeeBelongsToDepartment(employee, input.departmentId)) continue;
    const identity = accessIdentity(employee.email, `employee:${employee.id}`);
    const role = employeeProductAccessRole(employee.roleType);
    const rank = role ? PRODUCT_ACCESS_ROLE_RANK[role] : 0;
    const current = ranks.get(identity);
    if (current == null || rank > current) {
      roles.set(identity, role);
      ranks.set(identity, rank);
    }
  }
  for (const administrator of input.administrators) {
    if (administrator.facilityId !== input.facilityId) continue;
    if (!administrator.isActive || administrator.emailVerifiedAt == null) continue;
    if (administrator.roleKey !== "FACILITY_ADMINISTRATOR") continue;
    const identity = accessIdentity(administrator.email, `user:${administrator.id}`);
    if (!roles.has(identity)) roles.set(identity, "facilityAdministrators");
  }
  return [...roles.entries()].map(([identity, role]) => ({ identity, role }));
}

function countUsersWithAccess(input: {
  facilityId: string;
  departmentId: string;
  employees: readonly EmployeeAccessRow[];
  administrators: readonly FacilityAdministratorRow[];
}): number {
  return productFacilityAccessIdentities(input).length;
}

export function toDepartmentProductCatalogItem(input: {
  product: DepartmentProduct;
  facilityInstallCount: number;
  usageCount: number;
}): ConsoleCatalogItem {
  return {
    sourceType: "DEPARTMENT_PRODUCT",
    sourceId: input.product.productKey,
    stableKey: input.product.productKey,
    name: input.product.name,
    catalogFamily: "DEPARTMENTS",
    catalogSubtype: null,
    categoryKey: input.product.industry,
    categoryLabel: facilityIndustryLabel(input.product.industry),
    versionDisplay: input.product.versionLabel ?? CONSOLE_CATALOG_EMPTY,
    statusKey: input.product.status,
    statusLabel: input.product.status,
    facilityInstallCount: input.facilityInstallCount,
    usageCount: input.usageCount,
    usageLabel: "users",
    detailHref: consoleCatalogProductDetailHref(input.product.productKey),
    actions: { view: true, author: false },
  };
}

export function toCatalogRecordCatalogItem(input: {
  versions: readonly CatalogDefinitionRow[];
  facilityInstallCount: number;
  usageCount: number;
}): ConsoleCatalogItem | null {
  const ordered = [...input.versions].sort((a, b) => b.version - a.version);
  const published = ordered.find((row) => row.status === "PUBLISHED");
  const headline = published ?? ordered[0];
  if (!headline || !isRecordSubtype(headline.purposeType)) return null;
  return {
    sourceType: "CATALOG_RECORD",
    sourceId: headline.id,
    stableKey: headline.stableKey,
    name: headline.name,
    catalogFamily: "RECORDS",
    catalogSubtype: headline.purposeType,
    categoryKey: headline.category,
    categoryLabel: catalogCategoryLabel(headline.category),
    versionDisplay: catalogProjectionVersionDisplay(ordered),
    statusKey: headline.status,
    statusLabel: catalogProjectionStatusLabel(ordered),
    facilityInstallCount: input.facilityInstallCount,
    usageCount: input.usageCount,
    usageLabel: "placements",
    detailHref: consoleCatalogRecordDetailHref(headline.stableKey),
    actions: { view: true, author: true },
  };
}

export function toWorkPresetCatalogItem(input: {
  presetKey: DepartmentWorkPresetKey;
  name: string;
  product: DepartmentProduct;
  facilityInstallCount: number;
  usageCount: number;
}): ConsoleCatalogItem {
  return {
    sourceType: "WORK_PRESET",
    sourceId: input.presetKey,
    stableKey: input.presetKey,
    name: input.name,
    catalogFamily: "WORK",
    catalogSubtype: null,
    categoryKey: input.product.productKey,
    categoryLabel: input.product.name,
    versionDisplay: CONSOLE_CATALOG_EMPTY,
    statusKey: null,
    statusLabel: CONSOLE_CATALOG_EMPTY,
    facilityInstallCount: input.facilityInstallCount,
    usageCount: input.usageCount,
    usageLabel: "published plans",
    detailHref: consoleCatalogWorkDetailHref(input.presetKey),
    actions: { view: true, author: false },
  };
}

export function workPlanMatchesPreset(
  plan: Pick<WorkPlanAdoptionRow, "presetKey" | "stableKey">,
  presetKey: string,
): boolean {
  return plan.presetKey === presetKey || plan.stableKey === presetKey;
}

export function summarizeWorkPresetAdoption(
  plans: readonly WorkPresetAdoptionPlan[],
  presetKey: string,
): {
  facilityInstallCount: number;
  usageCount: number;
} {
  const facilities = new Set<string>();
  const publishedLineages = new Set<string>();
  for (const plan of plans) {
    if (!workPlanMatchesPreset(plan, presetKey)) continue;
    facilities.add(plan.facilityId);
    if (plan.status === "PUBLISHED") {
      publishedLineages.add(`${plan.facilityId}\0${plan.departmentId}\0${plan.stableKey}`);
    }
  }
  return { facilityInstallCount: facilities.size, usageCount: publishedLineages.size };
}

async function loadDepartmentProductItems(client: Db): Promise<ConsoleCatalogItem[]> {
  const products = listDepartmentProducts();
  const lineageKeys = [
    ...new Set(products.flatMap((product) => [...departmentProductLineageKeys(product)])),
  ];
  const departments = await client.department.findMany({
    where: { key: { in: lineageKeys } },
    select: { id: true, facilityId: true, key: true, isActive: true },
  });
  const facilityIds = [...new Set(departments.map((row) => row.facilityId))];
  const entitlementsEnforced = isBillingEntitlementsEnabled();

  const [entitlements, billings] =
    facilityIds.length === 0
      ? [[], []]
      : await Promise.all([
          client.facilityDepartmentEntitlement.findMany({
            where: { facilityId: { in: facilityIds }, departmentKey: { in: lineageKeys } },
            select: { facilityId: true, departmentKey: true, status: true },
          }),
          client.facilityBilling.findMany({
            where: { facilityId: { in: facilityIds } },
            select: { facilityId: true, status: true },
          }),
        ]);

  const entitlementsByFacility = new Map<string, EntitlementRow[]>();
  for (const row of entitlements) {
    const list = entitlementsByFacility.get(row.facilityId) ?? [];
    list.push(row);
    entitlementsByFacility.set(row.facilityId, list);
  }
  const billingByFacility = new Map(billings.map((row) => [row.facilityId, row.status]));

  const operableDepartments: Array<{ productKey: string; facilityId: string; departmentId: string }> =
    [];
  const installCountByProduct = new Map<string, number>();

  for (const product of products) {
    const lineage = new Set(departmentProductLineageKeys(product));
    const byFacility = new Map<string, DepartmentInstallRow[]>();
    for (const row of departments) {
      if (!lineage.has(row.key)) continue;
      const list = byFacility.get(row.facilityId) ?? [];
      list.push(row);
      byFacility.set(row.facilityId, list);
    }
    installCountByProduct.set(product.productKey, byFacility.size);
    for (const [facilityId, rows] of byFacility) {
      const department = matchDepartmentRecordForProduct(rows, product);
      if (!department) continue;
      const operable = departmentInstallIsCustomerOperable({
        product,
        department,
        entitlements: entitlementsByFacility.get(facilityId) ?? [],
        billingStatus: billingStatusFor(billingByFacility.get(facilityId)),
        entitlementsEnforced,
      });
      if (!operable) continue;
      operableDepartments.push({
        productKey: product.productKey,
        facilityId,
        departmentId: department.id,
      });
    }
  }

  const operableDepartmentIds = [...new Set(operableDepartments.map((row) => row.departmentId))];
  const operableFacilityIds = [...new Set(operableDepartments.map((row) => row.facilityId))];

  const [employees, administrators] = await Promise.all([
    operableDepartmentIds.length === 0
      ? Promise.resolve([])
      : client.employee.findMany({
          where: {
            status: "ACTIVE",
            OR: [
              { primaryDepartmentId: { in: operableDepartmentIds } },
              { employeeDepartments: { some: { departmentId: { in: operableDepartmentIds } } } },
            ],
          },
          select: {
            id: true,
            facilityId: true,
            email: true,
            status: true,
            primaryDepartmentId: true,
            roleType: true,
            employeeDepartments: { select: { departmentId: true } },
          },
        }),
    operableFacilityIds.length === 0
      ? Promise.resolve([])
      : client.user.findMany({
          where: {
            facilityId: { in: operableFacilityIds },
            isActive: true,
            emailVerifiedAt: { not: null },
            role: { key: "FACILITY_ADMINISTRATOR" },
          },
          select: {
            id: true,
            facilityId: true,
            email: true,
            isActive: true,
            emailVerifiedAt: true,
            role: { select: { key: true } },
          },
        }),
  ]);

  const administratorRows: FacilityAdministratorRow[] = administrators.flatMap((row) => {
    if (!row.facilityId || !row.role?.key) return [];
    return [
      {
        id: row.id,
        facilityId: row.facilityId,
        email: row.email,
        isActive: row.isActive,
        emailVerifiedAt: row.emailVerifiedAt,
        roleKey: row.role.key,
      },
    ];
  });

  const usersByProduct = new Map<string, number>();
  for (const product of products) usersByProduct.set(product.productKey, 0);
  for (const department of operableDepartments) {
    const count = countUsersWithAccess({
      facilityId: department.facilityId,
      departmentId: department.departmentId,
      employees,
      administrators: administratorRows,
    });
    usersByProduct.set(
      department.productKey,
      (usersByProduct.get(department.productKey) ?? 0) + count,
    );
  }

  return products.map((product) =>
    toDepartmentProductCatalogItem({
      product,
      facilityInstallCount: installCountByProduct.get(product.productKey) ?? 0,
      usageCount: usersByProduct.get(product.productKey) ?? 0,
    }),
  );
}

async function loadCatalogRecordItems(client: Db): Promise<ConsoleCatalogItem[]> {
  const [definitions, installCounts, placements] = await Promise.all([
    client.catalogLogDefinition.findMany({
      where: { purposeType: { in: [...CONSOLE_CATALOG_RECORD_SUBTYPES] } },
      select: {
        id: true,
        stableKey: true,
        version: true,
        status: true,
        name: true,
        category: true,
        purposeType: true,
      },
      orderBy: [{ stableKey: "asc" }, { version: "desc" }],
    }),
    listFacilityCatalogInstallCounts(client),
    client.logAttachment.groupBy({
      by: ["catalogStableKey"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);

  const placementCounts = new Map(
    placements.map((row) => [row.catalogStableKey, row._count._all]),
  );
  const byKey = new Map<string, CatalogDefinitionRow[]>();
  for (const row of definitions) {
    if (!isRecordSubtype(row.purposeType)) continue;
    const list = byKey.get(row.stableKey) ?? [];
    list.push(row);
    byKey.set(row.stableKey, list);
  }

  const items: ConsoleCatalogItem[] = [];
  for (const [stableKey, versions] of byKey) {
    const item = toCatalogRecordCatalogItem({
      versions,
      facilityInstallCount: installCounts.get(stableKey) ?? 0,
      usageCount: placementCounts.get(stableKey) ?? 0,
    });
    if (item) items.push(item);
  }
  items.sort((a, b) => a.name.localeCompare(b.name) || a.stableKey.localeCompare(b.stableKey));
  return items;
}

async function loadWorkPresetItems(client: Db): Promise<ConsoleCatalogItem[]> {
  const presetKeys = [...DEPARTMENT_WORK_PRESET_KEYS];
  const plans = await client.departmentWorkPlan.findMany({
    where: {
      OR: [{ presetKey: { in: presetKeys } }, { stableKey: { in: presetKeys } }],
    },
    select: {
      presetKey: true,
      stableKey: true,
      facilityId: true,
      departmentId: true,
      status: true,
    },
  });

  return presetKeys.map((presetKey) => {
    const productKey = workPresetOwningProductKey(presetKey);
    const product = getDepartmentProduct(productKey);
    if (!product) {
      throw new Error(`Work preset ${presetKey} has no Department Product owner.`);
    }
    const adoption = summarizeWorkPresetAdoption(plans, presetKey);
    return toWorkPresetCatalogItem({
      presetKey,
      name: buildWorkPlanPresetDraft(presetKey).name,
      product,
      facilityInstallCount: adoption.facilityInstallCount,
      usageCount: adoption.usageCount,
    });
  });
}

/**
 * Live projection. Query count is fixed per source family, not per product,
 * record, preset, or facility. Harbor session checks stay on the Console page.
 */
export async function listConsoleCatalogItems(client: Db): Promise<ConsoleCatalogItem[]> {
  const [departments, records, work] = await Promise.all([
    loadDepartmentProductItems(client),
    loadCatalogRecordItems(client),
    loadWorkPresetItems(client),
  ]);
  return [...departments, ...records, ...work];
}
