import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";
import type {
  ManagementAgendaBucket,
  ManagementAgendaBucketId,
  ManagementAgendaItem,
} from "./types";

function agendaBucketForLocalHour(hour: number): ManagementAgendaBucketId {
  if (hour >= 4 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 18) return "afternoon";
  return "evening";
}

const BUCKET_LABELS: Record<ManagementAgendaBucketId, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};

const BUCKET_ORDER: ManagementAgendaBucketId[] = [
  "morning",
  "midday",
  "afternoon",
  "evening",
];

/**
 * Management Agenda — operational day ordered by facility-local time buckets.
 * Generated entirely from existing signals (no calendar / RRULE).
 */
export function buildManagementAgenda(inputs: BusinessWorkspaceInputs): ManagementAgendaBucket[] {
  const hour = inputs.operationalTime.facilityLocal.hour;
  const current = agendaBucketForLocalHour(hour);
  const op = inputs.dashboard.operationContext;
  const staffingGaps = inputs.dashboard.unitsMissingStaffing.length;
  const callDownOpen = inputs.callDownSummary.open;
  const overdueInspections = inputs.inspectionsDue.filter((row) => row.overdue);
  const dueInspections = inputs.inspectionsDue.filter((row) => !row.overdue);
  const priorityOpen = inputs.openRepairs.filter(
    (row) =>
      (row.priority === "URGENT" || row.priority === "HIGH") && row.status !== "CLOSED",
  );
  const recovery = inputs.openRepairs.filter(
    (row) =>
      (row.priority === "URGENT" || row.priority === "HIGH") &&
      row.status === "IN_PROGRESS",
  );
  const blocked = inputs.readiness.items.filter((item) => item.state === "blocked");
  const knowledgeRecent = inputs.activity.knowledgePublished[0];

  const byBucket: Record<ManagementAgendaBucketId, ManagementAgendaItem[]> = {
    morning: [],
    midday: [],
    afternoon: [],
    evening: [],
  };

  // Morning — breakfast review, kitchen walk, staffing verify
  byBucket.morning.push({
    id: "morning-meal-review",
    title: `${op.mealLabel || "Breakfast"} review`,
    detail: `${op.serviceLabel} — ${op.phase}`,
    href: "/dashboard",
    tone: op.phase === "Execution" ? "in_progress" : "neutral",
  });
  if (blocked.length > 0 || op.mealType === "BREAKFAST" || hour < 11) {
    byBucket.morning.push({
      id: "morning-walk",
      title: blocked.length > 0 ? "Walk locations needing attention" : "Walk Kitchen",
      detail:
        blocked.length > 0
          ? `${blocked[0]!.unitName}: ${blocked[0]!.reason}`
          : "Confirm morning locations are supportable",
      href: "/today/walk",
      tone: blocked.length > 0 ? "warning" : "neutral",
    });
  }
  if (staffingGaps > 0 || callDownOpen > 0 || hour < 11) {
    byBucket.morning.push({
      id: "morning-staffing",
      title: "Verify staffing",
      detail:
        staffingGaps > 0
          ? `${staffingGaps} coverage gap${staffingGaps === 1 ? "" : "s"}`
          : callDownOpen > 0
            ? `${callDownOpen} open call-down${callDownOpen === 1 ? "" : "s"}`
            : "Confirm AM coverage before service",
      href: "/today/coverage",
      tone: staffingGaps + callDownOpen > 0 ? "warning" : "neutral",
    });
  }

  // Midday — lunch focus + active exceptions
  byBucket.midday.push({
    id: "midday-meal",
    title: "Lunch service check",
    detail: op.mealType === "LUNCH" ? `${op.phase} · current focus` : "Midday service posture",
    href: "/dashboard",
    tone: op.mealType === "LUNCH" ? "in_progress" : "neutral",
  });
  if (priorityOpen.length > 0) {
    byBucket.midday.push({
      id: "midday-issues",
      title: "Priority issue follow-up",
      detail: `${priorityOpen[0]!.title}`,
      href: `/issues/${priorityOpen[0]!.id}`,
      tone: "warning",
    });
  }

  // Afternoon — inspections, repairs, knowledge
  if (overdueInspections.length > 0 || dueInspections.length > 0) {
    const count = overdueInspections.length + dueInspections.length;
    byBucket.afternoon.push({
      id: "afternoon-inspection",
      title: overdueInspections.length > 0 ? "Overdue inspection" : "Inspection due",
      detail:
        overdueInspections[0]?.definitionName ??
        dueInspections[0]?.definitionName ??
        `${count} inspection item${count === 1 ? "" : "s"}`,
      href: "/today/handoffs",
      tone: overdueInspections.length > 0 ? "blocked" : "warning",
    });
  }
  if (recovery.length > 0 || priorityOpen.length > 0) {
    const row = recovery[0] ?? priorityOpen[0]!;
    byBucket.afternoon.push({
      id: "afternoon-repair",
      title: "Repair follow-up",
      detail: row.title,
      href: `/issues/${row.id}`,
      tone: recovery.length > 0 ? "in_progress" : "warning",
    });
  }
  if (knowledgeRecent) {
    byBucket.afternoon.push({
      id: "afternoon-knowledge",
      title: "Knowledge review",
      detail: knowledgeRecent.title,
      href: "/admin/knowledge",
      tone: "neutral",
    });
  } else {
    byBucket.afternoon.push({
      id: "afternoon-knowledge-default",
      title: "Knowledge review",
      detail: "Skim published SOPs if capacity allows",
      href: "/admin/knowledge",
      tone: "neutral",
    });
  }

  // Evening — handoff + call-offs
  byBucket.evening.push({
    id: "evening-handoff",
    title: "Shift handoff",
    detail: "Capture exceptions for the next leader",
    href: "/today/handoffs",
    tone: "neutral",
  });
  byBucket.evening.push({
    id: "evening-calldowns",
    title: "Review call-offs",
    detail:
      callDownOpen > 0
        ? `${callDownOpen} still open`
        : "Confirm coverage notes before close",
    href: "/today/coverage",
    tone: callDownOpen > 0 ? "warning" : "neutral",
  });
  if (op.mealType === "DINNER") {
    byBucket.evening.unshift({
      id: "evening-dinner",
      title: "Dinner close review",
      detail: `${op.serviceLabel} — ${op.phase}`,
      href: "/dashboard",
      tone: "in_progress",
    });
  }

  return BUCKET_ORDER.map((id) => ({
    id,
    label: BUCKET_LABELS[id],
    isCurrent: id === current,
    items: byBucket[id],
  }));
}

export function currentAgendaBucketId(
  hour: number,
): ManagementAgendaBucketId {
  return agendaBucketForLocalHour(hour);
}
