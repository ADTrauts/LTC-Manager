import type { OrganizationType, PrismaClient } from "@prisma/client";

import { resolveOrganizationCreateName } from "./types";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Create an Organization for a new Facility (signup / seed / provision).
 * Does not mutate managementCompanyName dual-write behavior.
 */
export async function createOrganizationForNewFacility(
  db: DbClient,
  input: {
    facilityName: string;
    managementCompanyName?: string | null;
    organizationType?: OrganizationType | null;
  },
): Promise<{ id: string; name: string }> {
  const resolved = resolveOrganizationCreateName({
    facilityName: input.facilityName,
    managementCompanyName: input.managementCompanyName,
  });

  const organization = await db.organization.create({
    data: {
      name: resolved.name,
      displayName: resolved.name,
      organizationType: input.organizationType ?? resolved.organizationType,
      isActive: true,
    },
    select: { id: true, name: true },
  });

  return organization;
}
