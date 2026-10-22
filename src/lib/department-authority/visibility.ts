import { notFound } from "next/navigation";
import type { Prisma, PrismaClient } from "@prisma/client";

import type { DepartmentAccessSession } from "@/lib/department-authority/resolve";
import { hasPlantDomainCapabilities } from "@/lib/department-admission";
import { employeeBelongsToDepartmentWhere } from "@/lib/employee-membership/department";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { assetResponsibleDepartmentWhere } from "@/lib/asset-operations/ownership";

import { resolveDepartmentAccessMap } from "./resolve";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Departments a person may see while Contracted Department Authority is on.
 * Null means the flag is off: callers must leave their queries unchanged.
 * `coversEveryDepartment` is the Facility Administrator and Harbor case, where
 * the existing facility-wide list is already the right one.
 * `seesEveryAsset` is Plant, the Facility Administrator, and Harbor (CDA-D18).
 */
export type DepartmentVisibility = {
  departmentIds: ReadonlySet<string>;
  /** Departments whose pages open: MANAGE and VIEW. SUMMARY is not in this set. */
  pageDepartmentIds: ReadonlySet<string>;
  /** Vendor-run Departments whose head has accepted. The Facility Administrator sees a summary. */
  summaryDepartmentIds: ReadonlySet<string>;
  /** Pages plus compliance Records the Facility Administrator may open in SUMMARY. */
  complianceDepartmentIds: ReadonlySet<string>;
  /** Departments this person may change. A subset of departmentIds. */
  manageDepartmentIds: ReadonlySet<string>;
  coversEveryDepartment: boolean;
  seesEveryAsset: boolean;
};

export async function loadDepartmentVisibility(
  db: DbClient,
  session: DepartmentAccessSession,
  facilityId: string,
): Promise<DepartmentVisibility | null> {
  if (!isContractedDepartmentAuthorityEnabled()) return null;

  const departments = await db.department.findMany({
    where: { facilityId, isActive: true },
    select: { id: true, key: true },
  });
  const map = await resolveDepartmentAccessMap(db, session, {
    facilityId,
    departmentIds: departments.map((department) => department.id),
  });

  const departmentIds = new Set<string>();
  const pageDepartmentIds = new Set<string>();
  const summaryDepartmentIds = new Set<string>();
  const complianceDepartmentIds = new Set<string>();
  const manageDepartmentIds = new Set<string>();
  const role = "role" in session ? session.role : undefined;
  let seesEveryAsset = role ? isFacilityAdministratorRole(role) : false;
  if (session.authKind === "harbor_staff") seesEveryAsset = true;

  for (const department of departments) {
    const access = map.get(department.id);
    if (!access || access.mode === "NONE") continue;
    departmentIds.add(department.id);
    if (access.mode === "SUMMARY") summaryDepartmentIds.add(department.id);
    else pageDepartmentIds.add(department.id);
    if (access.mode === "MANAGE" || access.mode === "VIEW" || access.canReadComplianceRecords) {
      complianceDepartmentIds.add(department.id);
    }
    if (access.mode === "MANAGE") manageDepartmentIds.add(department.id);
    if (hasPlantDomainCapabilities(department.key) && (access.isMember || access.isHead)) {
      seesEveryAsset = true;
    }
  }

  return {
    departmentIds,
    pageDepartmentIds,
    summaryDepartmentIds,
    complianceDepartmentIds,
    manageDepartmentIds,
    coversEveryDepartment: departmentIds.size === departments.length,
    seesEveryAsset,
  };
}

/** Null means "do not add a department filter" (flag off, or this person sees every Department). */
export function visibleDepartmentIdList(
  visibility: DepartmentVisibility | null,
): readonly string[] | null {
  if (!visibility) return null;
  if (visibility.summaryDepartmentIds.size > 0) return [...visibility.pageDepartmentIds];
  if (visibility.coversEveryDepartment) return null;
  return [...visibility.departmentIds];
}

export function departmentIsVisible(
  visibility: DepartmentVisibility | null,
  departmentId: string,
): boolean {
  if (!visibility) return true;
  return visibility.departmentIds.has(departmentId);
}

/** Direct link to a Department this person cannot see. Flag off does nothing. */
export async function assertVisibleDepartment(
  db: DbClient,
  session: DepartmentAccessSession,
  facilityId: string,
  departmentId: string,
): Promise<void> {
  const visibility = await loadDepartmentVisibility(db, session, facilityId);
  if (!visibility) return;
  if (!visibility.pageDepartmentIds.has(departmentId)) notFound();
}

/** Log Book for a Department this person may read, including a vendor summary. */
export async function assertComplianceRecordsDepartment(
  db: DbClient,
  session: DepartmentAccessSession,
  facilityId: string,
  departmentId: string,
): Promise<void> {
  const visibility = await loadDepartmentVisibility(db, session, facilityId);
  if (!visibility) return;
  if (!visibility.complianceDepartmentIds.has(departmentId)) notFound();
}

export function employeeVisibleWhere(visibility: DepartmentVisibility): Prisma.EmployeeWhereInput {
  if (visibility.summaryDepartmentIds.size === 0) {
    if (visibility.coversEveryDepartment) return {};
    const ids = [...visibility.departmentIds];
    if (ids.length === 0) return { id: { in: [] } };
    return { OR: ids.map((departmentId) => employeeBelongsToDepartmentWhere(departmentId)) };
  }
  const pageIds = [...visibility.pageDepartmentIds];
  return {
    OR: [
      ...pageIds.map((departmentId) => employeeBelongsToDepartmentWhere(departmentId)),
      { primaryDepartmentId: null, employeeDepartments: { none: {} } },
    ],
  };
}

export function assetVisibilityWhere(input: {
  visibility: DepartmentVisibility | null;
  activeDepartmentId?: string | null;
}): Prisma.AssetWhereInput {
  if (!input.visibility) return assetResponsibleDepartmentWhere(input.activeDepartmentId);
  if (input.visibility.seesEveryAsset) return {};
  const ids = [...input.visibility.departmentIds];
  const active = input.activeDepartmentId;
  const limited = active && input.visibility.departmentIds.has(active) ? [active] : ids;
  return { departmentId: { in: limited } };
}
