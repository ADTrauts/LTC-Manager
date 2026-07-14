import { getFacilityLocalParts } from "@/lib/operational-time";

import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";
import type {
  ManagementAgendaBucket,
  ManagementAgendaBucketId,
  ManagementAgendaItem,
  ManagementAgendaTemporal,
} from "./types";
import { inspectionFocusHref } from "./build-manager-focus";

const BUCKET_LABELS: Record<ManagementAgendaBucketId, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};

export const AGENDA_BUCKET_ORDER: ManagementAgendaBucketId[] = [
  "morning",
  "midday",
  "afternoon",
  "evening",
];

/**
 * Facility-local hour → agenda bucket.
 * Morning 04:00–10:59, Midday 11:00–14:59, Afternoon 15:00–17:59, Evening otherwise
 * (18:00–03:59, including overnight through facility-local midnight).
 */
export function agendaBucketForLocalHour(hour: number): ManagementAgendaBucketId {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 4 && h < 11) return "morning";
  if (h >= 11 && h < 15) return "midday";
  if (h >= 15 && h < 18) return "afternoon";
  return "evening";
}

/** Resolve current bucket from an absolute instant + facility IANA timezone. */
export function resolveAgendaBucketId(
  now: Date,
  facilityTimezone: string,
): ManagementAgendaBucketId {
  const parts = getFacilityLocalParts(now, facilityTimezone);
  return agendaBucketForLocalHour(parts.hour);
}

export function currentAgendaBucketId(hour: number): ManagementAgendaBucketId {
  return agendaBucketForLocalHour(hour);
}

/**
 * Classify buckets relative to the current window.
 * Overnight evening (00:00–03:59): morning/midday/afternoon are upcoming (future).
 * Daytime evening (18:00–23:59): morning/midday/afternoon are past.
 */
export function classifyAgendaTemporal(
  bucketId: ManagementAgendaBucketId,
  currentId: ManagementAgendaBucketId,
  facilityLocalHour: number,
): ManagementAgendaTemporal {
  if (bucketId === currentId) return "current";
  const hour = ((Math.floor(facilityLocalHour) % 24) + 24) % 24;
  if (currentId === "evening" && hour < 4) {
    return "future";
  }
  const bi = AGENDA_BUCKET_ORDER.indexOf(bucketId);
  const ci = AGENDA_BUCKET_ORDER.indexOf(currentId);
  return bi < ci ? "past" : "future";
}

function agendaUrgencyRank(item: ManagementAgendaItem): number {
  if (item.tone === "blocked") return 0;
  if (item.tone === "warning") return 1;
  if (item.tone === "in_progress") return 2;
  return 3;
}

function sortAgendaItems(items: ManagementAgendaItem[]): ManagementAgendaItem[] {
  return [...items].sort(
    (a, b) => agendaUrgencyRank(a) - agendaUrgencyRank(b) || a.id.localeCompare(b.id),
  );
}

/**
 * Management Agenda — operational day ordered by facility-local time buckets.
 * Generated entirely from existing signals (no calendar / RRULE).
 */
export function buildManagementAgenda(inputs: BusinessWorkspaceInputs): ManagementAgendaBucket[] {
  const hour = inputs.operationalTime.facilityLocal.hour;
  // Prefer injected operational-time hour (tests + shared clock) — already timezone-resolved.
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

  byBucket.morning.push({
    id: "morning-meal-review",
    title: `${op.mealLabel || "Breakfast"} review`,
    detail: `${op.serviceLabel} — ${op.phase}`,
    href: "/dashboard",
    tone: op.phase === "Execution" && op.mealType === "BREAKFAST" ? "in_progress" : "neutral",
  });
  if (blocked.length > 0) {
    byBucket.morning.push({
      id: "morning-walk",
      title: "Walk locations needing attention",
      detail: `${blocked[0]!.unitName}: ${blocked[0]!.reason}`,
      href: `/unit/${blocked[0]!.unitId}`,
      tone: "warning",
    });
  } else if (op.mealType === "BREAKFAST" || hour < 11) {
    byBucket.morning.push({
      id: "morning-walk",
      title: "Walk Kitchen",
      detail: "Confirm morning locations are supportable",
      href: "/today/walk",
      tone: "neutral",
    });
  }
  if (staffingGaps > 0 || callDownOpen > 0) {
    byBucket.morning.push({
      id: "morning-staffing",
      title: "Verify staffing",
      detail:
        staffingGaps > 0
          ? `${staffingGaps} coverage gap${staffingGaps === 1 ? "" : "s"}`
          : `${callDownOpen} open call-down${callDownOpen === 1 ? "" : "s"}`,
      href: "/today/coverage",
      tone: "warning",
    });
  } else if (hour < 11) {
    byBucket.morning.push({
      id: "morning-staffing",
      title: "Verify staffing",
      detail: "Confirm AM coverage before service",
      href: "/today/coverage",
      tone: "neutral",
    });
  }

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
      tone: priorityOpen[0]!.priority === "URGENT" ? "blocked" : "warning",
    });
  }

  if (overdueInspections.length > 0 || dueInspections.length > 0) {
    const first = overdueInspections[0] ?? dueInspections[0]!;
    byBucket.afternoon.push({
      id: "afternoon-inspection",
      title: overdueInspections.length > 0 ? "Overdue inspection" : "Inspection due",
      detail: first.definitionName,
      href: inspectionFocusHref(first),
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
  }

  if (op.mealType === "DINNER") {
    byBucket.evening.push({
      id: "evening-dinner",
      title: "Dinner close review",
      detail: `${op.serviceLabel} — ${op.phase}`,
      href: "/dashboard",
      tone: "in_progress",
    });
  }
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

  return AGENDA_BUCKET_ORDER.map((id) => ({
    id,
    label: BUCKET_LABELS[id],
    isCurrent: id === current,
    temporal: classifyAgendaTemporal(id, current, hour),
    items: sortAgendaItems(byBucket[id]),
  }));
}
