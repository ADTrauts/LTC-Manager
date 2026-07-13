import type { WorkspaceSectionId } from "./types";

export type WorkspaceSectionDef = {
  id: WorkspaceSectionId;
  title: string;
  description: string;
};

/** Layout order and copy for composed sections. */
export const WORKSPACE_SECTION_DEFS: readonly WorkspaceSectionDef[] = [
  {
    id: "manager_focus",
    title: "Manager Focus",
    description: "What you should personally work on next — at most three actions.",
  },
  {
    id: "management_agenda",
    title: "Management Agenda",
    description: "Operational agenda for the day, organized by facility time.",
  },
  {
    id: "quick_actions",
    title: "Quick Actions",
    description: "Jump into existing modules without leaving Workspace.",
  },
  {
    id: "priorities",
    title: "Today's Priorities",
    description: "Supporting attention list — Focus stays primary.",
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
    title: "Operations Launch",
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
  preferredOrder?: readonly WorkspaceSectionId[],
): WorkspaceSectionDef[] {
  const set = new Set(visible);
  if (!preferredOrder || preferredOrder.length === 0) {
    return WORKSPACE_SECTION_DEFS.filter((def) => set.has(def.id));
  }

  const core = WORKSPACE_SECTION_DEFS.filter(
    (def) =>
      set.has(def.id) &&
      (def.id === "manager_focus" || def.id === "management_agenda" || def.id === "quick_actions"),
  );
  const remainderIds = preferredOrder.filter(
    (id) => set.has(id) && !core.some((c) => c.id === id),
  );
  const remainderSeen = new Set(remainderIds);
  const rest = WORKSPACE_SECTION_DEFS.filter(
    (def) => set.has(def.id) && !core.some((c) => c.id === def.id) && !remainderSeen.has(def.id),
  );
  const orderedRemainder = [
    ...remainderIds
      .map((id) => WORKSPACE_SECTION_DEFS.find((def) => def.id === id))
      .filter((def): def is WorkspaceSectionDef => Boolean(def)),
    ...rest,
  ];
  return [...core, ...orderedRemainder];
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
