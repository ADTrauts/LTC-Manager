import { z } from "zod";

import { getDashboardCard } from "@/lib/dashboard/cards/registry";
import type { CardSize, DashboardCardId } from "@/lib/dashboard/cards/types";

export const DASHBOARD_LAYOUT_ITEM_LIMIT = 24;

export type DashboardCardRows = 1 | 2 | 3;

export type DashboardLayoutItemInput = {
  card: DashboardCardId;
  size: CardSize;
  rows: DashboardCardRows;
};

const itemSchema = z.object({
  card: z.string(),
  size: z.enum(["S", "M", "L"]),
  rows: z.number().optional(),
});

function rowsOf(value: number | undefined): DashboardCardRows {
  return value === 2 || value === 3 ? value : 1;
}

export type DashboardLayoutParseResult =
  | { ok: true; items: DashboardLayoutItemInput[] }
  | { ok: false; reason: string };

/** Reject a save that names an unknown card, a bad size, a duplicate, or too many cards. */
export function parseDashboardLayoutItems(value: unknown): DashboardLayoutParseResult {
  const parsed = z.array(itemSchema).safeParse(value);
  if (!parsed.success) return { ok: false, reason: "The layout is not a list of cards." };
  if (parsed.data.length > DASHBOARD_LAYOUT_ITEM_LIMIT) {
    return { ok: false, reason: "A Dashboard layout can hold 24 cards." };
  }
  const seen = new Set<string>();
  const items: DashboardLayoutItemInput[] = [];
  for (const item of parsed.data) {
    const card = getDashboardCard(item.card);
    if (!card) return { ok: false, reason: "That card is not on the Dashboard." };
    if (!card.sizes.includes(item.size)) {
      return { ok: false, reason: "That size is not available for this card." };
    }
    if (seen.has(card.id)) return { ok: false, reason: "A card can appear once." };
    seen.add(card.id);
    items.push({ card: card.id, size: item.size, rows: rowsOf(item.rows) });
  }
  return { ok: true, items };
}

/** Drop unknown or illegal cards on read. Keep the stored order of the ones that remain. */
export function readDashboardLayoutItems(value: unknown): DashboardLayoutItemInput[] {
  const parsed = z.array(itemSchema).safeParse(value);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const items: DashboardLayoutItemInput[] = [];
  for (const item of parsed.data) {
    if (items.length >= DASHBOARD_LAYOUT_ITEM_LIMIT) break;
    const card = getDashboardCard(item.card);
    if (!card || seen.has(card.id) || !card.sizes.includes(item.size)) continue;
    seen.add(card.id);
    items.push({ card: card.id, size: item.size, rows: rowsOf(item.rows) });
  }
  return items;
}

export function layoutScopeAllowed(
  available: readonly { kind: string }[],
  scopeKind: string,
): boolean {
  return available.some((scope) => scope.kind === scopeKind);
}

/** Keep stored cards the viewer cannot see, so a save does not erase them. */
export function mergeLayoutForSave(
  submitted: readonly DashboardLayoutItemInput[],
  stored: readonly DashboardLayoutItemInput[],
  eligibleCardIds: ReadonlySet<string>,
): DashboardLayoutItemInput[] {
  const kept = stored.filter(
    (item) => !eligibleCardIds.has(item.card) && !submitted.some((next) => next.card === item.card),
  );
  return [...submitted, ...kept];
}
