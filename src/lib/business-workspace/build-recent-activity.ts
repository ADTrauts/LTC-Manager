import { getFacilityLocalParts } from "@/lib/operational-time";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";

import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";
import type { WorkspaceActivityItem, WorkspaceContext } from "./types";

function formatFacilityLocalStamp(at: Date, timeZone: string): string {
  const parts = getFacilityLocalParts(at, timeZone);
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${hh}:${mm}`;
}

function deptLabel(departmentKey: string | null | undefined): string {
  if (departmentKey === "DIETARY") return "Dietary";
  if (departmentKey === "EVS") return "EVS";
  if (departmentKey === "PLANT") return "Plant";
  return "";
}

type RawItem = WorkspaceActivityItem & { at: Date };

/**
 * Concise meaningful activity only — excludes ordinary log noise and logins.
 * Timestamps are facility-local.
 * In facility mode, items show department labels when a department is known.
 * Activity is already department-scoped by scopeInputsForContext upstream.
 */
export function buildRecentActivity(
  inputs: BusinessWorkspaceInputs,
  context?: WorkspaceContext,
): WorkspaceActivityItem[] {
  const { activity, facilityTimezone } = inputs;
  const showDeptLabel = !context || context.mode === "facility";
  const raw: RawItem[] = [];

  for (const row of activity.repairsOpened) {
    if (row.priority !== "URGENT" && row.priority !== "HIGH") continue;
    const dept = showDeptLabel ? deptLabel(row.departmentKey) : "";
    const prefix = dept ? `${dept} · ` : "";
    raw.push({
      id: `opened-${row.id}`,
      title: row.title,
      meta: `${prefix}${row.unitName} · opened · ${formatFacilityLocalStamp(row.at, facilityTimezone)}`,
      href: issueDetailPath(row.id),
      kind: "issue",
      at: row.at,
    });
  }

  for (const row of activity.repairsResolved) {
    const dept = showDeptLabel ? deptLabel(row.departmentKey) : "";
    const prefix = dept ? `${dept} · ` : "";
    raw.push({
      id: `resolved-${row.id}`,
      title: row.title,
      meta: `${prefix}${row.unitName} · resolved · ${formatFacilityLocalStamp(row.at, facilityTimezone)}`,
      href: issueDetailPath(row.id),
      kind: "repair",
      at: row.at,
    });
  }

  for (const row of activity.inspectionsCompleted) {
    const dept = showDeptLabel ? deptLabel(row.departmentKey) : "";
    const prefix = dept ? `${dept} · ` : "";
    raw.push({
      id: `insp-${row.id}`,
      title: row.title,
      meta: `${prefix}${row.unitName ?? "Facility"} · ${row.result} · ${formatFacilityLocalStamp(row.at, facilityTimezone)}`,
      href: "/admin/inspections",
      kind: "inspection",
      at: row.at,
    });
  }

  for (const row of activity.knowledgePublished) {
    const dept = showDeptLabel ? deptLabel(row.departmentKey) : "";
    const prefix = dept ? `${dept} · ` : "";
    raw.push({
      id: `know-${row.id}`,
      title: row.title,
      meta: `${prefix}${row.category} · published · ${formatFacilityLocalStamp(row.at, facilityTimezone)}`,
      href: "/admin/knowledge",
      kind: "knowledge",
      at: row.at,
    });
  }

  raw.sort((a, b) => b.at.getTime() - a.at.getTime());

  return raw.slice(0, 8).map(({ at: _at, ...item }) => {
    void _at;
    return item;
  });
}
