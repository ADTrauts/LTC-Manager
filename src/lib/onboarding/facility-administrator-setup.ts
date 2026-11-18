import type { Prisma } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import { isOnboardingComplete } from "@/lib/onboarding";

/** Call with a resolved internal Facility context or a validated Facility session. */
export async function canContinueFacilityAdministratorSetup(
  db: Pick<Prisma.TransactionClient, "facility">,
  context: { facilityId?: string; role?: AppRole },
): Promise<boolean> {
  if (context.role !== "FACILITY_ADMINISTRATOR" || !context.facilityId) return false;

  try {
    const facility = await db.facility.findFirst({
      where: { id: context.facilityId, organization: { isActive: true } },
      select: { onboardingCompletedAt: true },
    });
    return facility !== null && !isOnboardingComplete(facility);
  } catch {
    // The invite may already be consumed. Keep the resolved destination when setup status is unavailable.
    return false;
  }
}
