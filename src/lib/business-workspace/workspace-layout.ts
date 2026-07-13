import type { WorkspaceSectionId } from "./types";

export type WorkspaceSectionDef = {
  id: WorkspaceSectionId;
  title: string;
  description: string;
};

/** Layout order and copy for composed sections. */
export const WORKSPACE_SECTION_DEFS: readonly WorkspaceSectionDef[] = [
  {
    id: "priorities",
    title: "Today's Priorities",
    description: "Highest-attention items for this facility right now.",
  },
  {
    id: "department_health",
    title: "Department Health",
    description: "Readiness by operational department.",
  },
  {
    id: "todays_work",
    title: "Today's Work",
    description: "Jump into walk, coverage, call-downs, and handoffs.",
  },
  {
    id: "operations",
    title: "Operations",
    description: "Open existing operational modules.",
  },
  {
    id: "performance",
    title: "Performance Snapshot",
    description: "Existing readiness and work totals — not a new analytics engine.",
  },
  {
    id: "recent_activity",
    title: "Recent Activity",
    description: "Latest inspections, issues, knowledge, and repairs.",
  },
] as const;

export function orderedWorkspaceSections(
  visible: readonly WorkspaceSectionId[],
): WorkspaceSectionDef[] {
  const set = new Set(visible);
  return WORKSPACE_SECTION_DEFS.filter((def) => set.has(def.id));
}

export function greetingForLocalHour(hour: number, displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] || "there";
  if (hour >= 5 && hour < 12) return `Good morning ${first}`;
  if (hour >= 12 && hour < 17) return `Good afternoon ${first}`;
  return `Good evening ${first}`;
}

export function healthToneFromReadiness(input: {
  blocked: number;
  inProgress: number;
  total: number;
}): import("./types").WorkspaceHealthTone {
  if (input.blocked > 0) return "red";
  if (input.inProgress > 0) return "yellow";
  if (input.total === 0) return "neutral";
  return "green";
}

export function healthBadgeForTone(
  tone: import("./types").WorkspaceHealthTone,
): import("@/lib/design-system/status-styles").StatusBadgeVariant {
  if (tone === "red") return "blocked";
  if (tone === "yellow") return "in_progress";
  if (tone === "green") return "ready";
  return "neutral";
}
