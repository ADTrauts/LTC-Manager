import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type { BusinessWorkspaceInputs, WorkspaceInspectionDue } from "./load-workspace-inputs";
import type { ManagerFocusCard, ManagerFocusHealthyGuidance, WorkspaceContext } from "./types";

type FocusCandidate = ManagerFocusCard & { dedupeHref: string };

function normalizeHref(href: string): string {
  return href.replace(/\/$/, "") || "/";
}

/** Deep-link to unit inspection when unit + definition are known; otherwise handoffs. */
export function inspectionFocusHref(row: WorkspaceInspectionDue): string {
  if (row.unitId && row.definitionId) {
    return `/unit/${row.unitId}?unitTab=overview&inspect=${row.definitionId}&occurrence=${row.id}`;
  }
  if (row.unitId) {
    return `/unit/${row.unitId}`;
  }
  return "/today/handoffs";
}

type FocusCopy = {
  inspectionTitle: string;
  staffingTitle: string;
  staffingWhyItMatters: string;
  serviceRiskTitle: string;
  serviceRiskWhyItMatters: string;
  issueTitle: string;
  correctiveTitle: string;
  recoveryTitle: string;
  deptPrefix: string;
};

const DEPT_FOCUS_COPY: Record<OperationalDepartmentKey, FocusCopy> = {
  DIETARY: {
    inspectionTitle: "Dietary inspection needs attention",
    staffingTitle: "Dietary staffing needs attention",
    staffingWhyItMatters: "Coverage gaps become service failures if left into the meal.",
    serviceRiskTitle: "Dietary service risk",
    serviceRiskWhyItMatters: "Active service disruption threatens current meal supportability.",
    issueTitle: "Dietary issue needs attention",
    correctiveTitle: "Dietary corrective action",
    recoveryTitle: "Dietary recovery in progress",
    deptPrefix: "Dietary",
  },
  EVS: {
    inspectionTitle: "EVS inspection needs attention",
    staffingTitle: "EVS coverage needs attention",
    staffingWhyItMatters: "Coverage gaps delay cleaning rounds and room turnovers.",
    serviceRiskTitle: "EVS area needs attention",
    serviceRiskWhyItMatters: "Blocked areas affect room readiness and cleaning schedules.",
    issueTitle: "EVS issue needs attention",
    correctiveTitle: "EVS corrective action",
    recoveryTitle: "EVS work in progress",
    deptPrefix: "EVS",
  },
  PLANT: {
    inspectionTitle: "Plant inspection needs attention",
    staffingTitle: "Plant staffing needs attention",
    staffingWhyItMatters: "Coverage gaps delay work-order response and preventive maintenance.",
    serviceRiskTitle: "Plant operations risk",
    serviceRiskWhyItMatters: "Critical asset issues threaten operational continuity.",
    issueTitle: "Urgent work order needs attention",
    correctiveTitle: "Plant corrective action",
    recoveryTitle: "Plant repair in progress",
    deptPrefix: "Plant",
  },
};

const GENERIC_FOCUS_COPY: FocusCopy = {
  inspectionTitle: "Highest priority inspection",
  staffingTitle: "Biggest staffing concern",
  staffingWhyItMatters: "Coverage gaps become service failures if unresolved.",
  serviceRiskTitle: "Today's biggest operational risk",
  serviceRiskWhyItMatters: "Active disruption threatens operational continuity.",
  issueTitle: "Largest unresolved issue",
  correctiveTitle: "Most important corrective action",
  recoveryTitle: "Recovery work in progress",
  deptPrefix: "",
};

function resolveFocusCopy(context?: WorkspaceContext): FocusCopy {
  if (context?.mode === "department") {
    return DEPT_FOCUS_COPY[context.departmentKey] ?? GENERIC_FOCUS_COPY;
  }
  return GENERIC_FOCUS_COPY;
}

function facilityDeptLabel(departmentKey: string | null | undefined): string {
  if (departmentKey === "DIETARY") return "Dietary";
  if (departmentKey === "EVS") return "EVS";
  if (departmentKey === "PLANT") return "Plant";
  return "";
}

/**
 * Manager Focus — max 3 personal next actions.
 * Ranking: urgent inspection → critical staffing → service disruption →
 * urgent repair → corrective/high issue → routine recovery.
 * Never repeats the same destination.
 * When a department context is active, copy is department-specific.
 * Facility Overview cards identify the department when known.
 */
