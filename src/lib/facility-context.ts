import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Matches migration seed id so seed and local DB stay aligned. */
export const SEED_FACILITY_ID = "cmfacseed0000000000000001";

/** Seed Organization for Terrace View (Wave 11). */
export const SEED_ORGANIZATION_ID = "cmorgseed0000000000000001";

export async function requireFacilitySession() {
  const session = await getSession();
  if (!session?.facilityId) {
    throw new Error("Unauthorized.");
  }
  return session;
}

export async function getFacilityForSession() {
  const session = await getSession();
  if (!session?.facilityId) return null;
  return prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      id: true,
      displayName: true,
      managementCompanyName: true,
      brandColor: true,
      timezone: true,
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
      unionHandbookPdfPath: true,
      unionHandbookOriginalFilename: true,
      unionHandbookUploadedAt: true,
      unionHandbookEffectiveDate: true,
    },
  });
}
