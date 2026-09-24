export const BILLING_CURRENCY = "usd" as const;

/** Working list prices in cents. Validated with the first paying facilities. */
export const BILLING_LIST = {
  firstDepartmentMonthlyCents: 29_900,
  additionalDepartmentMonthlyCents: 14_900,
  facilityCeilingMonthlyCents: 99_900,
  setupFirstDepartmentCents: 150_000,
  setupAdditionalDepartmentCents: 50_000,
} as const;

/** Annual prepaid is 10% off 12 × monthly list. */
export const ANNUAL_DISCOUNT_BPS = 1_000;

export const BILLING_STRIPE_PRODUCTS = {
  FACILITY: "LTC Manager — Facility",
  ADDITIONAL_DEPARTMENT: "LTC Manager — Additional department",
  WHOLE_FACILITY: "LTC Manager — Whole facility",
  SETUP_FIRST: "LTC Manager — Assisted setup (first department)",
  SETUP_ADDITIONAL: "LTC Manager — Assisted setup (additional department)",
} as const;

/** Stable Stripe Price lookup keys (test catalog on acct_1UGiNyI0d1L6Rh8X). */
export const BILLING_STRIPE_LOOKUP_KEYS = {
  FACILITY_MONTHLY: "ltc_facility_monthly",
  FACILITY_ANNUAL: "ltc_facility_annual",
  ADDITIONAL_DEPT_MONTHLY: "ltc_additional_dept_monthly",
  ADDITIONAL_DEPT_ANNUAL: "ltc_additional_dept_annual",
  WHOLE_FACILITY_MONTHLY: "ltc_whole_facility_monthly",
  WHOLE_FACILITY_ANNUAL: "ltc_whole_facility_annual",
  SETUP_FIRST: "ltc_setup_first",
  SETUP_ADDITIONAL: "ltc_setup_additional",
} as const;

export type BillingInterval = "MONTHLY" | "ANNUAL";
export type BillingSetupPath = "SELF_SERVE" | "ASSISTED";
export type BillingSubscriptionOffering = "FACILITY_PLUS_ADDONS" | "WHOLE_FACILITY";

export type BillingCatalogOffering =
  | "FACILITY"
  | "ADDITIONAL_DEPARTMENT"
  | "WHOLE_FACILITY"
  | "SETUP_FIRST"
  | "SETUP_ADDITIONAL";

export type StripePriceIdEnv = {
  STRIPE_PRICE_FACILITY_MONTHLY?: string;
  STRIPE_PRICE_FACILITY_ANNUAL?: string;
  STRIPE_PRICE_ADDITIONAL_DEPT_MONTHLY?: string;
  STRIPE_PRICE_ADDITIONAL_DEPT_ANNUAL?: string;
  STRIPE_PRICE_WHOLE_FACILITY_MONTHLY?: string;
  STRIPE_PRICE_WHOLE_FACILITY_ANNUAL?: string;
  STRIPE_PRICE_SETUP_FIRST_DEPT?: string;
  STRIPE_PRICE_SETUP_ADDITIONAL_DEPT?: string;
};

export function annualTotalCents(listMonthlyCents: number): number {
  return Math.round((listMonthlyCents * 12 * (10_000 - ANNUAL_DISCOUNT_BPS)) / 10_000);
}
