import { LogSubmissionStatus, type MealType, type RepairPriority } from "@prisma/client";

import { fmtMealLabel } from "@/lib/operations-center";
import { issueTypeLabel } from "@/lib/repair-routing";
import { pickDefaultMealTypeForUnitSlots } from "@/lib/servery-meal-service";
import { formatDueTimeLabel } from "@/lib/work/inspections/inspection-cadence";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";

import type { UnitQueryResult } from "./load-unit-queries";
import type { UnitWorkspaceMealServiceEventToday, UnitWorkspaceUnit } from "./types";
import {
  INSPECTION_DUE_NOW_LEAD_MS,
  INSPECTION_UPCOMING_WINDOW_MS,
  UNIT_WORK_QUEUE_PRIORITY,
} from "./work-queue-priority";

export type UnitWorkQueueKind =
  | "failed-log"
  | "missed-log"
  | "pending-log"
  | "servery-ready"
  | "servery-started"
  | "urgent-repair"
  | "high-repair"
  | "repair"
  | "inspection-follow-up"
  | "inspection-overdue"
  | "inspection-due"
  | "inspection-upcoming"
  | "available-inspection"
  | "secondary";

export type UnitWorkQueueItem = {
  id: string;
  kind: UnitWorkQueueKind;
  priority: number;
  title: string;
  detail: string;
  href: string | null;
};

export type UnitWorkQueue = {
  items: UnitWorkQueueItem[];
  primaryItem: UnitWorkQueueItem | null;
  operationalCount: number;
};

type AssignmentRow = UnitQueryResult["assignments"][number];
type SubmissionRow = UnitQueryResult["submissions"][number];
type RepairRow = UnitQueryResult["openRepairs"][number];

function submissionsForAssignment(assignment: AssignmentRow, submissions: SubmissionRow[]) {
  return submissions.filter((submission) => submission.template.name === assignment.template.name);
}

function pushLogWorkItems(
  items: UnitWorkQueueItem[],
  assignments: AssignmentRow[],
  submissions: SubmissionRow[],
) {
  for (const assignment of assignments) {
    const related = submissionsForAssignment(assignment, submissions);

    for (const submission of related) {
      if (submission.status === LogSubmissionStatus.FAILED) {
        items.push({
          id: `failed-log:${submission.id}`,
          kind: "failed-log",
          priority: UNIT_WORK_QUEUE_PRIORITY.FAILED_LOG,
          title: `Re-submit ${assignment.template.name}`,
          detail: "Required log failed today",
          href: `/logs?tab=submit&assignmentId=${assignment.id}`,
        });
      }
      if (submission.status === LogSubmissionStatus.MISSED) {
        items.push({
          id: `missed-log:${submission.id}`,
          kind: "missed-log",
          priority: UNIT_WORK_QUEUE_PRIORITY.MISSED_LOG,
          title: `Complete missed ${assignment.template.name}`,
          detail: "Required log was missed today",
          href: `/logs?tab=submit&assignmentId=${assignment.id}`,
        });
      }
    }

    const remaining = assignment.timesPerDay - related.length;
    if (remaining > 0) {
      items.push({
        id: `pending-log:${assignment.id}`,
        kind: "pending-log",
        priority: UNIT_WORK_QUEUE_PRIORITY.PENDING_LOG,
        title: `Submit ${assignment.template.name}`,
        detail: remaining === 1 ? "1 submission due today" : `${remaining} submissions due today`,
        href: `/logs?tab=submit&assignmentId=${assignment.id}`,
      });
    }
  }
}

