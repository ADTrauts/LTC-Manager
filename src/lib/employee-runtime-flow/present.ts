/**
 * EmployeeRuntimeFlow → Neighborhood / SPACE employee presentation.
 * Labels and grouping only. Does not resolve OA, RLS, evidence, or next.
 */

import type { JobFlowLocationSequence } from "@/lib/dietary-job-flow/types";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import type { WorkRequirement } from "@/lib/department-work/types";
import { formatClock } from "@/lib/unit-workspace/space";

import { operationSummaryLabel } from "./operation";
import type {
  EmployeeEvidenceCategory,
  EmployeeRuntimeEvidenceItem,
  EmployeeRuntimeFlow,
  EmployeeRuntimeIssue,
  EmployeeRuntimeLocation,
  EmployeeRuntimeMilestone,
} from "./types";
import {
  EMPLOYEE_ASSIGNMENT_UNAVAILABLE_LABEL,
  EMPLOYEE_NO_ACTIVE_OPERATION_LABEL,
} from "./types";

export const EMPLOYEE_NO_CONFIRMED_ASSIGNMENT_LABEL = "No confirmed assignment";
export const EMPLOYEE_DEVICE_MISMATCH_LABEL = "Your assignment is in another location";
export const EMPLOYEE_STALE_BUNDLE_LABEL = "This tablet has stale data.";
export const EMPLOYEE_SPACE_NOT_ASSIGNED_LABEL = "This space is not part of your assignment";

export type EmployeeRuntimeGrain = "neighborhood" | "space";

export type EmployeeRuntimeEvidenceGroupId =
  | "needs_attention"
  | "due_now"
  | "upcoming"
  | "completed";

export type EmployeeRuntimePresentedItem = {
  id: string;
  kind: "work" | "evidence";
  label: string;
  stateLabel: string;
  spaceId: string | null;
  spaceName: string | null;
  href: string | null;
  actionLabel: string | null;
};

export type EmployeeRuntimePresentedSpace = {
  spaceId: string;
  name: string;
  href: string;
  operationLabel: string | null;
  attentionLabel: string | null;
};

export type EmployeeRuntimePresentedMilestone = {
  spaceId: string;
  spaceName: string;
  kind: EmployeeRuntimeMilestone["kind"];
  label: string;
  statusKey: string;
};

export type EmployeeRuntimePresentedIssue = {
  spaceId: string;
  spaceName: string;
  issueId: string;
  summary: string;
  impactLabel: string;
  href: string | null;
};

export type EmployeeRuntimeExperienceView = {
  grain: EmployeeRuntimeGrain;
  landingUnitId: string;
  spaceId: string | null;
  spaceAssigned: boolean;
  assignmentAvailability: EmployeeRuntimeFlow["assignmentAvailability"];
  assignmentTitle: string;
  roleLabel: string | null;
  locationSummary: string | null;
  operationLabel: string | null;
  currentAssignment: { roleLabel: string; locationSummary: string | null } | null;
  upcomingAssignment: { roleLabel: string; locationSummary: string | null; startsAtLabel: string | null } | null;
  next: { label: string; href: string | null } | null;
  locationNext: { label: string; timeLabel: string } | null;
  deviceMismatch: boolean;
  mismatchLabel: string | null;
  stale: boolean;
  showExecution: boolean;
  assignedSpaces: EmployeeRuntimePresentedSpace[];
  evsSequence: {
    now: { label: string; href: string } | null;
    next: { label: string; href: string } | null;
    queue: Array<{ label: string; href: string }>;
  } | null;
  work: EmployeeRuntimePresentedItem[];
  evidenceGroups: Array<{
    id: EmployeeRuntimeEvidenceGroupId;
    title: string;
    items: EmployeeRuntimePresentedItem[];
  }>;
  evidenceMode: EmployeeRuntimeFlow["evidenceMode"];
  milestones: EmployeeRuntimePresentedMilestone[];
  issues: EmployeeRuntimePresentedIssue[];
  plantMessages: string[];
  spaceNotAssignedLabel: string | null;
};

const IMPACT_LABEL = {
  SERVICE_AT_RISK: "Service at risk",
  EQUIPMENT_UNAVAILABLE: "Equipment unavailable",
  WORKAROUND_AVAILABLE: "Workaround available",
} as const;

