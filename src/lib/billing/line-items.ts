import type { BillingCatalogOffering, BillingInterval } from "./catalog";
import { BILLING_LIST, annualTotalCents } from "./catalog";
import type { BillingQuote } from "./quote";

export type BillingCatalogLineItem = {
  offering: BillingCatalogOffering;
  /** Recurring interval; omitted for one-time setup fees. */
  interval?: BillingInterval;
  quantity: number;
  unitAmountCents: number;
};

export function catalogLineItemsForQuote(quote: BillingQuote): BillingCatalogLineItem[] {
  const items: BillingCatalogLineItem[] = [];
  if (quote.departmentCount === 0) {
    return items;
  }

  if (quote.offering === "WHOLE_FACILITY") {
    items.push({
      offering: "WHOLE_FACILITY",
      interval: quote.interval,
      quantity: 1,
      unitAmountCents: recurringUnitAmount(quote.interval, BILLING_LIST.facilityCeilingMonthlyCents),
    });
  } else {
    items.push({
      offering: "FACILITY",
      interval: quote.interval,
      quantity: 1,
      unitAmountCents: recurringUnitAmount(quote.interval, BILLING_LIST.firstDepartmentMonthlyCents),
    });
    if (quote.additionalDepartmentQuantity > 0) {
      items.push({
        offering: "ADDITIONAL_DEPARTMENT",
        interval: quote.interval,
        quantity: quote.additionalDepartmentQuantity,
        unitAmountCents: recurringUnitAmount(
          quote.interval,
          BILLING_LIST.additionalDepartmentMonthlyCents,
        ),
      });
    }
  }

  if (quote.setupFeeCents > 0) {
    items.push({
      offering: "SETUP_FIRST",
      quantity: 1,
      unitAmountCents: BILLING_LIST.setupFirstDepartmentCents,
    });
    const additionalSetup = Math.max(0, quote.departmentCount - 1);
    if (additionalSetup > 0) {
      items.push({
        offering: "SETUP_ADDITIONAL",
        quantity: additionalSetup,
        unitAmountCents: BILLING_LIST.setupAdditionalDepartmentCents,
      });
    }
  }

  return items;
}

function recurringUnitAmount(interval: BillingInterval, listMonthlyCents: number): number {
  return interval === "MONTHLY" ? listMonthlyCents : annualTotalCents(listMonthlyCents);
}
