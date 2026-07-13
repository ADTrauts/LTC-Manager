import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";
import type { ManagerFocusCard } from "./types";

type FocusCandidate = ManagerFocusCard & { dedupeHref: string };

function normalizeHref(href: string): string {
  return href.split("?")[0]!.replace(/\/$/, "") || "/";
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
    candidates.push({
      id: "focus-inspection-overdue",
      title: "Highest priority inspection",
      explanation:
        overdueInspections.length === 1
          ? `${first.definitionName} is overdue`
          : `${overdueInspections.length} inspections are overdue`,
      whyItMatters: "Compliance work past due needs a manager decision today.",
      actionLabel: "Go to Inspection",
      href: "/today/handoffs",
      tone: "blocked",
      locationLabel: first.unitName ?? undefined,
      rank: 1,
      dedupeHref: normalizeHref("/today/handoffs"),
    });
  } else if (dueInspections.length > 0) {
    const first = dueInspections[0]!;
    candidates.push({
      id: "focus-inspection-due",
      title: "Highest priority inspection",
      explanation:
        dueInspections.length === 1
          ? `${first.definitionName} is due soon`
          : `${dueInspections.length} inspections are due within 24 hours`,
      whyItMatters: "Schedule inspection time before it becomes overdue.",
      actionLabel: "Go to Inspection",
      href: "/today/handoffs",
      tone: "warning",
      locationLabel: first.unitName ?? undefined,
      rank: 1,
      dedupeHref: normalizeHref("/today/handoffs"),
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
