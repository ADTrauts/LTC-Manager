import type { PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { loadFacilityDepartmentCatalog } from "@/lib/department-products/load-facility-catalog";
import { resolveFacilityClassification } from "@/lib/facility-classification";
import { onboardingCommercialStatus } from "./status";
import { listSetupManagerInvitations } from "./manager-invitations";

export async function loadSetupWorkspace(db: PrismaClient, session: FacilitySession) {
  const facility = await db.facility.findUniqueOrThrow({
    where: { id: session.facilityId },
    select: {
      id: true, displayName: true, billingEmail: true, timezone: true, vocabularyProfile: true,
      onboardingCurrentStep: true, onboardingCompletedAt: true, onboardingStartedAt: true, onboardingEntryConfirmedAt: true,
      organization: { select: { name: true, displayName: true, organizationType: true } },
    },
  });
  const [catalog, billing, managerInvites, locations, rooms, firstUnit, firstRoom] = await Promise.all([
    loadFacilityDepartmentCatalog(db, session.facilityId),
    db.facilityBilling.findUnique({ where: { facilityId: session.facilityId }, select: { status: true } }),
    listSetupManagerInvitations(db, session.facilityId),
    db.unit.count({ where: { facilityId: session.facilityId, isActive: true } }),
    db.unitSpace.count({ where: { facilityId: session.facilityId, isActive: true } }),
    db.unit.findFirst({ where: { facilityId: session.facilityId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.unitSpace.findFirst({ where: { facilityId: session.facilityId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const firstConfigurationAt = [firstUnit?.createdAt, firstRoom?.createdAt].filter((x): x is Date => Boolean(x)).sort((a,b) => +a-+b)[0] ?? null;
  return {
    facility, administrator: { id: session.uid, name: session.name, email: session.email },
    classification: resolveFacilityClassification({ organizationType: facility.organization.organizationType, vocabularyProfile: facility.vocabularyProfile }),
    managerInvites, catalog, billingStatus: billing?.status ?? "UNMANAGED",
    commercialStatus: onboardingCommercialStatus({ billingStatus: billing?.status ?? null, catalog }),
    structure: { locations, rooms, firstConfigurationAt },
    stripeBillingReady: Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()),
  };
}
export type SetupWorkspace = Awaited<ReturnType<typeof loadSetupWorkspace>>;
