import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { OrganizationContext } from "./types";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Derive Organization context through the session facility.
 * Facility remains the authoritative scope — this never grants sibling-facility access.
 */
export async function loadOrganizationContext(
  facilityId: string,
  db: DbClient = prisma,
): Promise<OrganizationContext> {
  if (!facilityId?.trim()) {
    throw new Error("Facility id is required.");
  }

  const facility = await db.facility.findUnique({
    where: { id: facilityId },
    select: {
      id: true,
      displayName: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          legalName: true,
          displayName: true,
          organizationType: true,
          isActive: true,
        },
      },
    },
  });

  if (!facility) {
    throw new Error("Facility not found.");
  }

  if (!facility.organization) {
    throw new Error("Facility is missing an Organization relation.");
  }

  const org = facility.organization;
  return {
    organizationId: org.id,
    organizationName: org.displayName?.trim() || org.name,
    organizationLegalName: org.legalName,
    organizationDisplayName: org.displayName,
    organizationType: org.organizationType,
    facilityId: facility.id,
    facilityName: facility.displayName,
  };
}

export async function loadOrganizationContextForSessionFacility(
  facilityId: string | null | undefined,
  db: DbClient = prisma,
): Promise<OrganizationContext | null> {
  if (!facilityId) return null;
  try {
    return await loadOrganizationContext(facilityId, db);
  } catch {
    return null;
  }
}
