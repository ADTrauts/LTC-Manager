import type { WorkspaceContext, WorkspaceQuickAction } from "./types";
import { isLinkAllowedForContext, type WorkspaceCompositionConfig } from "./workspace-composition";

function normalizeHref(href: string): string {
  return href.replace(/\/$/, "") || "/";
}

/**
 * Quick Actions — compact launch strip into existing routes.
 * Employees/Logs live under Operations launch (optional section), not the home strip.
 * When a department context is active, actions are filtered by the composition
 * config's `quickActionIds` and department nav rules.
 */
export function buildQuickActions(options?: {
  supervisor?: boolean;
  promotedHrefs?: readonly string[];
  context?: WorkspaceContext;
  config?: WorkspaceCompositionConfig;
}): WorkspaceQuickAction[] {
  const promoted = new Set((options?.promotedHrefs ?? []).map(normalizeHref));
  const ctx = options?.context;
  const allowedIds = options?.config ? new Set(options.config.quickActionIds) : null;

  const all: WorkspaceQuickAction[] = [
    {
      id: "report-issue",
      title: "Report Issue",
      description: "Create or triage operational work",
      href: "/issues",
      icon: "repairs",
    },
    {
      id: "new-inspection",
      title: "New Inspection",
      description: "Open inspection definitions and submissions",
      href: "/admin/inspections",
      icon: "logs",
    },
    {
      id: "operations-center",
      title: "Operations Center",
      description: "Live exception sweep for this facility",
      href: "/dashboard",
      icon: "operationsCenter",
    },
    {
      id: "todays-work",
      title: "Today's Work",
      description: "Walk, coverage, call-downs, and handoffs",
      href: "/today",
      icon: "todaysWork",
    },
    {
      id: "assets",
      title: "Assets",
      description: "Equipment and plant assets",
      href: "/assets",
      icon: "assets",
    },
    {
      id: "evs-board",
      title: "EVS Board",
      description: "Cleaning assignments and room status",
      href: "/evs",
      icon: "logs",
    },
    {
      id: "logs",
      title: "Logs",
      description: "Compliance and temperature logs",
      href: "/logs",
      icon: "logs",
    },
    {
      id: "knowledge",
      title: "Knowledge",
      description: "SOPs and published reference",
      href: "/admin/knowledge",
      icon: "administration",
    },
  ];

  const supervisorIds = new Set(["report-issue", "operations-center", "todays-work"]);
  let actions = options?.supervisor
    ? all.filter((action) => supervisorIds.has(action.id))
    : all;

  if (allowedIds) {
    actions = actions.filter((action) => allowedIds.has(action.id));
  }

  if (ctx) {
    actions = actions.filter((action) => isLinkAllowedForContext(action.href, ctx));
  }

  if (promoted.has("/dashboard")) {
    actions = actions.filter((action) => action.id !== "operations-center");
  }

  return actions;
}