const WORK_STATE_LABEL: Partial<Record<WorkRequirement["state"], string>> = {
  PAST_DUE_NOT_CONFIRMED: "Overdue",
  DUE: "Due now",
  CURRENT: "Due now",
  UPCOMING: "Upcoming",
  COMPLETED: "Completed",
  COMPLETED_WITH_EVIDENCE: "Completed",
};

const TEMPLATE_STATE_CATEGORY: Partial<Record<EvidenceRequirement["state"], EmployeeEvidenceCategory>> = {
  NOT_CONFIRMED: "needs_attention",
  NEEDS_REVIEW: "needs_attention",
  COMPLETED_WITH_CORRECTIVE_ACTION: "needs_attention",
  DUE: "due_now",
  UPCOMING: "upcoming",
  COMPLETED: "completed",
};

const CATEGORY_TITLE: Record<EmployeeRuntimeEvidenceGroupId, string> = {
  needs_attention: "Needs Attention",
  due_now: "Due Now",
  upcoming: "Upcoming",
  completed: "Completed",
};

const RECORDABLE_MILESTONES = new Set(["SERVERY_READY", "MEAL_SERVICE_STARTED", "KEY_TIME"]);

function locationNames(locations: readonly EmployeeRuntimeLocation[]): string | null {
  const names = locations.map((row) => row.displayName).filter(Boolean);
  if (names.length === 0) return null;
  return names.join(", ");
}

function assignmentLocationSummary(
  assignment: EmployeeRuntimeFlow["currentAssignment"],
  locations: readonly EmployeeRuntimeLocation[],
): string | null {
  if (assignment?.locationLabels && assignment.locationLabels.length > 0) {
    return assignment.locationLabels.join(", ");
  }
  return locationNames(locations) ?? assignment?.unitName ?? null;
}

function spaceHref(unitId: string, spaceId: string): string {
  return `/unit/${unitId}?space=${encodeURIComponent(spaceId)}`;
}

function harborHref(item: EmployeeRuntimeEvidenceItem): string {
  const params = new URLSearchParams({
    attachmentId: item.attachmentId,
    requirementKey: item.requirementKey,
  });
  if (item.spaceId) params.set("spaceId", item.spaceId);
  return `/staffing/logs/open?${params.toString()}`;
}

function templateHref(landingUnitId: string, item: Pick<EvidenceRequirement, "requirementKey" | "spaceId">): string {
  const unitId = landingUnitId;
  if (item.spaceId) {
    return `/unit/${unitId}?space=${encodeURIComponent(item.spaceId)}&evidence=${encodeURIComponent(item.requirementKey)}`;
  }
  return `/unit/${unitId}?evidence=${encodeURIComponent(item.requirementKey)}`;
}

function workHref(landingUnitId: string, row: WorkRequirement): string {
  if (row.spaceId) {
    return `/unit/${landingUnitId}?space=${encodeURIComponent(row.spaceId)}&work=${encodeURIComponent(row.occurrenceKey)}`;
  }
  return `/unit/${landingUnitId}?work=${encodeURIComponent(row.occurrenceKey)}`;
}

function linkedEvidenceHref(
  flow: EmployeeRuntimeFlow,
  landingUnitId: string,
  row: WorkRequirement,
): string | null {
  const key = row.linkedTemplateStableKey?.trim();
  if (!key || row.completionMode !== "LINKED_EVIDENCE") return null;
  if (flow.evidenceMode === "harbor") {
    const match = flow.evidence.find((item) => item.catalogStableKey === key);
    if (match) return harborHref(match);
  }
  if (flow.evidenceMode === "template") {
    const match = flow.templateEvidence.find(
      (item) => item.templateStableKey === key || item.requirementKey === key,
    );
    if (match) return templateHref(landingUnitId, match);
  }
  return templateHref(landingUnitId, { requirementKey: key, spaceId: row.spaceId });
}

function workAction(row: WorkRequirement): string {
  if (row.completionMode === "LINKED_EVIDENCE") return "Record";
  return "Complete";
}

