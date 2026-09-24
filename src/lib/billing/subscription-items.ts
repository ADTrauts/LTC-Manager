import type { StripeCheckoutLineItem } from "./checkout-items";

export type ExistingSubscriptionItem = {
  id: string;
  priceId: string;
  quantity: number;
};

export type SubscriptionItemUpdate = {
  id?: string;
  price?: string;
  quantity?: number;
  deleted?: boolean;
};

export function mergeLicensedDepartmentKeys(
  currentKeys: readonly string[],
  keysToAdd: readonly string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const key of [...currentKeys, ...keysToAdd]) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}

/**
 * Diff current Stripe subscription items against the catalog lines for the new quote.
 * Only catalog prices are added, updated, or removed. Unknown items are left alone.
 */
export function subscriptionItemUpdates(
  existing: readonly ExistingSubscriptionItem[],
  desired: readonly StripeCheckoutLineItem[],
  catalogPriceIds: ReadonlySet<string>,
): SubscriptionItemUpdate[] {
  const remaining = existing
    .filter((item) => catalogPriceIds.has(item.priceId))
    .map((item) => ({ ...item }));
  const updates: SubscriptionItemUpdate[] = [];

  for (const want of desired) {
    const matchIndex = remaining.findIndex((item) => item.priceId === want.price);
    if (matchIndex >= 0) {
      const match = remaining.splice(matchIndex, 1)[0];
      if (match && match.quantity !== want.quantity) {
        updates.push({ id: match.id, quantity: want.quantity });
      }
      continue;
    }
    updates.push({ price: want.price, quantity: want.quantity });
  }

  for (const leftover of remaining) {
    updates.push({ id: leftover.id, deleted: true });
  }

  return updates;
}
