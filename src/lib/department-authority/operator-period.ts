import type { Prisma, PrismaClient } from "@prisma/client";

import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { getFacilityServiceDate } from "@/lib/operational-time/service-date";

type Db = PrismaClient | Prisma.TransactionClient;

export type OperatorPeriodRow = {
  id: string;
  organizationId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

/** Vendor period in force on a service date. A facility-operated range stays null. */
export function vendorPeriodIdOnDate(input: {
  facilityOrganizationId: string;
  serviceDate: Date;
  periods: readonly OperatorPeriodRow[];
}): string | null {
  const covering = input.periods
    .filter((period) => period.organizationId !== input.facilityOrganizationId)
    .filter((period) => period.effectiveFrom.getTime() <= input.serviceDate.getTime())
    .filter((period) => period.effectiveTo == null || period.effectiveTo.getTime() >= input.serviceDate.getTime())
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return covering[0]?.id ?? null;
}

/**
 * Period stamp for a new Department row. Null when enforcement is off or the
 * Department is self-operated. Callers store the result and do not change it later.
 */
export async function operatorPeriodIdForCreate(
  db: Db,
  input: { facilityId: string; departmentId: string; at?: Date },
): Promise<string | null> {
  if (!isContractedDepartmentAuthorityEnabled()) return null;
  const at = input.at ?? new Date();
  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { organizationId: true, timezone: true },
  });
  if (!facility) return null;
  const serviceDate = getFacilityServiceDate(facility.timezone, at);
  const periods = await db.departmentOperatorRelationship.findMany({
    where: { departmentId: input.departmentId },
    select: { id: true, organizationId: true, effectiveFrom: true, effectiveTo: true },
  });
  return vendorPeriodIdOnDate({
    facilityOrganizationId: facility.organizationId,
    serviceDate,
    periods,
  });
}

export type OperatorPeriodWhere =
  | Record<string, never>
  | { operatorPeriodId: string }
  | { OR: Array<{ operatorPeriodId: null } | { operatorPeriodId: { in: string[] } }> };

/** Operating lists. A current vendor period hides every other period, including the facility's. */
export function whereForOperationPeriod(input: {
  vendorPeriodId: string | null;
  facilityPeriodIds: readonly string[];
}): OperatorPeriodWhere {
  if (input.vendorPeriodId) return { operatorPeriodId: input.vendorPeriodId };
  return {
    OR: [
      { operatorPeriodId: null },
      ...(input.facilityPeriodIds.length > 0
        ? [{ operatorPeriodId: { in: [...input.facilityPeriodIds] } }]
        : []),
    ],
  };
}

export function withOperatorPeriod<T extends object>(where: T, period: OperatorPeriodWhere): T {
  if (!("operatorPeriodId" in period) && !("OR" in period)) return where;
  return { AND: [where, period] } as T;
}

/** Period filter for the Department currently being operated. Empty when enforcement is off. */
export async function operationPeriodWhere(
  db: Db,
  input: { facilityId: string; departmentId: string; at?: Date },
): Promise<OperatorPeriodWhere> {
  if (!isContractedDepartmentAuthorityEnabled()) return {};
  const at = input.at ?? new Date();
  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { organizationId: true, timezone: true },
  });
  if (!facility) return { operatorPeriodId: "missing-facility" };
  const serviceDate = getFacilityServiceDate(facility.timezone, at);
  const periods = await db.departmentOperatorRelationship.findMany({
    where: { departmentId: input.departmentId },
    select: { id: true, organizationId: true, effectiveFrom: true, effectiveTo: true },
  });
  return whereForOperationPeriod({
    vendorPeriodId: vendorPeriodIdOnDate({
      facilityOrganizationId: facility.organizationId,
      serviceDate,
      periods,
    }),
    facilityPeriodIds: periods
      .filter((period) => period.organizationId === facility.organizationId)
      .map((period) => period.id),
  });
}

