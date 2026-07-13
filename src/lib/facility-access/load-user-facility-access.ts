import type { PrismaClient } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import { listActiveFacilityAccesses } from "./assert-user-facility-access";
import type { AccessibleFacility, FacilityAccessContext } from "./types";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export async function loadFacilityAccessContext(
  input: {
    userId: string;
    activeFacilityId: string;
    role: AppRole;
  },
  db: DbClient = prisma,
): Promise<FacilityAccessContext | null> {
  const [activeFacility, accesses] = await Promise.all([
    db.facility.findUnique({
      where: { id: input.activeFacilityId },
      select: {
        id: true,
        displayName: true,
        organizationId: true,
        organization: { select: { id: true, name: true, displayName: true } },
      },
    }),
    listActiveFacilityAccesses(db, input.userId),
  ]);

  if (!activeFacility) return null;

  const hasActive = accesses.some((a) => a.facilityId === input.activeFacilityId);
  if (!hasActive) return null;

  const accessibleFacilities: AccessibleFacility[] = accesses.map((row) => ({
    facilityId: row.facility.id,
    facilityName: row.facility.displayName,
    organizationId: row.facility.organizationId,
    organizationName:
      row.facility.organization.displayName?.trim() || row.facility.organization.name,
    role: input.role,
  }));

  return {
    organizationId: activeFacility.organizationId,
    organizationName:
      activeFacility.organization.displayName?.trim() || activeFacility.organization.name,
    activeFacilityId: activeFacility.id,
    activeFacilityName: activeFacility.displayName,
    accessibleFacilities,
  };
}
