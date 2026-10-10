import type { Prisma, PrismaClient } from "@prisma/client";

import { listAuthorizedPartnerFacilitiesForUser } from "@/lib/partner-user-access";

import { partnerFacilityContextKey } from "./keys";
import type { AvailableContextRecord } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * User-global partner contexts. Eligibility is live Path B — this does not
 * invent a second partner engine or filter by a source Organization session.
 */
export async function listPartnerFacilityContexts(
  db: DbClient,
  input: { userId: string; now?: Date },
): Promise<AvailableContextRecord[]> {
  const rows = await listAuthorizedPartnerFacilitiesForUser(db, {
    userId: input.userId,
    now: input.now,
  });

  return rows.map((row) => ({
    context: {
      kind: "facility_partner",
      contextKey: partnerFacilityContextKey(row.facilityPartnerOrganizationId),
      facilityId: row.facilityId,
      partnerOrganizationId: row.partnerOrganizationId,
      facilityPartnerOrganizationId: row.facilityPartnerOrganizationId,
      effectivePartnerRole: row.effectiveRole,
      allowedDepartmentIds: row.allowedDepartmentIds,
    },
    organizationName: row.partnerOrganizationName,
    facilityName: row.facilityDisplayName,
    partnerOrganizationName: row.partnerOrganizationName,
    departmentNames: row.departmentNames,
  }));
}
