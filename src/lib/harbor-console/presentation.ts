import type { FacilityBillingStatus } from "@prisma/client";

export function isStuckSetup(onboardingCompletedAt: Date | null | undefined): boolean {
  return onboardingCompletedAt == null;
}

export function isPaymentProblem(status: FacilityBillingStatus | null | undefined): boolean {
  return status === "PAST_DUE" || status === "INCOMPLETE";
}

export function billingStatusLabel(status: FacilityBillingStatus | null | undefined): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "PAST_DUE":
      return "Past due";
    case "INCOMPLETE":
      return "Incomplete";
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
      return "Dietary";
    case "EVS":
      return "EVS";
    case "PLANT":
      return "Plant";
    default:
      return key;
  }
}

export function onboardingLabel(input: {
  onboardingCompletedAt: Date | null;
  onboardingCurrentStep: string | null;
}): string {
  if (input.onboardingCompletedAt) {
    return "Live";
  }
  const step = input.onboardingCurrentStep?.trim();
  return step ? `Setup: ${step}` : "Setup not started";
}
