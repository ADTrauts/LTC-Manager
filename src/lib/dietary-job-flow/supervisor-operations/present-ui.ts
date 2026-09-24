/**
 * Phase 6P — presentation-only grouping and labels for SupervisorOperationsViewModel.
 *
 * Components may render, group, hide empty sections, and format.
 * They may not calculate coverage, assignment, current cycle, evidence due
 * state, asset risk, or milestone lateness.
 *
 * Shared-unit sync limitation (no schema change in 6P):
 * Offline conflict / receipt models have no departmentId. Scoping is unit
 * responsibility. A shared unit conflict may appear for every department
 * responsible for that unit.
 */

import {
  SUPERVISOR_ASSIGNMENT_UNAVAILABLE,
  SUPERVISOR_COVERAGE_UNAVAILABLE,
} from "./compose";
import type { SupervisorOperationsViewModel } from "./types";

export const SHARED_UNIT_SYNC_LIMITATION =
  "Conflicts are scoped by unit responsibility. A shared unit may appear for every department responsible for that unit.";

export const BOARD_SECTION_ORDER = [
  "current_operation",
  "assignment_coverage",
  "needs_attention",
  "people",
  "offline_sync",
  "department_overlay",
] as const;

export type BoardAttentionCategory =
  | "Coverage"
  | "Evidence"
  | "Service Milestones"
  | "Service Timing"
  | "Work"
  | "Equipment / Asset Impact"
  | "Configuration";

export type PresentedChip = {
  label: string;
  value: number;
  emphasis: "high" | "medium" | "low";
};

export type PresentedAttentionRow = {
  category: BoardAttentionCategory;
  title: string;
  detail: string;
  kind?: "current" | "historical";
  href: string;
  actionLabel: string;
};

export type PresentedPersonRow = {
  title: string;
  detail: string | null;
  href: string;
  actionLabel: string;
};

export type PresentedSyncRow = {
  title: string;
  detail: string | null;
  href: string;
  actionLabel: string;
};

export type SupervisorOperationsBoardPresentation = {
  currentOperation: {
    label: string;
    planStatus: string | null;
    dateKey: string;
    departmentName: string;
  };
  assignmentCoverage: {
    assignmentUnavailable: boolean;
    coverageUnavailable: boolean;
    scheduledCount: number;
    callOffCount: number;
    scheduledHref: "/staffing";
    chips: PresentedChip[];
    quietCoverage: boolean;
  };
  needsAttention: {
    quiet: boolean;
    sections: Array<{ category: BoardAttentionCategory; items: PresentedAttentionRow[] }>;
  };
  people: {
    show: boolean;
    rows: PresentedPersonRow[];
  };
  sync: {
    show: boolean;
    rows: PresentedSyncRow[];
    limitationNote: string | null;
  };
  evs: SupervisorOperationsViewModel["overlay"]["evs"];
  plant: SupervisorOperationsViewModel["overlay"]["plant"];
  locationsHref: "/units";
  assignmentHref: string;
  cyclesHref: "/staffing/cycles";
};

const PLAN_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed plan",
  DRAFT: "Draft plan",
  REOPENED: "Reopened plan",
  CLOSED: "Closed plan",
};

export function planStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return PLAN_STATUS_LABEL[status] ?? null;
}

function isUnavailableStatus(status: string): boolean {
  return status === SUPERVISOR_ASSIGNMENT_UNAVAILABLE || status === SUPERVISOR_COVERAGE_UNAVAILABLE;
}

function milestoneCategory(status: string): "Service Milestones" | "Service Timing" {
  const lower = status.toLowerCase();
  if (lower.includes("ready") && !lower.includes("started")) return "Service Milestones";
  return "Service Timing";
}

function locationTitle(item: {
  locationLabel?: string | null;
  unitName?: string | null;
  employeeName?: string | null;
  status: string;
}): string {
  return item.locationLabel ?? item.unitName ?? item.employeeName ?? item.status;
}

function attentionDetail(item: {
  status: string;
  unitName?: string | null;
  locationLabel?: string | null;
  employeeName?: string | null;
  cycleLabel?: string | null;
  time?: string | null;
}): string {
  const extras = [
    item.unitName && item.locationLabel ? item.unitName : null,
    item.employeeName && item.locationLabel ? item.employeeName : null,
    item.time ?? null,
  ].filter((value): value is string => Boolean(value));
  return extras.length > 0 ? `${item.status} · ${extras.join(" · ")}` : item.status;
}

function pushSection(
  sections: SupervisorOperationsBoardPresentation["needsAttention"]["sections"],
  category: BoardAttentionCategory,
  items: PresentedAttentionRow[],
) {
  if (items.length === 0) return;
  sections.push({ category, items });
}

