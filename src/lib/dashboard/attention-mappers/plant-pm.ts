import type { PmRunBoardCounts } from "@/lib/preventive-maintenance/run-board";

import { plural, type AttentionSeverity, type DashboardAttentionItem } from "../attention";

const PM_ROWS: ReadonlyArray<{
  key: "overdue" | "dueToday" | "unassigned";
  slug: string;
  severity: AttentionSeverity;
  label: string;
}> = [
  { key: "overdue", slug: "overdue", severity: "act_now", label: "overdue" },
  { key: "dueToday", slug: "due_today", severity: "due_soon", label: "due today" },
  { key: "unassigned", slug: "unassigned", severity: "watch", label: "unassigned" },
];

export function attentionFromPlantPm(input: {
  departmentId: string;
  counts: PmRunBoardCounts;
}): DashboardAttentionItem[] {
  return PM_ROWS.filter((row) => input.counts[row.key] > 0).map((row) => ({
    id: `plant_pm:${row.slug}:${input.departmentId}`,
    source: "plant_pm",
    severity: row.severity,
    departmentId: input.departmentId,
    locationId: null,
    title: `${plural(input.counts[row.key], "preventive maintenance task")} ${row.label}`,
    detail: null,
    dueAt: null,
    href: "/preventive-maintenance",
  }));
}
