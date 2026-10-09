import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import type { LogRequirementProductState } from "@/lib/logs-architecture/types";
import { assetStatusLabel } from "@/lib/asset-operations/types";
import type { OperationalReviewDayPresentation } from "@/lib/operational-review/present-operational-review-day";

const EVIDENCE_SUMMARY_IDS = ["evidence-missed", "evidence-corrective", "evidence-unavailable"] as const;

const LOG_STATE_ORDER: LogRequirementProductState[] = [
  "DUE",
  "OVERDUE",
  "UPCOMING",
  "COMPLETED",
  "COMPLETED_WITH_EXCEPTION",
  "NEEDS_SETUP",
];

const ASSET_LABEL_ORDER = ["Operational", "Degraded", "Out of service"];

export type DashboardCountLine = {
  id: string;
  label: string;
  count: number;
};

export type DashboardReviewCard = {
  serviceDate: string;
  href: string;
  unavailableMessage: string | null;
  quietMessage: string | null;
  lines: DashboardCountLine[];
};

export type DashboardLogsCard = {
  href: "/partner/logs";
  emptyMessage: string | null;
  lines: DashboardCountLine[];
};

export type DashboardAssetsCard = {
  href: "/partner/assets";
  emptyMessage: string | null;
  total: number;
  lines: DashboardCountLine[];
};

export type PartnerDashboardViewModel = {
  serviceDate: string;
  departmentName: string;
  review: DashboardReviewCard | null;
  logs: DashboardLogsCard | null;
  assets: DashboardAssetsCard | null;
};

function reviewHref(serviceDate: string): string {
  return `/partner/reports?date=${serviceDate}`;
}

/** Evidence lines already counted by the Review presenter. Other summary ids stay off this card. */
export function summarizeDashboardReview(
  presentation: OperationalReviewDayPresentation,
): DashboardReviewCard {
  const href = reviewHref(presentation.serviceDate);
  if (presentation.evidence.availability.status === "unavailable") {
    return {
      serviceDate: presentation.serviceDate,
      href,
      unavailableMessage:
        presentation.evidence.unavailableMessage ?? "Evidence is unavailable for this service day.",
      quietMessage: null,
      lines: [],
    };
  }

  const lines = EVIDENCE_SUMMARY_IDS.flatMap((id) => {
    const item = presentation.summaryItems.find((row) => row.id === id);
    if (!item || item.count <= 0) return [];
    return [{ id, label: item.name, count: item.count }];
  });

  return {
    serviceDate: presentation.serviceDate,
    href,
    unavailableMessage: null,
    quietMessage: lines.length === 0 ? "No evidence exceptions for this service day." : null,
    lines,
  };
}

/** Counts canonical requirement product states. Not-applicable requirements are omitted. */
export function summarizeDashboardLogs(
  requirements: readonly RunLogRequirementView[],
): DashboardLogsCard {
  const counts = new Map<LogRequirementProductState, { label: string; count: number }>();
  for (const requirement of requirements) {
    if (requirement.productState === "NOT_APPLICABLE") continue;
    const current = counts.get(requirement.productState) ?? {
      label: requirement.stateLabel,
      count: 0,
    };
    current.count += 1;
    counts.set(requirement.productState, current);
  }

  const lines = LOG_STATE_ORDER.flatMap((state) => {
    const row = counts.get(state);
    if (!row || row.count <= 0) return [];
    return [{ id: state, label: row.label, count: row.count }];
  });

  return {
    href: "/partner/logs",
    emptyMessage: lines.length === 0 ? "No log requirements for this service day." : null,
    lines,
  };
}

function dashboardAssetLabel(status: string): string {
  if (
    status === "ACTIVE" ||
    status === "OPERATIONAL" ||
    status === "DEGRADED" ||
    status === "OUT_OF_SERVICE"
  ) {
    return assetStatusLabel(status);
  }
  if (status === "RETIRED") return "Retired";
  return status;
}

/** Groups a partner-scoped status aggregate. Retired rows are ignored. */
export function summarizeDashboardAssets(
  groups: readonly { status: string; count: number }[],
  departmentName: string,
): DashboardAssetsCard {
  const counts = new Map<string, number>();
  for (const group of groups) {
    if (group.status === "RETIRED" || group.count <= 0) continue;
    const label = dashboardAssetLabel(group.status);
    counts.set(label, (counts.get(label) ?? 0) + group.count);
  }

  const labels = [
    ...ASSET_LABEL_ORDER.filter((label) => counts.has(label)),
    ...[...counts.keys()].filter((label) => !ASSET_LABEL_ORDER.includes(label)).sort(),
  ];
  const lines = labels.map((label) => ({
    id: label,
    label,
    count: counts.get(label) ?? 0,
  }));
  const total = lines.reduce((sum, line) => sum + line.count, 0);

  return {
    href: "/partner/assets",
    emptyMessage: total === 0 ? `No assets assigned to ${departmentName}.` : null,
    total,
    lines,
  };
}
