import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";
import type { WorkspaceMetric } from "./types";
import type { WorkspaceCompositionConfig } from "./workspace-composition";

function isPriorityIssue(priority: string): boolean {
  return priority === "URGENT" || priority === "HIGH";
}

/**
 * Performance snapshot from existing deterministic counts only.
 * Routine / low-medium repairs do not inflate priority issue metrics.
 * Log completion is only shown when the composition config indicates it is relevant
 * (Dietary and Facility modes). Already-scoped inputs means counts reflect the
 * active department.
 */
export function buildPerformanceSnapshot(
  inputs: BusinessWorkspaceInputs,
  config?: WorkspaceCompositionConfig,
): WorkspaceMetric[] {
  const { dashboard, readiness, openRepairs, inspectionsDue, callDownSummary } = inputs;
  const ready = readiness.summary.ready;
  const blocked = readiness.summary.blocked;
  const openPriorityIssues = openRepairs.filter(
    (row) => isPriorityIssue(row.priority) && row.status !== "CLOSED",
  ).length;
  const overdueInspections = inspectionsDue.filter((row) => row.overdue).length;
  const dueInspections = inspectionsDue.length;
  const staffingGaps = dashboard.unitsMissingStaffing.length;
  const showLogs = config?.showLogCompletion ?? true;

  const metrics: WorkspaceMetric[] = [
    {
      id: "locations-ready",
      label: "Locations ready",
      value: ready,
      hint: `${readiness.summary.total} in scope`,
      tone: blocked > 0 ? "neutral" : "ready",
      href: "/today/walk",
    },
    {
      id: "locations-attention",
      label: "Needing attention",
      value: blocked,
      hint: readiness.summary.inProgress > 0 ? `${readiness.summary.inProgress} in progress` : undefined,
      tone: blocked > 0 ? "blocked" : "ready",
      href: "/today/walk",
    },
    {
      id: "priority-issues",
      label: "Open priority issues",
      value: openPriorityIssues,
      hint: "Urgent and high only",
      tone: openPriorityIssues > 0 ? "warning" : "ready",
      href: "/issues",
    },
    {
      id: "inspections",
      label: "Due / overdue inspections",
      value: dueInspections,
      hint: overdueInspections > 0 ? `${overdueInspections} overdue` : "Next 24 hours",
      tone: overdueInspections > 0 ? "blocked" : dueInspections > 0 ? "warning" : "ready",
      href: "/today/handoffs",
    },
    {
      id: "staffing-gaps",
      label: "Staffing gaps",
      value: staffingGaps,
      hint: callDownSummary.open > 0 ? `${callDownSummary.open} open call-downs` : undefined,
      tone: staffingGaps > 0 ? "warning" : "ready",
      href: "/today/coverage",
    },
  ];

  if (showLogs) {
    const dueLogsExpected = dashboard.totals.expected;
    const dueLogsCompleted = dashboard.totals.completed;
    const complianceTone =
      dashboard.totals.failed + dashboard.totals.missed > 0
        ? "warning"
        : dueLogsExpected > 0 && dueLogsCompleted >= dueLogsExpected
          ? "ready"
          : "neutral";
    metrics.push({
      id: "due-compliance",
      label: "Due log completion",
      value: dueLogsExpected === 0 ? "—" : `${dueLogsCompleted}/${dueLogsExpected}`,
      hint: `${dashboard.totals.failed} failed · ${dashboard.totals.missed} missed`,
      tone: complianceTone,
      href: "/logs",
    });
  }

  if (inputs.assignmentSummary?.available) {
    const as = inputs.assignmentSummary;
    metrics.push({
      id: "positions-filled",
      label: "Positions filled",
      value: `${as.filledPositions}/${as.requiredPositions}`,
      hint: as.unfilledPositions > 0
        ? `${as.unfilledPositions} unfilled`
        : "All positions filled",
      tone: as.unfilledPositions > 0 ? "warning" : "ready",
      href: "/staffing/assignments",
    });
  }

  return metrics;
}
