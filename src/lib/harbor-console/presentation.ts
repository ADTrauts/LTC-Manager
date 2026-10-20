import type { FacilityBillingStatus } from "@prisma/client";

export function isStuckSetup(onboardingCompletedAt: Date | null | undefined): boolean {
  return onboardingCompletedAt == null;
}

export function isPaymentProblem(status: FacilityBillingStatus | null | undefined): boolean {
  return status === "PAST_DUE" || status === "INCOMPLETE" || status === "UNPAID" || status === "PAUSED";
}

export function billingStatusLabel(status: FacilityBillingStatus | null | undefined): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "PAST_DUE":
      return "Past due";
    case "INCOMPLETE":
      return "Incomplete";
    case "UNPAID": return "Unpaid — operation suspended";
    case "PAUSED": return "Paused — operation suspended";
    case "CANCELED":
      return "Canceled";
    case "UNMANAGED":
      return "Unmanaged";
    default:
      return "No billing record";
  }
}

export function setupPathLabel(path: "SELF_SERVE" | "ASSISTED" | null | undefined): string {
  return path === "ASSISTED" ? "Assisted" : path === "SELF_SERVE" ? "Self-serve" : "—";
}

export function departmentKeyLabel(key: string): string {
  switch (key) {
    case "DIETARY":
    case "HEALTHCARE_FOOD_NUTRITION":
      return "Healthcare Food & Nutrition";
    case "EVS":
      return "Environmental Services";
    case "PLANT":
      return "Facility Plant Operations";
    default:
      return key;
  }
}

export function onboardingLabel(input: {
  onboardingCompletedAt: Date | null;
  onboardingCurrentStep: string | null;
}): string {
  if (input.onboardingCompletedAt) {
    return "Guided setup acknowledged";
  }
  const step = input.onboardingCurrentStep?.trim();
  return step ? `Setup: ${step}` : "Setup not started";
}