function evidenceAction(category: EmployeeEvidenceCategory, completedHref: boolean): string | null {
  if (category === "completed") return completedHref ? "View" : null;
  if (category === "upcoming") return "Open";
  return "Start";
}

function spaceNameFor(
  spaceId: string | null,
  locations: readonly EmployeeRuntimeLocation[],
): string | null {
  if (!spaceId) return null;
  return locations.find((row) => row.spaceId === spaceId)?.displayName ?? null;
}

function presentWork(
  flow: EmployeeRuntimeFlow,
  landingUnitId: string,
  spaceFilter: string | null,
): EmployeeRuntimePresentedItem[] {
  return flow.work
    .filter((row) => (spaceFilter ? row.spaceId === spaceFilter : true))
    .filter((row) => WORK_STATE_LABEL[row.state])
    .map((row) => {
      const linked = linkedEvidenceHref(flow, landingUnitId, row);
      const href = linked ?? workHref(landingUnitId, row);
      return {
        id: row.occurrenceKey,
        kind: "work" as const,
        label: row.label,
        stateLabel: WORK_STATE_LABEL[row.state] ?? row.state,
        spaceId: row.spaceId,
        spaceName: spaceNameFor(row.spaceId, flow.locations),
        href,
        actionLabel: workAction(row),
      };
    });
}

function presentHarborEvidence(
  flow: EmployeeRuntimeFlow,
  spaceFilter: string | null,
): EmployeeRuntimePresentedItem[] {
  return flow.evidence
    .filter((row) => (spaceFilter ? row.spaceId === spaceFilter : true))
    .map((row) => {
      const href =
        row.category === "completed" && row.href
          ? row.href
          : harborHref(row);
      return {
        id: `${row.attachmentId}:${row.requirementKey}`,
        kind: "evidence" as const,
        label: row.displayName,
        stateLabel:
          row.category === "needs_attention"
            ? row.productState === "OVERDUE"
              ? "Overdue"
              : "Needs attention"
            : row.category === "due_now"
              ? "Due now"
              : row.category === "upcoming"
                ? "Upcoming"
                : "Completed",
        spaceId: row.spaceId,
        spaceName: spaceNameFor(row.spaceId, flow.locations),
        href,
        actionLabel: evidenceAction(row.category, Boolean(row.href || row.recordId)),
      };
    });
}

function presentTemplateEvidence(
  flow: EmployeeRuntimeFlow,
  landingUnitId: string,
  spaceFilter: string | null,
): EmployeeRuntimePresentedItem[] {
  return flow.templateEvidence
    .filter((row) => (spaceFilter ? row.spaceId === spaceFilter : true))
    .filter((row) => TEMPLATE_STATE_CATEGORY[row.state])
    .map((row) => {
      const category = TEMPLATE_STATE_CATEGORY[row.state]!;
      return {
        id: row.requirementKey,
        kind: "evidence" as const,
        label: row.templateName,
        stateLabel:
          category === "needs_attention"
            ? "Needs attention"
            : category === "due_now"
              ? "Due now"
              : category === "upcoming"
                ? "Upcoming"
                : "Completed",
        spaceId: row.spaceId,
        spaceName: spaceNameFor(row.spaceId, flow.locations),
        href: templateHref(landingUnitId, row),
        actionLabel: evidenceAction(category, false),
      };
    });
}

function groupEvidence(items: EmployeeRuntimePresentedItem[]): EmployeeRuntimeExperienceView["evidenceGroups"] {
  const order: EmployeeRuntimeEvidenceGroupId[] = [
    "needs_attention",
    "due_now",
    "upcoming",
    "completed",
  ];
  const byCategory = new Map<EmployeeRuntimeEvidenceGroupId, EmployeeRuntimePresentedItem[]>();
  for (const item of items) {
    const id: EmployeeRuntimeEvidenceGroupId =
      item.stateLabel === "Overdue" || item.stateLabel === "Needs attention"
        ? "needs_attention"
        : item.stateLabel === "Due now"
          ? "due_now"
          : item.stateLabel === "Upcoming"
            ? "upcoming"
            : "completed";
    const list = byCategory.get(id) ?? [];
    list.push(item);
    byCategory.set(id, list);
  }
  return order
    .filter((id) => (byCategory.get(id) ?? []).length > 0)
    .map((id) => ({
      id,
      title: CATEGORY_TITLE[id],
      items: byCategory.get(id) ?? [],
    }));
}

