/**
 * EmployeeRuntimeFlow → Neighborhood / SPACE employee presentation.
 * Phase 2C-2C: primary normalized source is flow.items. Parallel collections
 * enrich href/actions only — they must not create duplicate visible rows.
 * Labels and grouping only. Does not resolve OA, RLS, evidence, or next.
 */

import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import { formatClock } from "@/lib/unit-workspace/space";

import type { JobFlowItem, JobFlowItemAttention, JobFlowOwnerKind } from "./job-flow-item";
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
  kind: "evidence" | "work_order";
  label: string;
  stateLabel: string;
  spaceId: string | null;
  spaceName: string | null;
  href: string | null;
  actionLabel: string | null;
  /** Present when sourced from canonical JobFlowItem. */
  ownerKind?: JobFlowOwnerKind;
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

export type EmployeeRuntimePresentedException = {
  id: string;
  label: string;
  stateLabel: string;
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
  /** Assigned Plant Work Orders — sourced from WORK_ORDER items. */
  workOrders: EmployeeRuntimePresentedItem[];
  evidenceGroups: Array<{
    id: EmployeeRuntimeEvidenceGroupId;
    title: string;
    items: EmployeeRuntimePresentedItem[];
  }>;
  evidenceMode: EmployeeRuntimeFlow["evidenceMode"];
  milestones: EmployeeRuntimePresentedMilestone[];
  /** Asset impact issues — compatibility path (not yet JobFlowItem owners). */
  issues: EmployeeRuntimePresentedIssue[];
  /** Informational Assignment exceptions (call-off / revision). */
  exceptions: EmployeeRuntimePresentedException[];
  plantMessages: string[];
  spaceNotAssignedLabel: string | null;
};

const IMPACT_LABEL = {
  SERVICE_AT_RISK: "Service at risk",
  EQUIPMENT_UNAVAILABLE: "Equipment unavailable",
  WORKAROUND_AVAILABLE: "Workaround available",
} as const;

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

function attentionStateLabel(attention: JobFlowItemAttention, ownerState: string): string {
  switch (attention) {
    case "needs_attention":
      return ownerState === "OVERDUE" || ownerState === "PAST_DUE_NOT_CONFIRMED"
        ? "Overdue"
        : "Needs attention";
    case "due_now":
      return "Due now";
    case "upcoming":
      return "Upcoming";
    case "completed":
      return "Completed";
    case "not_applicable":
      return "Not applicable";
    case "informational":
    default:
      return "Info";
  }
}

function itemMatchesSpace(item: JobFlowItem, spaceFilter: string | null): boolean {
  if (spaceFilter == null) return true;
  if (spaceFilter === "__none__") return false;
  return item.place.spaceId === spaceFilter;
}

function presentRecordItem(
  item: JobFlowItem,
  flow: EmployeeRuntimeFlow,
  landingUnitId: string,
): EmployeeRuntimePresentedItem | null {
  if (item.attention === "not_applicable" || item.attention === "informational") return null;

  const harbor = flow.evidence.find(
    (row) => `${row.attachmentId}:${row.requirementKey}` === item.ownerId,
  );
  if (harbor) {
    const href =
      harbor.category === "completed" && harbor.href ? harbor.href : harborHref(harbor);
    return {
      id: `${harbor.attachmentId}:${harbor.requirementKey}`,
      kind: "evidence",
      label: harbor.displayName,
      stateLabel: attentionStateLabel(item.attention, item.ownerState),
      spaceId: harbor.spaceId,
      spaceName: spaceNameFor(harbor.spaceId, flow.locations),
      href,
      actionLabel: evidenceAction(harbor.category, Boolean(harbor.href || harbor.recordId)),
      ownerKind: "RECORD_REQUIREMENT",
    };
  }

  const template = flow.templateEvidence.find((row) => row.requirementKey === item.ownerId);
  if (template) {
    const category = TEMPLATE_STATE_CATEGORY[template.state];
    if (!category) return null;
    return {
      id: template.requirementKey,
      kind: "evidence",
      label: template.templateName,
      stateLabel: attentionStateLabel(item.attention, item.ownerState),
      spaceId: template.spaceId,
      spaceName: spaceNameFor(template.spaceId, flow.locations),
      href: templateHref(landingUnitId, template),
      actionLabel: evidenceAction(category, false),
      ownerKind: "RECORD_REQUIREMENT",
    };
  }

  return {
    id: item.ownerId,
    kind: "evidence",
    label: item.label,
    stateLabel: attentionStateLabel(item.attention, item.ownerState),
    spaceId: item.place.spaceId,
    spaceName: spaceNameFor(item.place.spaceId, flow.locations),
    href: item.href,
    actionLabel:
      item.attention === "completed"
        ? item.href
          ? "View"
          : null
        : item.attention === "upcoming"
          ? "Open"
          : "Start",
    ownerKind: "RECORD_REQUIREMENT",
  };
}

function presentWorkOrderItem(
  item: JobFlowItem,
  flow: EmployeeRuntimeFlow,
): EmployeeRuntimePresentedItem {
  return {
    id: item.ownerId,
    kind: "work_order",
    label: item.label,
    stateLabel: attentionStateLabel(item.attention, item.ownerState.split(":")[0] ?? item.ownerState),
    spaceId: item.place.spaceId,
    spaceName: spaceNameFor(item.place.spaceId, flow.locations),
    href: item.href,
    actionLabel: item.attention === "completed" ? "View" : "Open",
    ownerKind: "WORK_ORDER",
  };
}

