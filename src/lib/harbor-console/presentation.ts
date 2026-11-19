import type { FacilityBillingStatus } from "@prisma/client";
import type { ImplementationWorkFilter } from "@/lib/implementation/work-queue";

export type HarborSetupFilter = "awaiting" | "acknowledged";

/** Elapsed age, not a delivery SLA or a claim that an attempt is overdue. */
export function elapsedAgeLabel(since: Date, at: Date): string {
  const milliseconds = at.getTime() - since.getTime();
  if (milliseconds < 0) return "Recorded timestamp is ahead of this snapshot";
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return "Less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} days ${hours % 24} hr`;
}

export function harborCustomersHref({ query, work, setup, page = 1 }: {
  query?: string;
  work?: ImplementationWorkFilter | null;
  setup?: HarborSetupFilter | null;
  page?: number;
} = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (work) params.set("work", work);
  if (setup) params.set("setup", setup);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/console/customers?${search}` : "/console/customers";
}

export const PAYMENT_PROBLEM_STATUSES: FacilityBillingStatus[] = ["PAST_DUE", "INCOMPLETE", "UNPAID", "PAUSED"];

export function isPaymentProblem(status: FacilityBillingStatus | null | undefined): boolean {
  return status != null && PAYMENT_PROBLEM_STATUSES.includes(status);
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
      return "Food and Nutrition";
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