export function buildManagerFocus(
  inputs: BusinessWorkspaceInputs,
  context?: WorkspaceContext,
): ManagerFocusCard[] {
  const { dashboard, readiness, callDownSummary, openRepairs, inspectionsDue } = inputs;
  const blockedUnits = readiness.items.filter((item) => item.state === "blocked");
  const staffingGaps = dashboard.unitsMissingStaffing.length;
  const overdueInspections = inspectionsDue.filter((row) => row.overdue);
  const dueInspections = inspectionsDue.filter((row) => !row.overdue);
  const urgentOpen = openRepairs.filter(
    (row) => row.priority === "URGENT" && row.status !== "CLOSED",
  );
  const highOpen = openRepairs.filter(
    (row) =>
      row.priority === "HIGH" &&
      row.status !== "CLOSED" &&
      row.workOrderKind === "CORRECTIVE",
  );
  const routineRecovery = openRepairs.filter(
    (row) =>
      (row.priority === "HIGH" || row.priority === "MEDIUM") &&
      row.status === "IN_PROGRESS",
  );

  const copy = resolveFocusCopy(context);
  const isFacility = !context || context.mode === "facility";
  const candidates: FocusCandidate[] = [];

  if (overdueInspections.length > 0) {
    const first = overdueInspections[0]!;
    const href = inspectionFocusHref(first);
    const deptTag = isFacility ? facilityDeptLabel(first.departmentKey) : "";
    candidates.push({
      id: "focus-inspection-overdue",
      title: copy.inspectionTitle,
      explanation:
        overdueInspections.length === 1
          ? `${first.definitionName} is overdue`
          : `${overdueInspections.length}${deptTag ? ` ${deptTag}` : ""} inspections are overdue`,
      whyItMatters: "Compliance work past due needs a manager decision today.",
      actionLabel: first.unitId ? "Open Inspection" : "Go to Inspection",
      href,
      tone: "blocked",
      locationLabel: first.unitName ?? undefined,
      rank: 1,
      dedupeHref: normalizeHref(href),
    });
  } else if (dueInspections.length > 0) {
    const first = dueInspections[0]!;
    const href = inspectionFocusHref(first);
    candidates.push({
      id: "focus-inspection-due",
      title: copy.inspectionTitle,
      explanation:
        dueInspections.length === 1
          ? `${first.definitionName} is due soon`
          : `${dueInspections.length} inspections are due within 24 hours`,
      whyItMatters: "Schedule inspection time before it becomes overdue.",
      actionLabel: first.unitId ? "Open Inspection" : "Go to Inspection",
      href,
      tone: "warning",
      locationLabel: first.unitName ?? undefined,
      rank: 1,
      dedupeHref: normalizeHref(href),
    });
  }

  if (staffingGaps > 0 || callDownSummary.open > 0) {
    const first = dashboard.unitsMissingStaffing[0];
    candidates.push({
      id: "focus-staffing",
      title: copy.staffingTitle,
      explanation:
        staffingGaps > 0
          ? staffingGaps === 1 && first
            ? `${first.name} coverage needs attention`
            : `${staffingGaps} locations are missing expected coverage`
          : `${callDownSummary.open} open call-down${callDownSummary.open === 1 ? "" : "s"}`,
      whyItMatters: copy.staffingWhyItMatters,
      actionLabel: "Review Coverage",
      href: "/today/coverage",
      tone: "warning",
      locationLabel: first?.name,
      rank: 2,
      dedupeHref: normalizeHref("/today/coverage"),
    });
  }

  if (blockedUnits.length > 0) {
    const first = blockedUnits[0]!;
    candidates.push({
      id: "focus-service",
      title: copy.serviceRiskTitle,
      explanation:
        blockedUnits.length === 1
          ? `${first.unitName}: ${first.reason}`
          : `${blockedUnits.length} locations need attention — ${first.unitName} first`,
      whyItMatters: copy.serviceRiskWhyItMatters,
      actionLabel: "Open Unit",
      href: `/unit/${first.unitId}`,
      tone: "blocked",
      locationLabel: first.unitName,
      rank: 3,
      dedupeHref: normalizeHref(`/unit/${first.unitId}`),
    });
  } else if (
    dashboard.operationContext.phase === "Execution" &&
    dashboard.unitsWithExceptions.length > 0
  ) {
    candidates.push({
      id: "focus-exceptions",
      title: copy.serviceRiskTitle,
      explanation: `${dashboard.operationContext.serviceLabel} has live exceptions`,
      whyItMatters: "Execution-phase exceptions need manager oversight now.",
      actionLabel: "Operations Center",
      href: "/dashboard",
      tone: "warning",
      rank: 3,
      dedupeHref: normalizeHref("/dashboard"),
    });
  }

  if (urgentOpen.length > 0) {
    const first = urgentOpen[0]!;
    const deptTag = isFacility ? facilityDeptLabel(first.departmentKey) : "";
    candidates.push({
      id: "focus-urgent-issue",
      title: copy.issueTitle,
      explanation: deptTag ? `${deptTag}: ${first.title}` : first.title,
      whyItMatters: "Urgent issues escalate quickly if the next action is unclear.",
      actionLabel: "Open Issue",
      href: `/issues/${first.id}`,
      tone: "blocked",
      locationLabel: first.unitName ?? undefined,
      rank: 4,
      dedupeHref: normalizeHref(`/issues/${first.id}`),
    });
  }

  if (highOpen.length > 0) {
    const first = highOpen[0]!;
    candidates.push({
      id: "focus-corrective",
      title: copy.correctiveTitle,
      explanation: first.title,
      whyItMatters: "High-priority corrective work still needs a manager follow-through.",
      actionLabel: "Open Issue",
      href: `/issues/${first.id}`,
      tone: "warning",
      locationLabel: first.unitName ?? undefined,
      rank: 5,
      dedupeHref: normalizeHref(`/issues/${first.id}`),
    });
  }

  if (routineRecovery.length > 0) {
    const first = routineRecovery[0]!;
    candidates.push({
      id: "focus-routine",
      title: copy.recoveryTitle,
      explanation: `${first.title} is underway`,
      whyItMatters: "Confirm progress so recovery does not stall unattended.",
      actionLabel: "Open Issue",
      href: `/issues/${first.id}`,
      tone: "in_progress",
      locationLabel: first.unitName ?? undefined,
      rank: 6,
      dedupeHref: normalizeHref(`/issues/${first.id}`),
    });
  }

  candidates.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  const seenHrefs = new Set<string>();
  const selected: ManagerFocusCard[] = [];
  for (const candidate of candidates) {
    if (seenHrefs.has(candidate.dedupeHref)) continue;
    seenHrefs.add(candidate.dedupeHref);
    const { dedupeHref: _d, ...card } = candidate;
    void _d;
    selected.push(card);
    if (selected.length >= 3) break;
  }

  return selected;
}