export function presentSupervisorOperationsBoardUi(
  view: SupervisorOperationsViewModel,
): SupervisorOperationsBoardPresentation {
  const oaAvailable = view.assignments.availability === "available";
  const coverageAvailable = view.coverage.availability === "available";

  const chips: PresentedChip[] = [];
  if (oaAvailable) {
    chips.push({
      label: "Assigned",
      value: view.assignments.assignedCount,
      emphasis: "medium",
    });
  }
  if (coverageAvailable) {
    chips.push({ label: "Covered", value: view.coverage.covered, emphasis: "medium" });
    if (view.coverage.atRisk > 0) {
      chips.push({ label: "At Risk", value: view.coverage.atRisk, emphasis: "high" });
    }
    if (view.coverage.uncovered > 0) {
      chips.push({ label: "Uncovered", value: view.coverage.uncovered, emphasis: "high" });
    }
  }

  const coverageRows = view.needsAttention.coverage
    .filter((item) => !isUnavailableStatus(item.status))
    .map((item) => ({
      category: "Coverage" as const,
      title: locationTitle(item),
      detail: attentionDetail(item),
      href: item.sourceHref,
      actionLabel: item.availableActions[0] ?? "Open Assignment Board",
    }));

  const evidenceRows = [...view.needsAttention.evidence, ...view.historicalAttention].map(
    (item) => ({
      category: "Evidence" as const,
      title: locationTitle(item),
      detail: attentionDetail(item),
      kind: item.kind,
      href: item.sourceHref,
      actionLabel: item.availableActions[0] ?? "Open evidence",
    }),
  );

  const milestoneRows = view.needsAttention.milestones.map((item) => ({
    category: milestoneCategory(item.status),
    title: locationTitle(item),
    detail: attentionDetail(item),
    href: item.sourceHref,
    actionLabel: item.availableActions[0] ?? "Open SPACE milestones",
  }));

  const workRows = view.needsAttention.work.map((item) => ({
    category: "Work" as const,
    title: locationTitle(item),
    detail: attentionDetail(item),
    href: item.sourceHref,
    actionLabel: item.availableActions[0] ?? "Open Work",
  }));

  const assetRows = view.needsAttention.assets.map((item) => ({
    category: "Equipment / Asset Impact" as const,
    title: locationTitle(item),
    detail: attentionDetail(item),
    href: item.sourceHref,
    actionLabel: item.availableActions[0] ?? "Open asset",
  }));

  const configurationRows = view.needsAttention.configuration.map((item) => ({
    category: "Configuration" as const,
    title: locationTitle(item),
    detail: attentionDetail(item),
    href: item.sourceHref,
    actionLabel: item.availableActions[0] ?? "Open",
  }));

  const sections: SupervisorOperationsBoardPresentation["needsAttention"]["sections"] = [];
  pushSection(sections, "Coverage", coverageRows);
  pushSection(sections, "Evidence", evidenceRows);
  pushSection(
    sections,
    "Service Milestones",
    milestoneRows.filter((row) => row.category === "Service Milestones"),
  );
  pushSection(
    sections,
    "Service Timing",
    milestoneRows.filter((row) => row.category === "Service Timing"),
  );
  pushSection(sections, "Work", workRows);
  pushSection(sections, "Equipment / Asset Impact", assetRows);
  pushSection(sections, "Configuration", configurationRows);

  const peopleRows: PresentedPersonRow[] = oaAvailable
    ? view.needsAttention.people
        .filter((item) => !isUnavailableStatus(item.status))
        .map((item) => {
          const assignment = view.assignments.assignments.find(
            (row) => row.employeeId && row.employeeId === item.employeeId,
          );
          const gap = assignment?.unitId
            ? view.coverage.gaps.find((row) => row.unitId === assignment.unitId)
            : undefined;
          const name = item.employeeName ?? "Employee";
          const title = item.status === "Call-off" ? `${name} called off` : `${name} · ${item.status}`;
          let detail: string | null = null;
          if (gap) {
            detail = `Coverage impact: ${gap.locationLabel ?? gap.unitName ?? assignment?.unitName ?? "Assignment"}`;
          } else if (assignment) {
            detail = [assignment.roleLabel, assignment.unitName].filter(Boolean).join(" · ") || null;
          }
          return {
            title,
            detail,
            href: item.sourceHref,
            actionLabel: item.availableActions[0] ?? "Open Assignment Board",
          };
        })
    : [];

  const syncRows: PresentedSyncRow[] = view.needsAttention.sync.map((item) => ({
    title: item.status,
    detail: item.unitName ?? null,
    href: item.sourceHref,
    actionLabel: item.availableActions[0] ?? "Open",
  }));
  const showSync = syncRows.length > 0;

  return {
    currentOperation: {
      label: view.operation.label,
      planStatus: planStatusLabel(view.plan.status),
      dateKey: view.identity.operationalDateKey,
      departmentName: view.identity.departmentName,
    },
    assignmentCoverage: {
      assignmentUnavailable: !oaAvailable,
      coverageUnavailable: !coverageAvailable,
      scheduledCount: view.presence.scheduledCount,
      callOffCount: view.presence.callOffCount,
      scheduledHref: "/staffing",
      chips,
      quietCoverage: coverageAvailable && view.coverage.atRisk === 0 && view.coverage.uncovered === 0,
    },
    needsAttention: {
      quiet: sections.length === 0,
      sections,
    },
    people: {
      show: peopleRows.length > 0,
      rows: peopleRows,
    },
    sync: {
      show: showSync,
      rows: syncRows,
      limitationNote: showSync ? SHARED_UNIT_SYNC_LIMITATION : null,
    },
    evs: view.overlay.evs,
    plant: view.overlay.plant,
    locationsHref: "/units",
    assignmentHref: `/staffing/assignments?departmentId=${view.identity.departmentId}`,
    cyclesHref: "/staffing/cycles",
  };
}