function pushServeryWorkItems(
  items: UnitWorkQueueItem[],
  unit: UnitWorkspaceUnit,
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>,
  now: Date,
) {
  if (unit.unitType !== "SERVERY" || unit.mealTimes.length === 0) {
    return;
  }

  const activeMeal = pickDefaultMealTypeForUnitSlots(
    unit.mealTimes.map((slot) => slot.mealType),
    now,
  );
  const hasSlot = unit.mealTimes.some((slot) => slot.mealType === activeMeal);
  if (!hasSlot) {
    return;
  }

  const event = mealServiceEventByMeal.get(activeMeal);
  const mealLabel = fmtMealLabel(activeMeal);

  if (!event?.mealServiceReadyAt) {
    items.push({
      id: `servery-ready:${activeMeal}`,
      kind: "servery-ready",
      priority: UNIT_WORK_QUEUE_PRIORITY.SERVERY_READY,
      title: `Mark ${mealLabel} ready`,
      detail: "Record meal service ready time in the header controls",
      href: null,
    });
    return;
  }

  if (!event.mealServiceStartedAt) {
    items.push({
      id: `servery-started:${activeMeal}`,
      kind: "servery-started",
      priority: UNIT_WORK_QUEUE_PRIORITY.SERVERY_STARTED,
      title: `Mark ${mealLabel} started`,
      detail: "Record meal service started time in the header controls",
      href: null,
    });
  }
}

function repairPriority(priority: RepairPriority): number {
  if (priority === "URGENT") return UNIT_WORK_QUEUE_PRIORITY.URGENT_REPAIR;
  if (priority === "HIGH") return UNIT_WORK_QUEUE_PRIORITY.HIGH_REPAIR;
  return UNIT_WORK_QUEUE_PRIORITY.OTHER_REPAIR;
}

function repairKind(priority: RepairPriority): UnitWorkQueueKind {
  if (priority === "URGENT") return "urgent-repair";
  if (priority === "HIGH") return "high-repair";
  return "repair";
}

function pushRepairWorkItems(items: UnitWorkQueueItem[], repairs: RepairRow[]) {
  for (const repair of repairs) {
    const typeLabel =
      "issueType" in repair && repair.issueType
        ? issueTypeLabel(repair.issueType as never)
        : null;
    items.push({
      id: `repair:${repair.id}`,
      kind: repairKind(repair.priority),
      priority: repairPriority(repair.priority),
      title: `${repair.repairCode} · ${repair.title}`,
      detail: [typeLabel, repair.priority, repair.status].filter(Boolean).join(" · "),
      href: issueDetailPath(repair.id),
    });
  }
}

function pushSecondaryWorkItems(
  items: UnitWorkQueueItem[],
  unit: UnitWorkspaceUnit,
  activeLogTab: string | null,
) {
  if (unit.unitType === "SERVERY") {
    items.push({
      id: "secondary:service-log",
      kind: "secondary",
      priority: UNIT_WORK_QUEUE_PRIORITY.SECONDARY,
      title: "Review service log",
      detail: "Meal ready and started history for this servery",
      href: `/unit/${unit.id}?unitTab=logs&logTab=service-log`,
    });
  } else if (activeLogTab) {
    items.push({
      id: "secondary:unit-logs",
      kind: "secondary",
      priority: UNIT_WORK_QUEUE_PRIORITY.SECONDARY,
      title: "Review log history",
      detail: "Recent submissions by category",
      href: `/unit/${unit.id}?unitTab=logs${activeLogTab ? `&logTab=${encodeURIComponent(activeLogTab)}` : ""}`,
    });
  }
}

function pushScheduledInspectionWorkItems(
  items: UnitWorkQueueItem[],
  unitId: string,
  scheduled: Array<{
    id: string;
    definitionId: string;
    definitionName: string;
    dueAt: Date;
    dueTimeLocal: string | null;
  }>,
  now: Date,
) {
  for (const row of scheduled) {
    const msUntilDue = row.dueAt.getTime() - now.getTime();
    let kind: UnitWorkQueueKind;
    let priority: number;
    let detail: string;

    if (msUntilDue < 0) {
      kind = "inspection-overdue";
      priority = UNIT_WORK_QUEUE_PRIORITY.INSPECTION_OVERDUE;
      detail = "Inspection overdue";
    } else if (msUntilDue <= INSPECTION_DUE_NOW_LEAD_MS) {
      kind = "inspection-due";
      priority = UNIT_WORK_QUEUE_PRIORITY.INSPECTION_DUE_NOW;
      detail = `Due by ${formatDueTimeLabel(row.dueTimeLocal)}`;
    } else if (msUntilDue <= INSPECTION_UPCOMING_WINDOW_MS) {
      kind = "inspection-upcoming";
      priority = UNIT_WORK_QUEUE_PRIORITY.INSPECTION_UPCOMING;
      detail = `Upcoming at ${formatDueTimeLabel(row.dueTimeLocal)}`;
    } else {
      continue;
    }

    items.push({
      id: `scheduled-inspection:${row.id}`,
      kind,
      priority,
      title: `Complete ${row.definitionName}`,
      detail,
      href: `/unit/${unitId}?unitTab=overview&inspect=${row.definitionId}&occurrence=${row.id}`,
    });
  }
}

