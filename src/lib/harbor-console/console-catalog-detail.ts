/**
 * Harbor Marketplace detail loaders.
 *
 * Department and Work totals use the same identity, operability, and lineage
 * helpers as `listConsoleCatalogItems`. Record headline counts use the same
 * install and active-placement definitions as the projection.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { facilityIndustryLabel, facilityTypeLabel } from "@/lib/facility-classification";
import { isBillingEntitlementsEnabled } from "@/lib/feature-flags";
import {
  buildWorkPlanPresetDraft,
  DEPARTMENT_WORK_PRESET_KEYS,
  workPresetOwningProductKey,
  type DepartmentWorkPresetKey,
} from "@/lib/department-work/work-presets";
import {
  departmentProductLineageKeys,
  getDepartmentProduct,
  matchDepartmentRecordForProduct,
  matchEntitlementStatusForProduct,
  type DepartmentProduct,
  type DepartmentProductReleaseStatus,
} from "@/lib/department-products/registry";

import {
  CONSOLE_CATALOG_EMPTY,
  PRODUCT_ACCESS_ROLES,
  billingStatusFor,
  departmentInstallIsCustomerOperable,
  productFacilityAccessIdentities,
  summarizeWorkPresetAdoption,
  workPlanMatchesPreset,
  type ProductAccessRole,
} from "@/lib/harbor-console/console-catalog";

type Db = PrismaClient | Prisma.TransactionClient;

export const PRODUCT_ACCESS_ROLE_ROWS: ReadonlyArray<{ key: ProductAccessRole; label: string }> = [
  { key: "generalManagers", label: "General Managers" },
  { key: "managers", label: "Managers" },
  { key: "supervisors", label: "Supervisors" },
  { key: "staff", label: "Staff" },
  { key: "facilityAdministrators", label: "Facility Administrators" },
];

export type ProductAccessRoleCounts = Record<ProductAccessRole, number>;

export type ConsoleProductAccessLabel =
  | "Active"
  | "Revoked"
  | "Not entitled"
  | "Development/internal";

const INSTALLED_TIME_ZONE = "America/New_York";

export function emptyProductAccessRoleCounts(): ProductAccessRoleCounts {
  return {
    generalManagers: 0,
    managers: 0,
    supervisors: 0,
    staff: 0,
    facilityAdministrators: 0,
  };
}

export function formatProductVersionLabel(versionLabel: string | null | undefined): string {
  const trimmed = versionLabel?.trim() ?? "";
  return trimmed || CONSOLE_CATALOG_EMPTY;
}

/** Registry `releasedOn` is a calendar date. Null stays an em dash. */
export function formatProductReleaseDate(releasedOn: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releasedOn?.trim() ?? "");
  if (!match) return CONSOLE_CATALOG_EMPTY;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatConsoleInstalledDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: INSTALLED_TIME_ZONE,
  }).format(value);
}

/**
 * Product access is Active only when the install is customer-operable.
 * DEVELOPMENT is always Development/internal. A REVOKED entitlement row is
 * Revoked. Every other non-operable install, including a disabled Department,
 * is Not entitled. Department Enabled/Disabled stays a separate column.
 */
export function consoleProductAccessLabel(input: {
  releaseStatus: DepartmentProductReleaseStatus;
  operable: boolean;
  entitlementStatus: "ACTIVE" | "REVOKED" | null;
}): ConsoleProductAccessLabel {
  if (input.releaseStatus === "DEVELOPMENT") return "Development/internal";
  if (input.operable) return "Active";
  if (input.entitlementStatus === "REVOKED") return "Revoked";
  return "Not entitled";
}

export function consoleDepartmentStatusLabel(isActive: boolean): "Enabled" | "Disabled" {
  return isActive ? "Enabled" : "Disabled";
}

export function catalogRecordPublishedVersionLabel(version: number | null): string {
  return version == null ? CONSOLE_CATALOG_EMPTY : `v${version}`;
}

export type ConsoleDepartmentProductFacilityRow = {
  facilityId: string;
  facilityName: string;
  organizationName: string;
  installedAt: Date;
  installedLabel: string;
  departmentName: string;
  departmentKey: string;
  departmentStatusLabel: "Enabled" | "Disabled";
  userCount: number;
  accessLabel: ConsoleProductAccessLabel;
};

