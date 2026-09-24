import type { BillingInterval, BillingSetupPath } from "./catalog";
import type { FacilityBillingStatus } from "./entitlement";

export function checkoutSelectionFromMetadata(metadata: {
  facilityId?: string | null;
  departmentKeys?: string | null;
  interval?: string | null;
  setupPath?: string | null;
}): {
  facilityId: string | null;
  departmentKeys: string[];
  interval: BillingInterval;
  setupPath: BillingSetupPath;
} {
  return {
    facilityId: metadata.facilityId?.trim() || null,
    departmentKeys: parseCheckoutDepartmentKeys(metadata.departmentKeys),
    interval: metadata.interval === "MONTHLY" ? "MONTHLY" : "ANNUAL",
    setupPath: metadata.setupPath === "ASSISTED" ? "ASSISTED" : "SELF_SERVE",
  };
}

export function parseCheckoutDepartmentKeys(value: string | undefined | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((part) => part.trim()).filter(Boolean))];
}

export function billingStatusFromStripeSubscription(
  status: string | undefined | null,
): FacilityBillingStatus | null {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
    case "paused":
      return "PAST_DUE";
    case "incomplete":
      return "INCOMPLETE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return null;
  }
}

export function subscriptionIdFromStripeInvoice(invoice: {
  subscription?: string | { id: string } | null;
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null } | null;
  } | null;
}): string | null {
  const direct = idFromExpandable(invoice.subscription);
  if (direct) return direct;
  return idFromExpandable(invoice.parent?.subscription_details?.subscription);
}

function idFromExpandable(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
