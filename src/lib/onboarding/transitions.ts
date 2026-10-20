import { Prisma, type PrismaClient } from "@prisma/client";
import type { OnboardingStep } from "@/lib/onboarding";

/** Journey metadata only. Neither payment nor a license/install/Run authorization. */
export function initialFacilityOnboarding(now: Date) {
  return { onboardingStartedAt: now, onboardingCurrentStep: "facility" };
}

export type FacilityOnboardingTransition = {
  facilityId: string;
  step?: OnboardingStep;
  finish?: boolean;
  facilityName?: string;
  managementCompanyName?: string;
  billingEmail?: string;
  timezone?: string;
  confirmEntry?: boolean;
};

/** Caller owns the transaction; the Facility lock serializes all journey writers.
 * Explicit finish is an acknowledgement, including for a Facility with no Departments.
 * Historical completion/start timestamps survive retries and subsequent progress writes.
 */
export async function transitionFacilityOnboarding(
  tx: Prisma.TransactionClient,
  input: FacilityOnboardingTransition,
) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${input.facilityId} FOR UPDATE`);
  const current = await tx.facility.findUniqueOrThrow({
    where: { id: input.facilityId },
    select: { onboardingStartedAt: true, onboardingCompletedAt: true, onboardingEntryConfirmedAt: true },
  });
  const now = new Date();
  const finish = input.finish === true || input.step === "complete";
  return tx.facility.update({
    where: { id: input.facilityId },
    data: {
      displayName: input.facilityName,
      timezone: input.timezone,
      onboardingEntryConfirmedAt: input.confirmEntry ? current.onboardingEntryConfirmedAt ?? now : undefined,
      managementCompanyName: input.managementCompanyName === undefined
        ? undefined : input.managementCompanyName.trim() || null,
      billingEmail: input.billingEmail?.toLowerCase(),
      onboardingStartedAt: current.onboardingStartedAt ?? now,
      onboardingCompletedAt: finish ? current.onboardingCompletedAt ?? now : undefined,
      onboardingCurrentStep: current.onboardingCompletedAt || finish ? "complete" : input.step,
    },
    select: {
      id: true, displayName: true, managementCompanyName: true, billingEmail: true,
      timezone: true, onboardingEntryConfirmedAt: true,
      onboardingCurrentStep: true, onboardingStartedAt: true, onboardingCompletedAt: true,
    },
  });
}

export function saveFacilityOnboarding(db: PrismaClient, input: FacilityOnboardingTransition) {
  return db.$transaction((tx) => transitionFacilityOnboarding(tx, input));
}