export type ConsoleDepartmentProductDetail = {
  productKey: string;
  name: string;
  installationKey: string;
  versionLabel: string;
  status: DepartmentProductReleaseStatus;
  releasedLabel: string;
  shortDescription: string | null;
  industryLabel: string;
  facilityTypeLabels: string[];
  capabilities: string[];
  facilityInstallCount: number;
  usersWithAccess: number;
  roleCounts: ProductAccessRoleCounts;
  facilities: ConsoleDepartmentProductFacilityRow[];
};

export type ConsoleWorkPresetPlanRow = {
  id: string;
  facilityId: string;
  facilityName: string;
  organizationName: string;
  departmentName: string;
  planName: string;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  version: number;
};

export type ConsoleWorkPresetDetail = {
  presetKey: DepartmentWorkPresetKey;
  name: string;
  description: string | null;
  owningProductKey: string;
  owningProductName: string;
  versionLabel: string;
  statusLabel: string;
  facilityInstallCount: number;
  publishedPlanCount: number;
  plans: ConsoleWorkPresetPlanRow[];
};

function emptyOrganization(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed || CONSOLE_CATALOG_EMPTY;
}

function isWorkPresetKey(value: string): value is DepartmentWorkPresetKey {
  return (DEPARTMENT_WORK_PRESET_KEYS as readonly string[]).includes(value);
}

function addRoleCounts(target: ProductAccessRoleCounts, role: ProductAccessRole | null, times = 1) {
  if (!role) return;
  target[role] += times;
}

export async function loadConsoleDepartmentProductDetail(
  client: Db,
  productKey: string,
): Promise<ConsoleDepartmentProductDetail | null> {
  const product = getDepartmentProduct(productKey);
  if (!product) return null;
  return loadDepartmentProductDetail(client, product);
}