function presentItemsFromCanonical(
  flow: EmployeeRuntimeFlow,
  landingUnitId: string,
  spaceFilter: string | null,
): {
  workOrders: EmployeeRuntimePresentedItem[];
  evidence: EmployeeRuntimePresentedItem[];
  milestones: EmployeeRuntimePresentedMilestone[];
  exceptions: EmployeeRuntimePresentedException[];
} {
  const scoped = flow.items.filter((item) => itemMatchesSpace(item, spaceFilter));
  const workOrders: EmployeeRuntimePresentedItem[] = [];
  const evidence: EmployeeRuntimePresentedItem[] = [];
  const milestones: EmployeeRuntimePresentedMilestone[] = [];
  const exceptions: EmployeeRuntimePresentedException[] = [];

  for (const item of scoped) {
    if (item.ownerKind === "RECORD_REQUIREMENT") {
      const presented = presentRecordItem(item, flow, landingUnitId);
      if (presented) evidence.push(presented);
      continue;
    }
    if (item.ownerKind === "WORK_ORDER") {
      workOrders.push(presentWorkOrderItem(item, flow));
      continue;
    }
    if (item.ownerKind === "OPERATING_RHYTHM_KEY_POINT") {
      const statusKey = item.ownerState;
      const kindPart = item.ownerId.split(":").pop();
      const kind = (
        kindPart === "SERVERY_READY" || kindPart === "MEAL_SERVICE_STARTED" || kindPart === "KEY_TIME"
          ? kindPart
          : "KEY_TIME"
      ) as EmployeeRuntimeMilestone["kind"];
      if (!RECORDABLE_MILESTONES.has(kind)) continue;
      if (
        statusKey !== "not_recorded" &&
        statusKey !== "overdue" &&
        statusKey !== "completed_late" &&
        statusKey !== "due"
      ) {
        continue;
      }
      milestones.push({
        spaceId: item.place.spaceId ?? "",
        spaceName: spaceNameFor(item.place.spaceId, flow.locations) ?? item.label,
        kind,
        label: item.label,
        statusKey,
      });
      continue;
    }
    if (item.ownerKind === "ASSIGNMENT_EXCEPTION") {
      exceptions.push({
        id: item.ownerId,
        label: item.label,
        stateLabel: attentionStateLabel(item.attention, item.ownerState),
        href: item.href,
      });
    }
  }

  return { workOrders, evidence, milestones, exceptions };
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
  const items = flow.items.filter((row) => row.place.spaceId === spaceId);
  const overdue = items.find(
    (row) =>
      row.attention === "needs_attention" &&
      (row.ownerKind === "RECORD_REQUIREMENT" ||
        row.ownerKind === "WORK_ORDER"),
  );
  if (overdue) {
    return overdue.ownerState === "OVERDUE" || overdue.ownerState === "PAST_DUE_NOT_CONFIRMED"
      ? `${overdue.label} overdue`
      : `${overdue.label} needs attention`;
  }
  const due = items.find(
    (row) =>
      row.attention === "due_now" &&
      (row.ownerKind === "RECORD_REQUIREMENT" ||
        row.ownerKind === "WORK_ORDER"),
  );
  if (due) return `${due.label} due now`;
  return "No work currently due";
}

function nextHref(
  landingUnitId: string,
  workOrders: EmployeeRuntimePresentedItem[],
  evidence: EmployeeRuntimePresentedItem[],
  flow: EmployeeRuntimeFlow,
): string | null {
  const next = flow.next;
  if (next.kind === "none") return null;
  if (next.kind === "due_work_order" || next.kind === "upcoming_work_order") {
    return (
      workOrders.find((row) => row.id === next.sourceId)?.href ??
      flow.items.find((row) => row.ownerId === next.sourceId)?.href ??
      null
    );
  }
  if (next.kind.endsWith("_evidence")) {
    return evidence.find((row) => row.id.endsWith(next.sourceId) || row.id === next.sourceId)?.href ?? null;
  }
  if (next.kind === "milestone" && next.spaceId) {
    return spaceHref(landingUnitId, next.spaceId);
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
  plantMessages?: readonly string[];
}): EmployeeRuntimeExperienceView {
  const { flow, grain, landingUnitId, timezone } = input;
  const spaceId = input.spaceId ?? null;
  const spaceAssigned = spaceId ? flow.responsibility.assignedSpaceIds.includes(spaceId) : true;
  const showExecution =
    flow.assignmentAvailability === "evaluated" && !flow.device.mismatch && spaceAssigned;
  const effectiveFilter = showExecution ? (grain === "space" ? spaceId : null) : "__none__";

  const presented = showExecution
    ? presentItemsFromCanonical(flow, landingUnitId, effectiveFilter)
    : {
        workOrders: [] as EmployeeRuntimePresentedItem[],
        evidence: [] as EmployeeRuntimePresentedItem[],
        milestones: [] as EmployeeRuntimePresentedMilestone[],
        exceptions: [] as EmployeeRuntimePresentedException[],
      };
  const workOrders = presented.workOrders;
  const evidenceItems = presented.evidence;

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
            href: nextHref(landingUnitId, workOrders, evidenceItems, flow),
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
    workOrders,
    evidenceGroups: groupEvidence(evidenceItems),
    evidenceMode: flow.evidenceMode,
    milestones: presented.milestones,
    issues: showExecution ? presentIssues(flow.issues, effectiveFilter) : [],
    exceptions: presented.exceptions,
    plantMessages: showExecution ? [...(input.plantMessages ?? [])] : [],
    spaceNotAssignedLabel:
      grain === "space" && spaceId && !spaceAssigned ? EMPLOYEE_SPACE_NOT_ASSIGNED_LABEL : null,
  };
}
