import { getFacilityLocalParts } from "@/lib/operational-time";

import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";
import type {
  ManagementAgendaBucket,
  ManagementAgendaBucketId,
  ManagementAgendaItem,
  ManagementAgendaTemporal,
  WorkspaceContext,
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
 * When a department context is set, generates department-appropriate items:
 * - Dietary: meal service, kitchen walk, dietary staffing
 * - EVS: rounds/cleaning, discharge priorities, EVS staffing
 * - Plant: asset checks, PM work, work-order follow-up
 * - Facility/null: facility-wide meal-focused items (existing behavior)
 */
export function buildManagementAgenda(
  inputs: BusinessWorkspaceInputs,
  context?: WorkspaceContext,
): ManagementAgendaBucket[] {
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
  const deptKey = context?.mode === "department" ? context.departmentKey : null;

  const byBucket: Record<ManagementAgendaBucketId, ManagementAgendaItem[]> = {
    morning: [],
    midday: [],
    afternoon: [],
    evening: [],
  };

  if (deptKey === "EVS") {
    buildEvsAgenda(byBucket, { hour, staffingGaps, callDownOpen, blocked, overdueInspections, dueInspections, priorityOpen, recovery, knowledgeRecent });
  } else if (deptKey === "PLANT") {
    buildPlantAgenda(byBucket, { hour, staffingGaps, callDownOpen, blocked, overdueInspections, dueInspections, priorityOpen, recovery, knowledgeRecent });
  } else if (deptKey === "DIETARY") {
    buildDietaryAgenda(byBucket, { op, hour, staffingGaps, callDownOpen, blocked, overdueInspections, dueInspections, priorityOpen, recovery, knowledgeRecent });
  } else {
    buildFacilityAgenda(byBucket, { op, hour, staffingGaps, callDownOpen, blocked, overdueInspections, dueInspections, priorityOpen, recovery, knowledgeRecent });
  }

  return AGENDA_BUCKET_ORDER.map((id) => ({
    id,
    label: BUCKET_LABELS[id],
    isCurrent: id === current,
    temporal: classifyAgendaTemporal(id, current, hour),
    items: sortAgendaItems(byBucket[id]),
  }));
}

type AgendaSignals = {
  hour: number;
  staffingGaps: number;
  callDownOpen: number;
  blocked: BusinessWorkspaceInputs["readiness"]["items"];
  overdueInspections: BusinessWorkspaceInputs["inspectionsDue"];
  dueInspections: BusinessWorkspaceInputs["inspectionsDue"];
  priorityOpen: BusinessWorkspaceInputs["openRepairs"];
  recovery: BusinessWorkspaceInputs["openRepairs"];
  knowledgeRecent: BusinessWorkspaceInputs["activity"]["knowledgePublished"][number] | undefined;
};

type DietarySignals = AgendaSignals & {
  op: BusinessWorkspaceInputs["dashboard"]["operationContext"];
};

function addSharedAfternoonEvening(
  byBucket: Record<ManagementAgendaBucketId, ManagementAgendaItem[]>,
  s: AgendaSignals,
): void {
  if (s.overdueInspections.length > 0 || s.dueInspections.length > 0) {
    const first = s.overdueInspections[0] ?? s.dueInspections[0]!;
    byBucket.afternoon.push({
      id: "afternoon-inspection",
      title: s.overdueInspections.length > 0 ? "Overdue inspection" : "Inspection due",
      detail: first.definitionName,
      href: inspectionFocusHref(first),
      tone: s.overdueInspections.length > 0 ? "blocked" : "warning",
    });
  }
  if (s.recovery.length > 0 || s.priorityOpen.length > 0) {
    const row = s.recovery[0] ?? s.priorityOpen[0]!;
    byBucket.afternoon.push({
      id: "afternoon-repair",
      title: "Repair follow-up",
      detail: row.title,
      href: `/issues/${row.id}`,
      tone: s.recovery.length > 0 ? "in_progress" : "warning",
    });
  }
  if (s.knowledgeRecent) {
    byBucket.afternoon.push({
      id: "afternoon-knowledge",
      title: "Knowledge review",
      detail: s.knowledgeRecent.title,
      href: "/admin/knowledge",
      tone: "neutral",
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
      s.callDownOpen > 0
        ? `${s.callDownOpen} still open`
        : "Confirm coverage notes before close",
    href: "/today/coverage",
    tone: s.callDownOpen > 0 ? "warning" : "neutral",
  });
}

function addSharedStaffing(
  byBucket: Record<ManagementAgendaBucketId, ManagementAgendaItem[]>,
  bucket: ManagementAgendaBucketId,
  s: AgendaSignals,
  routineLabel: string,
): void {
  if (s.staffingGaps > 0 || s.callDownOpen > 0) {
    byBucket[bucket].push({
      id: `${bucket}-staffing`,
      title: "Verify staffing",
      detail:
        s.staffingGaps > 0
          ? `${s.staffingGaps} coverage gap${s.staffingGaps === 1 ? "" : "s"}`
          : `${s.callDownOpen} open call-down${s.callDownOpen === 1 ? "" : "s"}`,
      href: "/today/coverage",
      tone: "warning",
    });
  } else if (s.hour < 11) {
    byBucket[bucket].push({
      id: `${bucket}-staffing`,
      title: "Verify staffing",
      detail: routineLabel,
      href: "/today/coverage",
      tone: "neutral",
    });
  }
}

function buildDietaryAgenda(
  byBucket: Record<ManagementAgendaBucketId, ManagementAgendaItem[]>,
  s: DietarySignals,
): void {
  byBucket.morning.push({
    id: "morning-meal-review",
    title: `${s.op.mealLabel || "Breakfast"} review`,
    detail: `${s.op.serviceLabel} — ${s.op.phase}`,
    href: "/dashboard",
    tone: s.op.phase === "Execution" && s.op.mealType === "BREAKFAST" ? "in_progress" : "neutral",
  });
  if (s.blocked.length > 0) {
    byBucket.morning.push({
      id: "morning-walk",
      title: "Walk locations needing attention",
      detail: `${s.blocked[0]!.unitName}: ${s.blocked[0]!.reason}`,
      href: `/unit/${s.blocked[0]!.unitId}`,
      tone: "warning",
    });
  } else if (s.op.mealType === "BREAKFAST" || s.hour < 11) {
    byBucket.morning.push({
      id: "morning-walk",
      title: "Walk Kitchen",
      detail: "Confirm morning locations are supportable",
      href: "/today/walk",
      tone: "neutral",
    });
  }
  addSharedStaffing(byBucket, "morning", s, "Confirm AM coverage before service");

  byBucket.midday.push({
    id: "midday-meal",
    title: "Lunch service check",
    detail: s.op.mealType === "LUNCH" ? `${s.op.phase} · current focus` : "Midday service posture",
    href: "/dashboard",
    tone: s.op.mealType === "LUNCH" ? "in_progress" : "neutral",
  });
  if (s.priorityOpen.length > 0) {
    byBucket.midday.push({
      id: "midday-issues",
      title: "Priority issue follow-up",
      detail: `${s.priorityOpen[0]!.title}`,
      href: `/issues/${s.priorityOpen[0]!.id}`,
      tone: s.priorityOpen[0]!.priority === "URGENT" ? "blocked" : "warning",
    });
  }

  addSharedAfternoonEvening(byBucket, s);
  if (s.op.mealType === "DINNER") {
    byBucket.evening.unshift({
      id: "evening-dinner",
      title: "Dinner close review",
      detail: `${s.op.serviceLabel} — ${s.op.phase}`,
      href: "/dashboard",
      tone: "in_progress",
    });
  }
}

function buildEvsAgenda(
  byBucket: Record<ManagementAgendaBucketId, ManagementAgendaItem[]>,
  s: AgendaSignals,
): void {
  byBucket.morning.push({
    id: "morning-rounds",
    title: "Morning rounds check",
    detail: "Confirm cleaning assignments and area readiness",
    href: "/today/walk",
    tone: "neutral",
  });
  if (s.blocked.length > 0) {
    byBucket.morning.push({
      id: "morning-walk",
      title: "Walk areas needing attention",
      detail: `${s.blocked[0]!.unitName}: ${s.blocked[0]!.reason}`,
      href: `/unit/${s.blocked[0]!.unitId}`,
      tone: "warning",
    });
  }
  addSharedStaffing(byBucket, "morning", s, "Confirm EVS coverage before rounds");

  byBucket.midday.push({
    id: "midday-cleaning",
    title: "Midday cleaning review",
    detail: "Review discharge and terminal cleaning priorities",
    href: "/today/walk",
    tone: "neutral",
  });
  if (s.priorityOpen.length > 0) {
    byBucket.midday.push({
      id: "midday-issues",
      title: "Priority issue follow-up",
      detail: `${s.priorityOpen[0]!.title}`,
      href: `/issues/${s.priorityOpen[0]!.id}`,
      tone: s.priorityOpen[0]!.priority === "URGENT" ? "blocked" : "warning",
    });
  }

  addSharedAfternoonEvening(byBucket, s);
}

function buildPlantAgenda(
  byBucket: Record<ManagementAgendaBucketId, ManagementAgendaItem[]>,
  s: AgendaSignals,
): void {
  byBucket.morning.push({
    id: "morning-asset-check",
    title: "Asset availability review",
    detail: "Confirm critical assets are operational",
    href: "/assets",
    tone: "neutral",
  });
  if (s.blocked.length > 0) {
    byBucket.morning.push({
      id: "morning-walk",
      title: "Walk areas needing attention",
      detail: `${s.blocked[0]!.unitName}: ${s.blocked[0]!.reason}`,
      href: `/unit/${s.blocked[0]!.unitId}`,
      tone: "warning",
    });
  }
  addSharedStaffing(byBucket, "morning", s, "Confirm Plant coverage before shifts");

  byBucket.midday.push({
    id: "midday-pm",
    title: "PM work review",
    detail: "Check preventive maintenance due today",
    href: "/issues",
    tone: "neutral",
  });
  if (s.priorityOpen.length > 0) {
    byBucket.midday.push({
      id: "midday-issues",
      title: "Work-order follow-up",
      detail: `${s.priorityOpen[0]!.title}`,
      href: `/issues/${s.priorityOpen[0]!.id}`,
      tone: s.priorityOpen[0]!.priority === "URGENT" ? "blocked" : "warning",
    });
  }

  addSharedAfternoonEvening(byBucket, s);
}

function buildFacilityAgenda(
  byBucket: Record<ManagementAgendaBucketId, ManagementAgendaItem[]>,
  s: DietarySignals,
): void {
  byBucket.morning.push({
    id: "morning-facility-review",
    title: "Facility operations review",
    detail: "Review department readiness across all areas",
    href: "/dashboard",
    tone: "neutral",
  });
  if (s.blocked.length > 0) {
    byBucket.morning.push({
      id: "morning-walk",
      title: "Walk locations needing attention",
      detail: `${s.blocked[0]!.unitName}: ${s.blocked[0]!.reason}`,
      href: `/unit/${s.blocked[0]!.unitId}`,
      tone: "warning",
    });
  }
  addSharedStaffing(byBucket, "morning", s, "Confirm coverage across departments");

  if (s.priorityOpen.length > 0) {
    byBucket.midday.push({
      id: "midday-issues",
      title: "Priority issue follow-up",
      detail: `${s.priorityOpen[0]!.title}`,
      href: `/issues/${s.priorityOpen[0]!.id}`,
      tone: s.priorityOpen[0]!.priority === "URGENT" ? "blocked" : "warning",
    });
  }
  byBucket.midday.push({
    id: "midday-departments",
    title: "Department status check",
    detail: "Review Dietary, EVS, and Plant progress",
    href: "/today/walk",
    tone: "neutral",
  });

  addSharedAfternoonEvening(byBucket, s);
}