function presentMilestones(
  rows: readonly EmployeeRuntimeMilestone[],
  spaceFilter: string | null,
): EmployeeRuntimePresentedMilestone[] {
  return rows
    .filter((row) => (spaceFilter ? row.spaceId === spaceFilter : true))
    .filter((row) => {
      if (!RECORDABLE_MILESTONES.has(row.kind)) return false;
      return (
        row.statusKey === "not_recorded" ||
        row.statusKey === "overdue" ||
        row.statusKey === "completed_late"
      );
    })
    .map((row) => ({
      spaceId: row.spaceId,
      spaceName: row.spaceName,
      kind: row.kind,
      label: row.label,
      statusKey: row.statusKey,
    }));
}

function presentIssues(
  rows: readonly EmployeeRuntimeIssue[],
  spaceFilter: string | null,
): EmployeeRuntimePresentedIssue[] {
  return rows
    .filter((row) => (spaceFilter ? row.spaceId === spaceFilter : true))
    .map((row) => ({
      spaceId: row.spaceId,
      spaceName: row.spaceName,
      issueId: row.issueId,
      summary: row.summary,
      impactLabel: IMPACT_LABEL[row.impact as keyof typeof IMPACT_LABEL] ?? row.impact,
      href: row.href,
    }));
}

function spaceAttention(
  flow: EmployeeRuntimeFlow,
  spaceId: string,
): string | null {
  const overdueWork = flow.work.find(
    (row) => row.spaceId === spaceId && row.state === "PAST_DUE_NOT_CONFIRMED",
  );
  if (overdueWork) return `${overdueWork.label} overdue`;
  const overdueEvidence = flow.evidence.find(
    (row) => row.spaceId === spaceId && row.productState === "OVERDUE",
  );
  if (overdueEvidence) return `${overdueEvidence.displayName} overdue`;
  const dueWork = flow.work.find(
    (row) => row.spaceId === spaceId && (row.state === "DUE" || row.state === "CURRENT"),
  );
  if (dueWork) return `${dueWork.label} due now`;
  const dueEvidence = flow.evidence.find(
    (row) => row.spaceId === spaceId && row.category === "due_now",
  );
  if (dueEvidence) return `${dueEvidence.displayName} due now`;
  const dueTemplate = flow.templateEvidence.find(
    (row) => row.spaceId === spaceId && row.state === "DUE",
  );
  if (dueTemplate) return `${dueTemplate.templateName} due now`;
  return "No work currently due";
}

function nextHref(
  flow: EmployeeRuntimeFlow,
  landingUnitId: string,
  work: EmployeeRuntimePresentedItem[],
  evidence: EmployeeRuntimePresentedItem[],
): string | null {
  const next = flow.next;
  if (next.kind === "none") return null;
  if (next.kind.endsWith("_work")) {
    return work.find((row) => row.id === next.sourceId)?.href ?? null;
  }
  if (next.kind.endsWith("_evidence")) {
    return evidence.find((row) => row.id.endsWith(next.sourceId) || row.id === next.sourceId)?.href ?? null;
  }
  if (next.spaceId) return spaceHref(landingUnitId, next.spaceId);
  return null;
}

