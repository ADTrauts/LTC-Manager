import type { SupervisorAssetExceptionItem } from "@/lib/asset-operations/load-runtime-assets";

import type { AttentionSeverity, DashboardAttentionItem } from "../attention";

const TEMPORAL_SEVERITY: Readonly<Record<SupervisorAssetExceptionItem["temporal"], AttentionSeverity>> = {
  Late: "act_now",
  NotConfirmed: "due_soon",
  Current: "watch",
};

function sourceId(item: SupervisorAssetExceptionItem): string {
  if (item.issueId) return `issue:${item.issueId}`;
  if (item.workOrderId) return `work_order:${item.workOrderId}`;
  if (item.assetId) return `asset:${item.assetId}`;
  return `href:${item.sourceHref}`;
}

export function attentionFromAssetExceptions(input: {
  departmentId: string;
  items: readonly SupervisorAssetExceptionItem[];
}): DashboardAttentionItem[] {
  return input.items.map((item) => ({
    id: `maintenance:${sourceId(item)}`,
    source: "maintenance",
    severity: TEMPORAL_SEVERITY[item.temporal],
    departmentId: input.departmentId,
    locationId: item.unitId,
    title: item.status,
    detail: item.unitName,
    dueAt: null,
    href: item.sourceHref,
  }));
}
