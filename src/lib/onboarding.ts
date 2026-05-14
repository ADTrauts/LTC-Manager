import type { Facility } from "@prisma/client";

export const ONBOARDING_STEPS = ["facility", "managers", "locations", "billing", "complete"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_ENTRY_PATH = "/setup";

export function isOnboardingComplete(facility: Pick<Facility, "onboardingCompletedAt">): boolean {
  return Boolean(facility.onboardingCompletedAt);
}

export function normalizeOnboardingStep(step: string | null | undefined): OnboardingStep {
  if (!step) {
    return "facility";
  }
  if ((ONBOARDING_STEPS as readonly string[]).includes(step)) {
    return step as OnboardingStep;
  }
  return "facility";
}

export function nextOnboardingStep(currentStep: OnboardingStep): OnboardingStep {
  const idx = ONBOARDING_STEPS.indexOf(currentStep);
  if (idx < 0 || idx >= ONBOARDING_STEPS.length - 1) {
    return "complete";
  }
  return ONBOARDING_STEPS[idx + 1];
}