export function presentEmployeeRuntimeExperience(input: {
  flow: EmployeeRuntimeFlow;
  grain: EmployeeRuntimeGrain;
  landingUnitId: string;
  spaceId?: string | null;
  timezone: string;
  locationSequence?: JobFlowLocationSequence | null;
  plantMessages?: readonly string[];
}): EmployeeRuntimeExperienceView {
  const { flow, grain, landingUnitId, timezone } = input;
  const spaceId = input.spaceId ?? null;
  const spaceAssigned = spaceId ? flow.responsibility.assignedSpaceIds.includes(spaceId) : true;
  const showExecution =
    flow.assignmentAvailability === "evaluated" && !flow.device.mismatch && spaceAssigned;
  const effectiveFilter = showExecution ? (grain === "space" ? spaceId : null) : "__none__";

  const work = showExecution ? presentWork(flow, landingUnitId, effectiveFilter) : [];
  const evidenceItems = showExecution
    ? flow.evidenceMode === "harbor"
      ? presentHarborEvidence(flow, effectiveFilter)
      : flow.evidenceMode === "template"
        ? presentTemplateEvidence(flow, landingUnitId, effectiveFilter)
        : []
    : [];

  const current = flow.currentAssignment;
  const upcoming = flow.upcomingAssignment;
  const locationSummary = assignmentLocationSummary(current ?? upcoming, flow.locations);
  const upcomingSummary = assignmentLocationSummary(upcoming, flow.locations);

  let assignmentTitle = "Your responsibility";
  if (flow.assignmentAvailability === "unavailable") {
    assignmentTitle = EMPLOYEE_ASSIGNMENT_UNAVAILABLE_LABEL;
  } else if (flow.assignmentAvailability === "no_confirmed_assignment") {
    assignmentTitle = EMPLOYEE_NO_CONFIRMED_ASSIGNMENT_LABEL;
  } else if (!current && upcoming) {
    assignmentTitle = "Upcoming assignment";
  }

  const assignedSpaces = showExecution
    ? flow.locations.map((row) => ({
        spaceId: row.spaceId,
        name: row.displayName,
        href: spaceHref(row.unitId ?? landingUnitId, row.spaceId),
        operationLabel: row.operationLabel,
        attentionLabel: spaceAttention(flow, row.spaceId),
      }))
    : [];

  const evsSequence =
    showExecution && input.locationSequence
      ? {
          now: input.locationSequence.now
            ? {
                label: input.locationSequence.now.label,
                href: spaceHref(landingUnitId, input.locationSequence.now.unitSpaceId),
              }
            : null,
          next: input.locationSequence.next
            ? {
                label: input.locationSequence.next.label,
                href: spaceHref(landingUnitId, input.locationSequence.next.unitSpaceId),
              }
            : null,
          queue: input.locationSequence.queue.map((row) => ({
            label: row.label,
            href: spaceHref(landingUnitId, row.unitSpaceId),
          })),
        }
      : null;

  return {
    grain,
    landingUnitId,
    spaceId,
    spaceAssigned,
    assignmentAvailability: flow.assignmentAvailability,
    assignmentTitle,
    roleLabel: flow.responsibility.roleLabel,
    locationSummary,
    operationLabel:
      flow.operation.kind === "none" ? EMPLOYEE_NO_ACTIVE_OPERATION_LABEL : operationSummaryLabel(flow.operation),
    currentAssignment: current
      ? {
          roleLabel: current.roleLabel,
          locationSummary: assignmentLocationSummary(current, flow.locations),
        }
      : null,
    upcomingAssignment: upcoming
      ? {
          roleLabel: upcoming.roleLabel,
          locationSummary: upcomingSummary,
          startsAtLabel: upcoming.startsAt ? formatClock(upcoming.startsAt, timezone) : null,
        }
      : null,
    next:
      showExecution && flow.next.kind !== "none"
        ? {
            label: flow.next.label,
            href: nextHref(flow, landingUnitId, work, evidenceItems),
          }
        : null,
    locationNext:
      showExecution && flow.locationNext
        ? {
            label: flow.locationNext.label,
            timeLabel: formatClock(flow.locationNext.at, timezone),
          }
        : null,
    deviceMismatch: flow.device.mismatch,
    mismatchLabel: flow.device.mismatch ? EMPLOYEE_DEVICE_MISMATCH_LABEL : null,
    stale: flow.offline.stale,
    showExecution,
    assignedSpaces,
    evsSequence,
    work,
    evidenceGroups: groupEvidence(evidenceItems),
    evidenceMode: flow.evidenceMode,
    milestones: showExecution ? presentMilestones(flow.milestones, effectiveFilter) : [],
    issues: showExecution ? presentIssues(flow.issues, effectiveFilter) : [],
    plantMessages: showExecution ? [...(input.plantMessages ?? [])] : [],
    spaceNotAssignedLabel:
      grain === "space" && spaceId && !spaceAssigned ? EMPLOYEE_SPACE_NOT_ASSIGNED_LABEL : null,
  };
}