function pushInspectionFollowUpWorkItems(
  items: UnitWorkQueueItem[],
  unitId: string,
  followUps: Array<{ id: string; title: string; status: string }>,
) {
  for (const followUp of followUps) {
    if (followUp.status !== "OPEN" && followUp.status !== "IN_PROGRESS") continue;
    items.push({
      id: `inspection-follow-up:${followUp.id}`,
      kind: "inspection-follow-up",
      priority: UNIT_WORK_QUEUE_PRIORITY.INSPECTION_FOLLOW_UP,
      title: followUp.title,
      detail:
        followUp.status === "IN_PROGRESS"
          ? "Corrective work is in progress"
          : "Follow-up needed from inspection",
      href: `/unit/${unitId}?unitTab=overview&followUpTask=${followUp.id}`,
    });
  }
}

function pushInspectionWorkItems(
  items: UnitWorkQueueItem[],
  unitId: string,
  inspections: Array<{ id: string; name: string; itemCount: number; frequency: string | null }>,
) {
  for (const inspection of inspections) {
    items.push({
      id: `available-inspection:${inspection.id}`,
      kind: "available-inspection",
      priority: UNIT_WORK_QUEUE_PRIORITY.AVAILABLE_INSPECTION,
      title: `Complete ${inspection.name}`,
      detail: inspection.frequency
        ? `${inspection.itemCount} checks · ${inspection.frequency} (available — not auto-due)`
        : `${inspection.itemCount} checks available (not auto-due)`,
      href: `/unit/${unitId}?unitTab=overview&inspect=${inspection.id}`,
    });
  }
}

export function buildUnitWorkQueue(input: {
  unit: UnitWorkspaceUnit;
  queries: Pick<UnitQueryResult, "assignments" | "submissions" | "openRepairs">;
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>;
  activeLogTab: string | null;
  availableInspections?: Array<{ id: string; name: string; itemCount: number; frequency: string | null }>;
  openInspectionFollowUps?: Array<{ id: string; title: string; status: string }>;
  scheduledInspections?: Array<{
    id: string;
    definitionId: string;
    definitionName: string;
    dueAt: Date;
    dueTimeLocal: string | null;
  }>;
  now?: Date;
}): UnitWorkQueue {
  const now = input.now ?? new Date();
  const items: UnitWorkQueueItem[] = [];

  pushLogWorkItems(items, input.queries.assignments, input.queries.submissions);
  pushServeryWorkItems(items, input.unit, input.mealServiceEventByMeal, now);
  pushRepairWorkItems(items, input.queries.openRepairs);
  pushScheduledInspectionWorkItems(items, input.unit.id, input.scheduledInspections ?? [], now);
  pushInspectionFollowUpWorkItems(items, input.unit.id, input.openInspectionFollowUps ?? []);

  const scheduledDefinitionIds = new Set(
    (input.scheduledInspections ?? []).map((row) => row.definitionId),
  );
  const availableWithoutOpenSchedule = (input.availableInspections ?? []).filter(
    (inspection) => !scheduledDefinitionIds.has(inspection.id),
  );
  pushInspectionWorkItems(items, input.unit.id, availableWithoutOpenSchedule);
  pushSecondaryWorkItems(items, input.unit, input.activeLogTab);

  const sorted = items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.title.localeCompare(b.title);
  });

  const operational = sorted.filter((item) => item.priority < UNIT_WORK_QUEUE_PRIORITY.SECONDARY);
  const primaryItem = operational[0] ?? null;

  return {
    items: sorted,
    primaryItem,
    operationalCount: operational.length,
  };
}