const HEALTHY_STATE_COPY: Record<OperationalDepartmentKey, { title: string; detail: (serviceLabel: string, phase: string) => string }> = {
  DIETARY: {
    title: "Current dietary operations are on track.",
    detail: (serviceLabel, phase) => `${serviceLabel} — ${phase}`,
  },
  EVS: {
    title: "Current EVS operations are on track.",
    detail: (_serviceLabel, phase) => `EVS cleaning operations — ${phase}`,
  },
  PLANT: {
    title: "Current Plant Operations are on track.",
    detail: (_serviceLabel, phase) => `Plant Operations — ${phase}`,
  },
};

/**
 * Calm healthy-state guidance when Manager Focus has no urgent cards.
 * One primary + up to two secondary — no manufactured urgency.
 * When a department context is active, copy reflects that department.
 */
export function buildManagerFocusHealthyGuidance(
  inputs: BusinessWorkspaceInputs,
  context?: WorkspaceContext,
): ManagerFocusHealthyGuidance {
  const op = inputs.dashboard.operationContext;
  const upcomingInspection = inputs.inspectionsDue.find((row) => !row.overdue);
  const routineInProgress = inputs.openRepairs.find(
    (row) =>
      row.status === "IN_PROGRESS" &&
      row.priority !== "URGENT" &&
      row.priority !== "HIGH",
  );

  const secondary: ManagerFocusHealthyGuidance["secondary"] = [
    { label: "Review Today's Work", href: "/today" },
  ];

  if (upcomingInspection) {
    secondary.push({
      label: upcomingInspection.unitName
        ? `Upcoming: ${upcomingInspection.definitionName}`
        : "Review upcoming inspections",
      href: inspectionFocusHref(upcomingInspection),
    });
  } else if (routineInProgress) {
    secondary.push({
      label: `Routine work: ${routineInProgress.title}`,
      href: `/issues/${routineInProgress.id}`,
    });
  } else if (op.scheduledTimeLabel) {
    secondary.push({
      label: `Next: ${op.serviceLabel} · ${op.scheduledTimeLabel}`,
      href: "/dashboard",
    });
  }

  let healthyTitle: string;
  let detailText: string;
  if (context?.mode === "department") {
    const deptCopy = HEALTHY_STATE_COPY[context.departmentKey];
    healthyTitle = deptCopy?.title ?? `${context.departmentName} operations are on track.`;
    const baseParts = op.scheduledTimeLabel ? `${op.phase} · ${op.scheduledTimeLabel}` : op.phase;
    detailText = deptCopy?.detail(op.serviceLabel, baseParts) ?? `${op.serviceLabel} — ${baseParts}`;
  } else {
    healthyTitle = "Current operations are on track.";
    detailText = op.scheduledTimeLabel != null
      ? `${op.serviceLabel} — ${op.phase} · ${op.scheduledTimeLabel}`
      : `${op.serviceLabel} — ${op.phase}`;
  }

  return {
    title: healthyTitle,
    detail: detailText,
    primary: { label: "Open Operations Center", href: "/dashboard" },
    secondary: secondary.slice(0, 2),
  };
}
