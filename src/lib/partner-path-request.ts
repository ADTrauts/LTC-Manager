import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { resolveFacilityAuthorization } from "@/lib/partner-user-access";

/** True when this call is the production Prisma client, so one request may share the result. */
export function usesRequestPartnerCache(client: unknown): boolean {
  return client === prisma;
}

/**
 * Live Path B for the production client. Memoized for the current server request.
 * Tests that pass a fake client must not use this.
 */
export const resolvePartnerAuthorizationForPrismaRequest = cache(
  async (userId: string, facilityId: string, facilityPartnerOrganizationId: string) =>
    resolveFacilityAuthorization(prisma, {
      userId,
      facilityId,
      accessKind: "partner",
      facilityPartnerOrganizationId,
    }),
);
