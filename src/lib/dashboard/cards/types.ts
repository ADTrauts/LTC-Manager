import type { DashboardAttentionItem } from "../attention";
import type { DashboardCapability, NotConfiguredReason } from "../capabilities";
import type { DashboardFactPack } from "../facts";
import type { DashboardAuthority, DashboardScopeKind, DashboardViewer } from "../viewer/types";

export type DashboardCardId =
  | "coverage"
  | "call_offs"
  | "handoff"
  | "attention"
  | "rounds"
  | "departments_glance"
  | "shift_now"
  | "timeline"
  | "expected_work"
  | "maintenance_open"
  | "pm_due"
  | "request_triage"
  | "records_due"
  | "recent_activity"
  | "menu_today"
  | "department_setup"
  | "facility_setup"
  | "shortcuts";

export type DashboardCategory =
  | "people"
  | "locations"
  | "operations"
  | "maintenance"
  | "records"
  | "menus"
  | "administration";

export type CardSize = "S" | "M" | "L";

export type CapabilityRequirement =
  | { kind: "none" }
  /** At least one Department in scope. */
  | { kind: "any_department" }
  | {
      kind: "capabilities";
      anyOf?: readonly DashboardCapability[];
      allOf?: readonly DashboardCapability[];
    };

export type DrillDown = {
  href: string;
  /** "manage" opens a place to change things. */
  intent: "view" | "manage";
  /** Read-only alternative for VIEW viewers. */
  viewHref?: string;
};

export type CardLoadInput = {
  viewer: DashboardViewer;
  facts: DashboardFactPack;
  size: CardSize;
};

export type CardResult<Model> =
  | { state: "ready"; model: Model; attention: DashboardAttentionItem[] }
  | { state: "quiet"; message: string }
  | { state: "not_configured"; reason: NotConfiguredReason }
  | { state: "unavailable"; reason: "error" | "timeout" };

export type DashboardMetricTone = "ok" | "attention" | "late";

export type DashboardMetric = {
  label: string;
  value: number | string;
  tone: DashboardMetricTone;
};

export type DashboardCardLine = {
  id: string;
  title: string;
  detail: string | null;
  tone: DashboardMetricTone;
  href: string | null;
};

/** Full card. Small sizes show the first metric; medium and large add lines. */
export type DashboardReadyModel = {
  metrics: DashboardMetric[];
  lines: DashboardCardLine[];
};

export type DashboardSummaryModel = {
  metrics: DashboardMetric[];
};

export type DashboardCardDefinition<Model = unknown> = {
  /** Stable; stored in layouts. */
  id: DashboardCardId;
  title: string;
  question: string;
  category: DashboardCategory;
  scopes: readonly DashboardScopeKind[];
  minAuthority: DashboardAuthority;
  requires: CapabilityRequirement;
  sizes: readonly CardSize[];
  defaultSize: CardSize;
  /**
   * Every link the card can render for the Department in scope (null at Facility scope).
   * The first one is the card's header link.
   */
  drillDowns(departmentId: string | null): readonly DrillDown[];
  /**
   * True: an unreachable drill-down makes the card ineligible. False: the card renders
   * without that link (Department setup shows reasons to leaders who cannot open the Builder).
   */
  drillDownRequired: boolean;
  /** Present only on the CDA-Q07 cards that render for SUMMARY viewers. */
  summary?: {
    load(input: CardLoadInput): Promise<CardResult<DashboardSummaryModel>>;
  };
  load(input: CardLoadInput): Promise<CardResult<Model>>;
};
