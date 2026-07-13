import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { OrganizationFacilitySummary } from "./types";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Administrative facility summary for the active Organization.
 * Lists org facilities, but marks which ones the viewer may switch into.
 * Does not include readiness drill-down, employee names, issues, or AI.
 */
export async function loadOrganizationFacilitySummaries(
  input: {
    organizationId: string;
    viewerUserId: string;
  },
  db: DbClient = prisma,
): Promise<OrganizationFacilitySummary[]> {
  const facilities = await db.facility.findMany({
    where: { organizationId: input.organizationId },
    select: {
      id: true,
      displayName: true,
      organizationId: true,
      timezone: true,
      onboardingCompletedAt: true,
      onboardingCurrentStep: true,
      organization: { select: { name: true, displayName: true } },
      _count: {
        select: {
          userFacilityAccesses: { where: { isActive: true, revokedAt: null } },
        },
      },
    },
    orderBy: { displayName: "asc" },
  });

  const viewerGrants = await db.userFacilityAccess.findMany({
    where: {
      userId: input.viewerUserId,
      isActive: true,
      revokedAt: null,
      facilityId: { in: facilities.map((f) => f.id) },
    },
    select: { facilityId: true },
  });
  const viewerSet = new Set(viewerGrants.map((g) => g.facilityId));

  return facilities.map((f) => ({
    facilityId: f.id,
    facilityName: f.displayName,
    organizationId: f.organizationId,
    organizationName: f.organization.displayName?.trim() || f.organization.name,
    timezone: f.timezone,
    onboardingCompleted: Boolean(f.onboardingCompletedAt),
    onboardingCurrentStep: f.onboardingCurrentStep,
    activeAccessCount: f._count.userFacilityAccesses,
    viewerHasAccess: viewerSet.has(f.id),
  }));
}
