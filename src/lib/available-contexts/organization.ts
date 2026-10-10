import type { Prisma, PrismaClient } from "@prisma/client";

import {
  listCurrentOrganizationMembershipsForUser,
  organizationDisplayLabel,
} from "@/lib/organization-membership";

import { organizationContextKey } from "./keys";
import type { AvailableContextRecord } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function listOrganizationContexts(
  db: DbClient,
  input: { userId: string; now?: Date },
): Promise<AvailableContextRecord[]> {
  const memberships = await listCurrentOrganizationMembershipsForUser(db, {
    userId: input.userId,
    now: input.now,
  });

  return memberships.flatMap((membership) => {
    if (!membership.currentRole) return [];
    return [
      {
        context: {
          kind: "organization",
          contextKey: organizationContextKey(membership.organizationId),
          organizationId: membership.organizationId,
          membershipId: membership.id,
          organizationRole: membership.currentRole,
        },
        organizationName: organizationDisplayLabel(membership.organization),
        facilityName: null,
        partnerOrganizationName: null,
        departmentNames: [],
      },
    ];
  });
}