/** Facility People directory. Vendor-stamped workforce stays out. Empty when enforcement is off. */
export async function facilityWorkforcePeriodWhere(
  db: Db,
  facilityId: string,
): Promise<OperatorPeriodWhere> {
  if (!isContractedDepartmentAuthorityEnabled()) return {};
  const facility = await db.facility.findUnique({
    where: { id: facilityId },
    select: { organizationId: true },
  });
  if (!facility) return { operatorPeriodId: "missing-facility" };
  const periods = await db.departmentOperatorRelationship.findMany({
    where: { department: { facilityId }, organizationId: facility.organizationId },
    select: { id: true },
  });
  return whereForOperationPeriod({
    vendorPeriodId: null,
    facilityPeriodIds: periods.map((period) => period.id),
  });
}

/**
 * A scheduled handover keeps the current operator's setup until the replacement
 * date. Facility-operated periods are not retired.
 */
export function vendorPeriodEndsNow(input: {
  organizationId: string;
  facilityOrganizationId: string;
  replacementStartsOn: string;
  serviceDateKey: string;
}): boolean {
  return (
    input.organizationId !== input.facilityOrganizationId &&
    input.replacementStartsOn <= input.serviceDateKey
  );
}

/** Hide a closed vendor period's setup. People and Records stay in place for the archive. */
export async function retireOperatorPeriodSetup(db: Db, periodId: string): Promise<void> {
  if (!isContractedDepartmentAuthorityEnabled()) return;
  const now = new Date();
  await db.menu.updateMany({
    where: { operatorPeriodId: periodId, status: "ACTIVE" },
    data: { status: "INACTIVE" },
  });
  await db.departmentWorkPlan.updateMany({
    where: { operatorPeriodId: periodId, status: { not: "RETIRED" } },
    data: { status: "RETIRED", retiredAt: now },
  });
  await db.departmentOperationalCycle.updateMany({
    where: { operatorPeriodId: periodId, status: { not: "RETIRED" } },
    data: { status: "RETIRED", retiredAt: now },
  });
  const period = await db.departmentOperatorRelationship.findUnique({
    where: { id: periodId },
    select: {
      organizationId: true,
      departmentId: true,
      effectiveFrom: true,
      effectiveTo: true,
      department: { select: { facilityId: true } },
    },
  });
  if (!period?.effectiveTo) return;
  const leaving = await db.asset.findMany({
    where: {
      departmentId: period.departmentId,
      titleKind: "PARTNER",
      titleOrganizationId: period.organizationId,
      status: { not: "RETIRED" },
    },
    select: { id: true, name: true, equipmentType: true, inServiceDate: true, createdAt: true },
  });
  for (const asset of leaving) {
    await db.assetPresenceNote.create({
      data: {
        facilityId: period.department.facilityId,
        departmentId: period.departmentId,
        name: asset.name,
        equipmentType: asset.equipmentType,
        onSiteFrom: asset.inServiceDate ?? asset.createdAt,
        onSiteTo: period.effectiveTo,
        titleOrganizationId: period.organizationId,
      },
    });
    await db.asset.update({
      where: { id: asset.id },
      data: {
        status: "RETIRED",
        retiredAt: now,
        retiredReason: "Left with the operating partner.",
      },
    });
  }
}

export async function listVendorArchive(db: Db, organizationId: string) {
  if (!isContractedDepartmentAuthorityEnabled()) return [];
  return db.departmentOperatorRelationship.findMany({
    where: {
      organizationId,
      effectiveTo: { not: null },
      department: { facility: { organizationId: { not: organizationId } } },
    },
    select: {
      id: true,
      effectiveFrom: true,
      effectiveTo: true,
      department: { select: { name: true, facility: { select: { displayName: true } } } },
      _count: {
        select: {
          menus: true,
          workPlans: true,
          operationalCycles: true,
          employees: true,
          evidenceRecords: true,
        },
      },
    },
    orderBy: [{ effectiveTo: "desc" }, { effectiveFrom: "desc" }],
  });
}
