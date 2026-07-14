import type { BusinessWorkspaceInputs, WorkspaceInspectionDue } from "./load-workspace-inputs";
import type { ManagerFocusCard, ManagerFocusHealthyGuidance } from "./types";

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

/**
 * Manager Focus — max 3 personal next actions.
 * Ranking: urgent inspection → critical staffing → service disruption →
 * urgent repair → corrective/high issue → routine recovery.
 * Never repeats the same destination.
 */
export function buildManagerFocus(inputs: BusinessWorkspaceInputs): ManagerFocusCard[] {
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

  const candidates: FocusCandidate[] = [];

  if (overdueInspections.length > 0) {
    const first = overdueInspections[0]!;
    const href = inspectionFocusHref(first);
    candidates.push({
      id: "focus-inspection-overdue",
      title: "Highest priority inspection",
      explanation:
        overdueInspections.length === 1
          ? `${first.definitionName} is overdue`
          : `${overdueInspections.length} inspections are overdue`,
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
      title: "Highest priority inspection",
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
      title: "Biggest staffing concern",
      explanation:
        staffingGaps > 0
          ? staffingGaps === 1 && first
            ? `${first.name} coverage needs attention`
            : `${staffingGaps} locations are missing expected coverage`
          : `${callDownSummary.open} open call-down${callDownSummary.open === 1 ? "" : "s"}`,
      whyItMatters: "Coverage gaps become service failures if left into the meal.",
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
      title: "Today's biggest operational risk",
      explanation:
        blockedUnits.length === 1
          ? `${first.unitName}: ${first.reason}`
          : `${blockedUnits.length} locations need attention — ${first.unitName} first`,
      whyItMatters: "Active service disruption threatens current meal supportability.",
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
      title: "Today's biggest operational risk",
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
    candidates.push({
      id: "focus-urgent-issue",
      title: "Largest unresolved issue",
      explanation: first.title,
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
      title: "Most important corrective action",
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
      title: "Recovery work in progress",
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

/**
 * Calm healthy-state guidance when Manager Focus has no urgent cards.
 * One primary + up to two secondary — no manufactured urgency.
 */
export function buildManagerFocusHealthyGuidance(
  inputs: BusinessWorkspaceInputs,
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

  return {
    title: "Current operations are on track.",
    detail:
      op.scheduledTimeLabel != null
        ? `${op.serviceLabel} — ${op.phase} · ${op.scheduledTimeLabel}`
        : `${op.serviceLabel} — ${op.phase}`,
    primary: { label: "Open Operations Center", href: "/dashboard" },
    secondary: secondary.slice(0, 2),
  };
}
