import type { StatusTone } from "@/lib/design-system/status-styles";

import { isDashboardHrefAuthorized } from "./drill-down";
import type { DashboardViewer } from "./viewer/types";

export type AttentionSeverity = "act_now" | "due_soon" | "watch";

export type DashboardAttentionSource =
  | "location"
  | "coverage"
  | "records"
  | "maintenance"
  | "plant_pm"
  | "plant_request"
  | "menus"
  | "setup";

/** The single shape for "something needs a person". */
export type DashboardAttentionItem = {
  /** Stable: `${source}:${sourceId}`. */
  id: string;
  source: DashboardAttentionSource;
  severity: AttentionSeverity;
  departmentId: string;
  /** Unit or space id when location-bound. */
  locationId: string | null;
  title: string;
  detail: string | null;
  /** ISO instant; the facility timezone is applied at render. */
  dueAt: string | null;
  /** Owner page; must pass `authorizeRoute`. */
  href: string;
};

export const ATTENTION_SEVERITY_RANK: Readonly<Record<AttentionSeverity, number>> = {
  act_now: 0,
  due_soon: 1,
  watch: 2,
};

/** Severity → design-system status tone. Cards never invent tones. */
export const ATTENTION_SEVERITY_TONE: Readonly<Record<AttentionSeverity, StatusTone>> = {
  act_now: "blocked",
  due_soon: "warning",
  watch: "neutral",
};

/** Severity, then due time (undated last), then title. */
export function compareAttentionItems(a: DashboardAttentionItem, b: DashboardAttentionItem): number {
  const severity = ATTENTION_SEVERITY_RANK[a.severity] - ATTENTION_SEVERITY_RANK[b.severity];
  if (severity !== 0) return severity;
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  }
  const title = a.title.localeCompare(b.title);
  return title !== 0 ? title : a.id.localeCompare(b.id);
}

/** A location roll-up already stands for the coverage gaps and Records at that location. */
const FOLDED_INTO_LOCATION: ReadonlySet<DashboardAttentionSource> = new Set(["coverage", "records"]);

/** Merges mapper outputs: repeated ids collapse, location-bound duplicates fold into their location, then sort. */
export function mergeAttentionItems(
  ...lists: readonly (readonly DashboardAttentionItem[])[]
): DashboardAttentionItem[] {
  const byId = new Map<string, DashboardAttentionItem>();
  for (const list of lists) {
    for (const item of list) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  const items = [...byId.values()];
  const rolledUp = new Set(
    items.filter((item) => item.source === "location" && item.locationId).map((item) => item.locationId),
  );
  return items
    .filter(
      (item) => !(FOLDED_INTO_LOCATION.has(item.source) && item.locationId && rolledUp.has(item.locationId)),
    )
    .sort(compareAttentionItems);
}

/** Keeps items for Departments in the viewer's scope whose link the viewer can open. */
export function scopeAttentionToViewer(
  viewer: Pick<DashboardViewer, "scopeDepartmentIds" | "role" | "session" | "routeFlags">,
  items: readonly DashboardAttentionItem[],
): DashboardAttentionItem[] {
  const inScope = new Set(viewer.scopeDepartmentIds);
  return items.filter((item) => inScope.has(item.departmentId) && isDashboardHrefAuthorized(viewer, item.href));
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
