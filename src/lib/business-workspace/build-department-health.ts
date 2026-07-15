import { summarizeReadiness } from "@/lib/readiness";
import type { ReadinessProfileKey } from "@/lib/readiness/profiles";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";
import type { WorkspaceContext, WorkspaceDepartmentHealth } from "./types";
import { healthBadgeForTone, healthToneFromReadiness } from "./workspace-layout";

const DEPT_META: Record<
  OperationalDepartmentKey,
  { label: string; href: string }
> = {
  DIETARY: { label: "Dietary", href: "/today/walk" },
  EVS: { label: "EVS", href: "/evs" },
  PLANT: { label: "Plant", href: "/assets" },
};

function isPriorityIssue(priority: string): boolean {
  return priority === "URGENT" || priority === "HIGH";
}

/**
 * Department health from department-aware readiness profiles + priority open work.
 * Does not invent scores — Ready / In Progress / Needs Attention only.
 * In single-department mode, shows only that department.
 * In facility mode, shows all active departments.
 */
export function buildDepartmentHealth(
  inputs: BusinessWorkspaceInputs,
  context?: WorkspaceContext,
): WorkspaceDepartmentHealth[] {
  let keys: OperationalDepartmentKey[];
  if (context?.mode === "department") {
    keys = [context.departmentKey];
  } else {
    keys =
      inputs.activeDepartmentKeys.length > 0
        ? inputs.activeDepartmentKeys
        : (["DIETARY", "EVS", "PLANT"] as OperationalDepartmentKey[]);
  }

  return keys.map((key) => {
    const meta = DEPT_META[key] ?? {
      label: key.charAt(0) + key.slice(1).toLowerCase(),
      href: "/dashboard",
    };
    const profileKey = key as ReadinessProfileKey;
    const items = inputs.readiness.items.filter((item) => item.profileKey === profileKey);
    const counts = summarizeReadiness(items);
    const tone = healthToneFromReadiness(counts);
    const blocked = items.filter((item) => item.state === "blocked");
    const inProgress = items.filter((item) => item.state === "in_progress");
    const openPriorityWorkCount = inputs.openRepairs.filter(
      (row) =>
        row.departmentKey === key &&
        isPriorityIssue(row.priority) &&
        row.status !== "CLOSED",
    ).length;

    let reason: string;
    if (counts.total === 0) {
      reason = "No locations currently mapped to this department";
    } else if (blocked.length > 0) {
      reason =
        blocked.length === 1
          ? blocked[0]!.reason
          : `${blocked[0]!.unitName}: ${blocked[0]!.reason}`;
    } else if (inProgress.length > 0) {
      reason = `${inProgress.length} location${inProgress.length === 1 ? "" : "s"} have active recovery work`;
    } else {
      reason = "Current commitments are supportable";
    }

    return {
      key,
      label: meta.label,
      tone,
      badge: healthBadgeForTone(tone),
      summary:
        counts.total === 0
          ? "No locations in scope"
          : `${counts.ready} ready · ${counts.inProgress} in progress · ${counts.blocked} need attention`,
      reason,
      locationCounts: counts,
      openPriorityWorkCount,
      href: meta.href,
    };
  });
}
