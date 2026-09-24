import type { BillingCatalogOffering, StripePriceIdEnv } from "./catalog";
import { catalogLineItemsForQuote, type BillingCatalogLineItem } from "./line-items";
import type { BillingQuote } from "./quote";
import { stripePriceIdForOffering } from "./stripe-prices";

export type StripeCheckoutLineItem = {
  price: string;
  quantity: number;
};

export class MissingStripePriceError extends Error {
  readonly offering: BillingCatalogOffering;
  readonly interval: BillingCatalogLineItem["interval"];

  constructor(offering: BillingCatalogOffering, interval: BillingCatalogLineItem["interval"]) {
    super(
      interval
        ? `Missing Stripe Price ID for ${offering} (${interval}).`
        : `Missing Stripe Price ID for ${offering}.`,
    );
    this.name = "MissingStripePriceError";
    this.offering = offering;
    this.interval = interval;
  }
}

export function stripeCheckoutLineItemsForQuote(
  quote: BillingQuote,
  environment: StripePriceIdEnv = process.env as StripePriceIdEnv,
): StripeCheckoutLineItem[] {
  return lineItemsToStripePrices(catalogLineItemsForQuote(quote), environment);
}

/** Recurring catalog lines only — used when changing an existing subscription. */
export function stripeRecurringLineItemsForQuote(
  quote: BillingQuote,
  environment: StripePriceIdEnv = process.env as StripePriceIdEnv,
): StripeCheckoutLineItem[] {
  return lineItemsToStripePrices(
    catalogLineItemsForQuote(quote).filter((item) => item.interval),
    environment,
  );
}

function lineItemsToStripePrices(
  items: BillingCatalogLineItem[],
  environment: StripePriceIdEnv,
): StripeCheckoutLineItem[] {
  return items.map((item) => {
    const price = stripePriceIdForOffering(item.offering, item.interval, environment);
    if (!price) {
      throw new MissingStripePriceError(item.offering, item.interval);
    }
    return { price, quantity: item.quantity };
  });
}

export function areStripePricesConfiguredForQuote(
  quote: BillingQuote,
  environment: StripePriceIdEnv = process.env as StripePriceIdEnv,
): boolean {
  try {
    stripeCheckoutLineItemsForQuote(quote, environment);
    return true;
  } catch (error) {
    if (error instanceof MissingStripePriceError) {
      return false;
    }
    throw error;
  }
}
