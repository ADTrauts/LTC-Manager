import {
  annualTotalCents,
  BILLING_LIST,
  type BillingInterval,
  type BillingSetupPath,
  type BillingSubscriptionOffering,
} from "./catalog";

export type BillingQuoteInput = {
  departmentCount: number;
  interval: BillingInterval;
  setupPath: BillingSetupPath;
};

export type BillingQuote = {
  departmentCount: number;
  interval: BillingInterval;
  setupPath: BillingSetupPath;
  listedMonthlyCents: number;
  billedRecurringCents: number;
  atFacilityCeiling: boolean;
  offering: BillingSubscriptionOffering;
  additionalDepartmentQuantity: number;
  setupFeeCents: number;
};

export function listedMonthlyCentsForDepartments(departmentCount: number): number {
  if (!Number.isInteger(departmentCount) || departmentCount < 0) {
    throw new Error("departmentCount must be a non-negative integer.");
  }
  if (departmentCount === 0) {
    return 0;
  }
  const uncapped =
    BILLING_LIST.firstDepartmentMonthlyCents +
    BILLING_LIST.additionalDepartmentMonthlyCents * (departmentCount - 1);
  return Math.min(uncapped, BILLING_LIST.facilityCeilingMonthlyCents);
}

export function setupFeeCents(setupPath: BillingSetupPath, departmentCount: number): number {
  if (setupPath === "SELF_SERVE" || departmentCount === 0) {
    return 0;
  }
  return (
    BILLING_LIST.setupFirstDepartmentCents +
    BILLING_LIST.setupAdditionalDepartmentCents * Math.max(0, departmentCount - 1)
  );
}

export function quoteBilling(input: BillingQuoteInput): BillingQuote {
  const listedMonthlyCents = listedMonthlyCentsForDepartments(input.departmentCount);
  const atFacilityCeiling =
    input.departmentCount > 0 && listedMonthlyCents === BILLING_LIST.facilityCeilingMonthlyCents;
  const offering: BillingSubscriptionOffering = atFacilityCeiling
    ? "WHOLE_FACILITY"
    : "FACILITY_PLUS_ADDONS";
  const additionalDepartmentQuantity =
    offering === "FACILITY_PLUS_ADDONS" && input.departmentCount > 0
      ? input.departmentCount - 1
      : 0;
  const billedRecurringCents =
    input.interval === "MONTHLY" ? listedMonthlyCents : annualTotalCents(listedMonthlyCents);

  return {
    departmentCount: input.departmentCount,
    interval: input.interval,
    setupPath: input.setupPath,
    listedMonthlyCents,
    billedRecurringCents,
    atFacilityCeiling,
    offering,
    additionalDepartmentQuantity,
    setupFeeCents: setupFeeCents(input.setupPath, input.departmentCount),
  };
}
