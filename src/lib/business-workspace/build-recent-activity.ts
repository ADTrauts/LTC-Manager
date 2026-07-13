import { getFacilityLocalParts } from "@/lib/operational-time";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";

import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";
import type { WorkspaceActivityItem } from "./types";

function formatFacilityLocalStamp(at: Date, timeZone: string): string {
  const parts = getFacilityLocalParts(at, timeZone);
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${hh}:${mm}`;
}

type RawItem = WorkspaceActivityItem & { at: Date };

/**
 * Concise meaningful activity only — excludes ordinary log noise and logins.
 * Timestamps are facility-local.
 */
export function buildRecentActivity(inputs: BusinessWorkspaceInputs): WorkspaceActivityItem[] {
  const { activity, facilityTimezone } = inputs;
  const raw: RawItem[] = [];

  for (const row of activity.repairsOpened) {
    if (row.priority !== "URGENT" && row.priority !== "HIGH") continue;
    raw.push({
      id: `opened-${row.id}`,
      title: row.title,
      meta: `${row.unitName} · opened · ${formatFacilityLocalStamp(row.at, facilityTimezone)}`,
      href: issueDetailPath(row.id),
      kind: "issue",
      at: row.at,
    });
  }

  for (const row of activity.repairsResolved) {
    raw.push({
      id: `resolved-${row.id}`,
      title: row.title,
      meta: `${row.unitName} · resolved · ${formatFacilityLocalStamp(row.at, facilityTimezone)}`,
      href: issueDetailPath(row.id),
      kind: "repair",
      at: row.at,
    });
  }

  for (const row of activity.inspectionsCompleted) {
    raw.push({
      id: `insp-${row.id}`,
      title: row.title,
      meta: `${row.unitName ?? "Facility"} · ${row.result} · ${formatFacilityLocalStamp(row.at, facilityTimezone)}`,
      href: "/admin/inspections",
      kind: "inspection",
      at: row.at,
    });
  }

  for (const row of activity.knowledgePublished) {
    raw.push({
      id: `know-${row.id}`,
      title: row.title,
      meta: `${row.category} · published · ${formatFacilityLocalStamp(row.at, facilityTimezone)}`,
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
