import type { PrismaClient } from "@prisma/client";

import { resolveFacilityTimezone } from "./resolve-facility-timezone";

export async function loadFacilityTimezone(
  prisma: Pick<PrismaClient, "facility">,
  facilityId: string,
): Promise<string> {
  const row = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { timezone: true },
  });
  return resolveFacilityTimezone(row?.timezone);
}
