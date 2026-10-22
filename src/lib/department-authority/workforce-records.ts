import type { Prisma, PrismaClient } from "@prisma/client";

import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * One workforce record belongs to one operator (CDA-Q05).
 * A person in both a vendor-run Department and a facility Department has two Employee rows.
 * A linked account can still belong to only one of those rows.
 */
export const WORKFORCE_SPLIT_REASON =
  "This person needs a separate workforce record for that operator. A vendor-run Department and a facility Department do not share one record.";

export type WorkforceOperatorFact = {
  operatingModel: "FACILITY_OPERATED" | "CONTRACTED";
  operatorOrganizationId: string | null;
};

/** Facility-operated Departments share the facility's organization. A vendor-run Department uses the vendor. */
export function workforceOperatorKey(
  fact: WorkforceOperatorFact | undefined,
  facilityOrganizationId: string,
): string {
  if (!fact || fact.operatingModel !== "CONTRACTED" || !fact.operatorOrganizationId) {
    return `facility:${facilityOrganizationId}`;
  }
  return `vendor:${fact.operatorOrganizationId}`;
}

export function workforceRecordMustSplit(keys: readonly string[]): boolean {
  return new Set(keys).size > 1;
}

/**
 * Refuses a membership that would put one Employee in Departments run by different operators.
 * Does nothing while enforcement is off, or when every Department has the same operator.
 */
export async function assertOneOperatorWorkforce(
  db: Db,
  input: { facilityId: string; departmentIds: readonly string[] },
): Promise<void> {
  if (!isContractedDepartmentAuthorityEnabled()) return;
  const departmentIds = [...new Set(input.departmentIds.filter(Boolean))];
  if (departmentIds.length < 2) return;

  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { organizationId: true },
  });
  if (!facility) return;

  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds,
  });
  const keys = departmentIds.map((departmentId) => {
    const current = operators.get(departmentId);
    return workforceOperatorKey(
      current
        ? {
            operatingModel: current.operatingModel,
            operatorOrganizationId: current.relationship.organizationId,
          }
        : undefined,
      facility.organizationId,
    );
  });
  if (workforceRecordMustSplit(keys)) {
    throw new Error(WORKFORCE_SPLIT_REASON);
  }
}
