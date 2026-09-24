import type { BillingCatalogOffering, BillingInterval, StripePriceIdEnv } from "./catalog";

const RECURRING_PRICE_ENV: Record<
  Extract<BillingCatalogOffering, "FACILITY" | "ADDITIONAL_DEPARTMENT" | "WHOLE_FACILITY">,
  Record<BillingInterval, keyof StripePriceIdEnv>
> = {
  FACILITY: {
    MONTHLY: "STRIPE_PRICE_FACILITY_MONTHLY",
    ANNUAL: "STRIPE_PRICE_FACILITY_ANNUAL",
  },
  ADDITIONAL_DEPARTMENT: {
    MONTHLY: "STRIPE_PRICE_ADDITIONAL_DEPT_MONTHLY",
    ANNUAL: "STRIPE_PRICE_ADDITIONAL_DEPT_ANNUAL",
  },
  WHOLE_FACILITY: {
    MONTHLY: "STRIPE_PRICE_WHOLE_FACILITY_MONTHLY",
    ANNUAL: "STRIPE_PRICE_WHOLE_FACILITY_ANNUAL",
  },
};

const SETUP_PRICE_ENV: Record<
  Extract<BillingCatalogOffering, "SETUP_FIRST" | "SETUP_ADDITIONAL">,
  keyof StripePriceIdEnv
> = {
  SETUP_FIRST: "STRIPE_PRICE_SETUP_FIRST_DEPT",
  SETUP_ADDITIONAL: "STRIPE_PRICE_SETUP_ADDITIONAL_DEPT",
};

export function stripePriceIdForOffering(
  offering: BillingCatalogOffering,
  interval: BillingInterval | undefined,
  environment: StripePriceIdEnv = process.env as StripePriceIdEnv,
): string | null {
  if (offering === "SETUP_FIRST" || offering === "SETUP_ADDITIONAL") {
    return emptyToNull(environment[SETUP_PRICE_ENV[offering]]);
  }
  if (!interval) {
    return null;
  }
  return emptyToNull(environment[RECURRING_PRICE_ENV[offering][interval]]);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const STRIPE_PRICE_ENV_KEYS: readonly (keyof StripePriceIdEnv)[] = [
  "STRIPE_PRICE_FACILITY_MONTHLY",
  "STRIPE_PRICE_FACILITY_ANNUAL",
  "STRIPE_PRICE_ADDITIONAL_DEPT_MONTHLY",
  "STRIPE_PRICE_ADDITIONAL_DEPT_ANNUAL",
  "STRIPE_PRICE_WHOLE_FACILITY_MONTHLY",
  "STRIPE_PRICE_WHOLE_FACILITY_ANNUAL",
  "STRIPE_PRICE_SETUP_FIRST_DEPT",
  "STRIPE_PRICE_SETUP_ADDITIONAL_DEPT",
];

export function areAllCatalogPricesConfigured(
  environment: StripePriceIdEnv = process.env as StripePriceIdEnv,
): boolean {
  return STRIPE_PRICE_ENV_KEYS.every((key) => Boolean(environment[key]?.trim()));
}

const RECURRING_OFFERINGS = ["FACILITY", "ADDITIONAL_DEPARTMENT", "WHOLE_FACILITY"] as const;
const RECURRING_INTERVALS = ["MONTHLY", "ANNUAL"] as const;

export function catalogRecurringPriceIds(
  environment: StripePriceIdEnv = process.env as StripePriceIdEnv,
): Set<string> {
  const ids = new Set<string>();
  for (const offering of RECURRING_OFFERINGS) {
    for (const interval of RECURRING_INTERVALS) {
      const priceId = stripePriceIdForOffering(offering, interval, environment);
      if (priceId) ids.add(priceId);
    }
  }
  return ids;
}
