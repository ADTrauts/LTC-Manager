import type Stripe from "stripe";

import { applyFacilitySubscription } from "./apply-stripe-event";
import { MissingStripePriceError, stripeRecurringLineItemsForQuote } from "./checkout-items";
import { quoteBilling } from "./quote";
import { parseCheckoutDepartmentKeys } from "./status";
import { catalogRecurringPriceIds } from "./stripe-prices";
import {
  mergeLicensedDepartmentKeys,
  subscriptionItemUpdates,
  type ExistingSubscriptionItem,
} from "./subscription-items";
import { prisma } from "@/lib/prisma";
import { getStripeServerClient } from "@/lib/stripe";
import { trackEvent } from "@/lib/telemetry";

export class BillingAddDepartmentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingAddDepartmentsError";
  }
}

export async function addDepartmentsToFacilitySubscription(input: {
  facilityId: string;
  departmentKeysToAdd: readonly string[];
}): Promise<void> {
  const keysToAdd = [...new Set(input.departmentKeysToAdd.map((key) => key.trim()).filter(Boolean))];
  if (keysToAdd.length === 0) {
    throw new BillingAddDepartmentsError("Select at least one department to add.");
  }

  const facility = await prisma.facility.findUnique({
    where: { id: input.facilityId },
    select: {
      id: true,
      billing: {
        select: {
          status: true,
          interval: true,
          setupPath: true,
          stripeSubscriptionId: true,
          entitlements: {
            where: { status: "ACTIVE" },
            select: { departmentKey: true },
          },
        },
      },
      departments: { where: { isActive: true }, select: { key: true } },
    },
  });
  if (!facility?.billing?.stripeSubscriptionId) {
    throw new BillingAddDepartmentsError("This facility does not have a subscription to update.");
  }
  if (facility.billing.status !== "ACTIVE") {
    throw new BillingAddDepartmentsError(
      facility.billing.status === "PAST_DUE"
        ? "Update the card in Manage billing before adding departments."
        : "Start or finish checkout before adding departments.",
    );
  }

  const allowedKeys = new Set(facility.departments.map((department) => department.key));
  if (keysToAdd.some((key) => !allowedKeys.has(key))) {
    throw new BillingAddDepartmentsError("Select departments that belong to this facility.");
  }

  const stripe = getStripeServerClient();
  const subscription = await stripe.subscriptions.retrieve(facility.billing.stripeSubscriptionId);
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    throw new BillingAddDepartmentsError(
      subscription.status === "past_due"
        ? "Update the card in Manage billing before adding departments."
        : "This subscription cannot be changed right now.",
    );
  }

  const currentKeys =
    facility.billing.entitlements.map((row) => row.departmentKey).length > 0
      ? facility.billing.entitlements.map((row) => row.departmentKey)
      : parseCheckoutDepartmentKeys(subscription.metadata?.departmentKeys);
  if (currentKeys.length === 0) {
    throw new BillingAddDepartmentsError("Current plan departments are missing. Refresh this page and try again.");
  }

  const alreadyLicensed = new Set(currentKeys);
  if (keysToAdd.every((key) => alreadyLicensed.has(key))) {
    throw new BillingAddDepartmentsError("Those departments are already on this plan.");
  }

  const mergedKeys = mergeLicensedDepartmentKeys(currentKeys, keysToAdd);
  const interval = facility.billing.interval;
  const setupPath = facility.billing.setupPath;
  const quote = quoteBilling({
    departmentCount: mergedKeys.length,
    interval,
    setupPath: "SELF_SERVE",
  });

  let desired;
  try {
    desired = stripeRecurringLineItemsForQuote(quote);
  } catch (error) {
    if (error instanceof MissingStripePriceError) {
      throw new BillingAddDepartmentsError("Stripe prices are not configured for this plan yet.");
    }
    throw error;
  }

  const items = subscriptionItemUpdates(
    existingRecurringItems(subscription),
    desired,
    catalogRecurringPriceIds(),
  );

  try {
    await stripe.subscriptions.update(subscription.id, {
      ...(items.length > 0 ? { items } : {}),
      metadata: {
        ...subscription.metadata,
        facilityId: facility.id,
        departmentKeys: mergedKeys.join(","),
        interval,
        setupPath,
      },
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
    });
  } catch (error) {
    throw new BillingAddDepartmentsError(publicAddDepartmentsError(error));
  }

  await applyFacilitySubscription({
    facilityId: facility.id,
    status: "ACTIVE",
    interval,
    setupPath,
    stripeSubscriptionId: subscription.id,
    departmentKeys: mergedKeys,
  });

  await trackEvent("billing.departments.added", {
    facilityId: facility.id,
    stripeSubscriptionId: subscription.id,
    addedDepartmentKeys: keysToAdd.join(","),
    departmentCount: mergedKeys.length,
  });
}

function existingRecurringItems(subscription: Stripe.Subscription): ExistingSubscriptionItem[] {
  return subscription.items.data.flatMap((item) => {
    const price = item.price;
    if (!price?.id || price.type === "one_time") return [];
    return [{ id: item.id, priceId: price.id, quantity: item.quantity ?? 1 }];
  });
}

function publicAddDepartmentsError(error: unknown): string {
  if (error && typeof error === "object" && "type" in error && error.type === "card_error") {
    return "Card was declined. Update the card in Manage billing and try again.";
  }
  if (error instanceof Error && /incomplete|requires_payment_method|card/i.test(error.message)) {
    return "Card was declined. Update the card in Manage billing and try again.";
  }
  return "Unable to add departments. Try again.";
}
