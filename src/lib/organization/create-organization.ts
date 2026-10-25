import type { OrganizationType, PrismaClient } from "@prisma/client";

import { resolveOrganizationCreateName } from "./types";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Create the parent Organization for a new Facility (signup / seed / provision).
 * Parent Organization is hierarchy ownership — not contracted department operation.
 * A company name may choose the parent Organization. It is not stored on the Facility.
 */
export async function createOrganizationForNewFacility(
  db: DbClient,
  input: {
    facilityName: string;
    managementCompanyName?: string | null;
    organizationType?: OrganizationType | null;
    organizationName?: string | null;
  },
): Promise<{ id: string; name: string }> {
  const resolved = resolveOrganizationCreateName({
    facilityName: input.facilityName,
    managementCompanyName: input.managementCompanyName,
  });
  const name = input.organizationName?.trim() || resolved.name;

  const organization = await db.organization.create({
    data: {
      name,
      displayName: name,
      organizationType: input.organizationType ?? resolved.organizationType,
      isActive: true,
    },
    select: { id: true, name: true },
  });

  return organization;
}