async function loadDepartmentProductDetail(
  client: Db,
  product: DepartmentProduct,
): Promise<ConsoleDepartmentProductDetail> {
  const lineageKeys = [...departmentProductLineageKeys(product)];
  const departments = await client.department.findMany({
    where: { key: { in: lineageKeys } },
    select: {
      id: true,
      facilityId: true,
      key: true,
      name: true,
      isActive: true,
      createdAt: true,
      facility: {
        select: {
          displayName: true,
          organization: { select: { name: true } },
        },
      },
    },
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

  const entitlementsByFacility = new Map<string, Array<(typeof entitlements)[number]>>();
  for (const row of entitlements) {
    const list = entitlementsByFacility.get(row.facilityId) ?? [];
    list.push(row);
    entitlementsByFacility.set(row.facilityId, list);
  }
  const billingByFacility = new Map(billings.map((row) => [row.facilityId, row.status]));

  const byFacility = new Map<string, typeof departments>();
  for (const row of departments) {
    const list = byFacility.get(row.facilityId) ?? [];
    list.push(row);
    byFacility.set(row.facilityId, list);
  }

  const matched = [...byFacility.entries()].flatMap(([facilityId, rows]) => {
    const department = matchDepartmentRecordForProduct(rows, product);
    return department ? [{ facilityId, department }] : [];
  });

  const operable = matched.flatMap((row) => {
    const entitlementStatus = matchEntitlementStatusForProduct(
      entitlementsByFacility.get(row.facilityId) ?? [],
      product,
    );
    const customerOperable = departmentInstallIsCustomerOperable({
      product,
      department: row.department,
      entitlements: entitlementsByFacility.get(row.facilityId) ?? [],
      billingStatus: billingStatusFor(billingByFacility.get(row.facilityId)),
      entitlementsEnforced,
    });
    if (!customerOperable) return [];
    return [{ ...row, entitlementStatus }];
  });

  const operableDepartmentIds = operable.map((row) => row.department.id);
  const operableFacilityIds = [...new Set(operable.map((row) => row.facilityId))];
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
            roleType: true,
            primaryDepartmentId: true,
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

  const administratorRows = administrators.flatMap((row) => {
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

  const roleCounts = emptyProductAccessRoleCounts();
  let usersWithAccess = 0;
  const facilities = matched
    .map((row) => {
      const facilityEntitlements = entitlementsByFacility.get(row.facilityId) ?? [];
      const entitlementStatus = matchEntitlementStatusForProduct(facilityEntitlements, product);
      const customerOperable = departmentInstallIsCustomerOperable({
        product,
        department: row.department,
        entitlements: facilityEntitlements,
        billingStatus: billingStatusFor(billingByFacility.get(row.facilityId)),
        entitlementsEnforced,
      });
      const identities = customerOperable
        ? productFacilityAccessIdentities({
            facilityId: row.facilityId,
            departmentId: row.department.id,
            employees,
            administrators: administratorRows,
          })
        : [];
      usersWithAccess += identities.length;
      for (const identity of identities) addRoleCounts(roleCounts, identity.role);
      return {
        facilityId: row.facilityId,
        facilityName: row.department.facility.displayName,
        organizationName: emptyOrganization(row.department.facility.organization.name),
        installedAt: row.department.createdAt,
        installedLabel: formatConsoleInstalledDate(row.department.createdAt),
        departmentName: row.department.name,
        departmentKey: row.department.key,
        departmentStatusLabel: consoleDepartmentStatusLabel(row.department.isActive),
        userCount: identities.length,
        accessLabel: consoleProductAccessLabel({
          releaseStatus: product.status,
          operable: customerOperable,
          entitlementStatus,
        }),
      };
    })
    .sort(
      (a, b) =>
        a.facilityName.localeCompare(b.facilityName, "en", { sensitivity: "base" }) ||
        a.departmentName.localeCompare(b.departmentName, "en", { sensitivity: "base" }),
    );

  return {
    productKey: product.productKey,
    name: product.name,
    installationKey: product.installationKey,
    versionLabel: formatProductVersionLabel(product.versionLabel),
    status: product.status,
    releasedLabel: formatProductReleaseDate(product.releasedOn),
    shortDescription: product.shortDescription?.trim() || null,
    industryLabel: facilityIndustryLabel(product.industry),
    facilityTypeLabels: product.facilityTypes.map((type) => facilityTypeLabel(type)),
    capabilities: [...(product.customerCapabilities ?? [])],
    facilityInstallCount: byFacility.size,
    usersWithAccess,
    roleCounts,
    facilities,
  };
}

export async function loadConsoleWorkPresetDetail(
  client: Db,
  presetKey: string,
): Promise<ConsoleWorkPresetDetail | null> {
  if (!isWorkPresetKey(presetKey)) return null;
  const ownerKey = workPresetOwningProductKey(presetKey);
  const owner = getDepartmentProduct(ownerKey);
  if (!owner) return null;
  const draft = buildWorkPlanPresetDraft(presetKey);
  const plans = await client.departmentWorkPlan.findMany({
    where: { OR: [{ presetKey }, { stableKey: presetKey }] },
    select: {
      id: true,
      presetKey: true,
      stableKey: true,
      facilityId: true,
      departmentId: true,
      name: true,
      status: true,
      version: true,
      facility: {
        select: {
          displayName: true,
          organization: { select: { name: true } },
        },
      },
      department: { select: { name: true } },
    },
  });
  const matched = plans.filter((plan) => workPlanMatchesPreset(plan, presetKey));
  const adoption = summarizeWorkPresetAdoption(matched, presetKey);
  return {
    presetKey,
    name: draft.name,
    description: draft.description?.trim() || null,
    owningProductKey: owner.productKey,
    owningProductName: owner.name,
    versionLabel: CONSOLE_CATALOG_EMPTY,
    statusLabel: CONSOLE_CATALOG_EMPTY,
    facilityInstallCount: adoption.facilityInstallCount,
    publishedPlanCount: adoption.usageCount,
    plans: matched
      .map((plan) => ({
        id: plan.id,
        facilityId: plan.facilityId,
        facilityName: plan.facility.displayName,
        organizationName: emptyOrganization(plan.facility.organization.name),
        departmentName: plan.department.name,
        planName: plan.name,
        status: plan.status,
        version: plan.version,
      }))
      .sort(
        (a, b) =>
          a.facilityName.localeCompare(b.facilityName, "en", { sensitivity: "base" }) ||
          a.departmentName.localeCompare(b.departmentName, "en", { sensitivity: "base" }) ||
          a.planName.localeCompare(b.planName, "en", { sensitivity: "base" }) ||
          a.version - b.version,
      ),
  };
}

export function productAccessRoleTotal(counts: ProductAccessRoleCounts): number {
  return PRODUCT_ACCESS_ROLES.reduce((sum, key) => sum + counts[key], 0);
}
