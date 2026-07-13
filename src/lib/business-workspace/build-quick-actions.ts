import type { WorkspaceQuickAction } from "./types";

/**
 * Quick Actions — stable launch strip into existing routes.
 */
export function buildQuickActions(options?: {
  supervisor?: boolean;
}): WorkspaceQuickAction[] {
  const all: WorkspaceQuickAction[] = [
    {
      id: "report-issue",
      title: "Report Issue",
      description: "Open the issues module to create or triage work",
      href: "/issues",
      icon: "repairs",
    },
    {
      id: "new-inspection",
      title: "New Inspection",
      description: "Open inspections definitions and submissions",
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
      id: "knowledge",
      title: "Knowledge",
      description: "SOPs and published reference",
      href: "/admin/knowledge",
      icon: "administration",
    },
    {
      id: "employees",
      title: "Employees",
      description: "Roster and HR surfaces",
      href: "/employees",
      icon: "employees",
    },
    {
      id: "logs",
      title: "Logs",
      description: "Compliance and temperature logs",
      href: "/logs",
      icon: "logs",
    },
  ];

  if (options?.supervisor) {
    return all.filter((action) =>
      ["report-issue", "operations-center", "todays-work", "logs"].includes(action.id),
    );
  }

  return all;
}
