import type { EligibleDashboardCard } from "../cards/eligibility";
import type { CardSize, DashboardCardId } from "../cards/types";
import type { DashboardAuthority, DashboardScopeKind } from "../viewer/types";

export type DashboardLayoutItem = {
  id: DashboardCardId;
  size: CardSize;
};

/** Supervisor, team or whole Department. Ineligible cards drop out, so Plant keeps Maintenance. */
const SUPERVISOR: readonly DashboardLayoutItem[] = [
  { id: "shift_now", size: "L" },
  { id: "attention", size: "M" },
  { id: "call_offs", size: "S" },
  { id: "coverage", size: "S" },
  { id: "rounds", size: "M" },
  { id: "records_due", size: "M" },
  { id: "expected_work", size: "M" },
  { id: "handoff", size: "M" },
  { id: "menu_today", size: "S" },
  { id: "maintenance_open", size: "S" },
  { id: "request_triage", size: "S" },
  { id: "pm_due", size: "S" },
];

const MANAGER: readonly DashboardLayoutItem[] = [
  { id: "attention", size: "L" },
  { id: "timeline", size: "L" },
  { id: "coverage", size: "S" },
  { id: "call_offs", size: "S" },
  { id: "records_due", size: "M" },
  { id: "request_triage", size: "M" },
  { id: "pm_due", size: "M" },
  { id: "expected_work", size: "M" },
  { id: "maintenance_open", size: "M" },
  { id: "menu_today", size: "S" },
  { id: "shortcuts", size: "S" },
  { id: "recent_activity", size: "M" },
];

const LEADER: readonly DashboardLayoutItem[] = [
  { id: "attention", size: "L" },
  { id: "timeline", size: "L" },
  { id: "department_setup", size: "M" },
  { id: "coverage", size: "S" },
  { id: "call_offs", size: "S" },
  { id: "records_due", size: "M" },
  { id: "request_triage", size: "M" },
  { id: "pm_due", size: "M" },
  { id: "expected_work", size: "M" },
  { id: "maintenance_open", size: "M" },
  { id: "menu_today", size: "S" },
  { id: "shortcuts", size: "S" },
  { id: "recent_activity", size: "M" },
];

const FACILITY: readonly DashboardLayoutItem[] = [
  { id: "attention", size: "L" },
  { id: "departments_glance", size: "L" },
  { id: "facility_setup", size: "M" },
  { id: "coverage", size: "S" },
  { id: "call_offs", size: "S" },
  { id: "maintenance_open", size: "M" },
  { id: "records_due", size: "M" },
  { id: "pm_due", size: "S" },
  { id: "request_triage", size: "S" },
  { id: "recent_activity", size: "M" },
];

/**
 * Role default for this viewer. A Facility Administrator in a Department lens uses the
 * Department leader list. Cards the Department cannot show are skipped at placement.
 */
export function defaultLayoutFor(viewer: {
  authority: DashboardAuthority;
  scope: { kind: DashboardScopeKind } | null;
}): readonly DashboardLayoutItem[] {
  if (!viewer.scope) return [];
  if (viewer.scope.kind === "FACILITY") return FACILITY;
  if (viewer.authority === "FACILITY_ADMINISTRATOR" || viewer.authority === "DEPARTMENT_LEADER") return LEADER;
  if (viewer.authority === "MANAGER") return MANAGER;
  return SUPERVISOR;
}

export type PlacedDashboardCard = {
  eligible: EligibleDashboardCard;
  size: CardSize;
};

/** Keeps the layout order and size. Eligible cards that are not on the layout stay off the page. */
export function placeDashboardCards(
  cards: readonly EligibleDashboardCard[],
  layout: readonly DashboardLayoutItem[],
): PlacedDashboardCard[] {
  const byId = new Map(cards.map((eligible) => [eligible.card.id, eligible]));
  const placed: PlacedDashboardCard[] = [];
  for (const item of layout) {
    const eligible = byId.get(item.id);
    if (!eligible) continue;
    const size = eligible.card.sizes.includes(item.size) ? item.size : eligible.card.defaultSize;
    placed.push({ eligible, size });
  }
  return placed;
}
