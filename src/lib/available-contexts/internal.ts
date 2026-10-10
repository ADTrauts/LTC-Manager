import type { Prisma, PrismaClient } from "@prisma/client";

import { listCurrentInternalFacilityRoles } from "@/lib/facility-access/internal-facility-role";
import { organizationDisplayLabel } from "@/lib/organization-membership";

import { internalFacilityContextKey } from "./keys";
import type { AvailableContextRecord } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Internal Facility contexts from current Path A grants + role periods.
 * Owner Organization inactivity is checked here (`Facility.organization.isActive`),
 * matching Organization membership's refusal to surface inactive Organizations.
 */
export async function listInternalFacilityContexts(
  db: DbClient,
  input: { userId: string; homeFacilityId: string | null; now?: Date },
): Promise<AvailableContextRecord[]> {
  const roles = await listCurrentInternalFacilityRoles(db, {
    userId: input.userId,
    instant: input.now,
  });
  if (roles.length === 0) return [];

  const facilities = await db.facility.findMany({
    where: { id: { in: roles.map((row) => row.facilityId) } },
    select: {
      id: true,
      displayName: true,
      organizationId: true,
      organization: { select: { id: true, name: true, displayName: true, isActive: true } },
    },
  });
  const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));

  return roles.flatMap((row) => {
    const facility = facilityById.get(row.facilityId);
    if (!facility) return [];
    if (!facility.organization.isActive) return [];
    return [
      {
        context: {
          kind: "facility_internal",
          contextKey: internalFacilityContextKey(row.facilityId),
          facilityId: row.facilityId,
          organizationId: facility.organizationId,
          accessId: row.accessId,
          role: row.roleKey,
          isHome: input.homeFacilityId === row.facilityId,
        },
        organizationName: organizationDisplayLabel(facility.organization),
        facilityName: facility.displayName,
        partnerOrganizationName: null,
        departmentNames: [],
      },
    ];
  });
}
