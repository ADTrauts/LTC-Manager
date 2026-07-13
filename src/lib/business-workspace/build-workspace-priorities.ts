import type { WorkspacePriorityCard, WorkspacePriorityRank } from "./types";
import type { BusinessWorkspaceInputs } from "./load-workspace-inputs";

function isPriorityIssue(priority: string): boolean {
  return priority === "URGENT" || priority === "HIGH";
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

type Candidate = WorkspacePriorityCard & { dedupeKey: string };

/**
 * Deterministic priority composition from authoritative OC / readiness / issue signals.
 * Max 4 primary + 2 watch items. Collapses duplicate underlying themes.
 */
export function buildWorkspacePriorities(inputs: BusinessWorkspaceInputs): WorkspacePriorityCard[] {
  const { dashboard, readiness, callDownSummary, openRepairs, inspectionsDue } = inputs;
  const op = dashboard.operationContext;
  const blockedUnits = readiness.items.filter((item) => item.state === "blocked");
  const staffingGaps = dashboard.unitsMissingStaffing.length;
  const callDownOpen = callDownSummary.open;
  const overdueInspections = inspectionsDue.filter((row) => row.overdue);
  const dueInspections = inspectionsDue.filter((row) => !row.overdue);
  const urgentOpen = openRepairs.filter(
    (row) => row.priority === "URGENT" && row.status !== "CLOSED",
  );
  const highOpen = openRepairs.filter(
    (row) => row.priority === "HIGH" && row.status !== "CLOSED" && row.status !== "IN_PROGRESS",
  );
  const priorityInProgress = openRepairs.filter(
    (row) => isPriorityIssue(row.priority) && row.status === "IN_PROGRESS",
  );
  const overduePriorityWork = openRepairs.filter(
    (row) =>
      isPriorityIssue(row.priority) &&
      row.status !== "CLOSED" &&
      row.dueAt != null &&
      row.dueAt.getTime() < inputs.now.getTime(),
  );

  const candidates: Candidate[] = [];

  if (blockedUnits.length > 0) {
    const first = blockedUnits[0]!;
    candidates.push({
      id: "service-threat",
      dedupeKey: "readiness-blocked",
      rank: 1,
      title:
        blockedUnits.length === 1
          ? `${first.unitName} needs attention`
          : `${blockedUnits.length} locations need attention`,
      detail:
        blockedUnits.length === 1
          ? first.reason
          : `${op.serviceLabel} — ${blockedUnits
              .slice(0, 2)
              .map((u) => u.unitName)
              .join(", ")}`,
      href: "/today/walk",
      tone: "blocked",
      locationLabel: blockedUnits.length === 1 ? first.unitName : undefined,
    });
  } else if (
    op.phase === "Execution" &&
    (dashboard.unitsWithExceptions.length > 0 || dashboard.totals.failed + dashboard.totals.missed > 0)
  ) {
    candidates.push({
      id: "service-exceptions",
      dedupeKey: "service-exceptions",
      rank: 1,
      title: `${op.serviceLabel} needs attention`,
      detail: `${dashboard.unitsWithExceptions.length} ${plural(
        dashboard.unitsWithExceptions.length,
        "location has",
        "locations have",
      )} live exceptions`,
      href: "/dashboard",
      tone: "warning",
    });
  }

  if (overdueInspections.length > 0) {
    const first = overdueInspections[0]!;
    candidates.push({
      id: "inspections-overdue",
      dedupeKey: "inspections",
      rank: 2,
      title:
        overdueInspections.length === 1
          ? `${first.definitionName} is overdue`
          : `${overdueInspections.length} inspections are overdue`,
      detail:
        overdueInspections.length === 1
          ? first.unitName ?? "Facility inspection"
          : "Compliance work past due",
      href: "/today/handoffs",
      tone: "blocked",
      locationLabel: first.unitName ?? undefined,
    });
  } else if (dueInspections.length > 0 && urgentOpen.length === 0) {
    candidates.push({
      id: "inspections-due",
      dedupeKey: "inspections",
      rank: 4,
      title: `${dueInspections.length} ${plural(dueInspections.length, "inspection is", "inspections are")} due`,
      detail: "Scheduled inspection work due within 24 hours",
      href: "/today/handoffs",
      tone: "warning",
    });
  }

  if (urgentOpen.length > 0) {
    const first = urgentOpen[0]!;
    candidates.push({
      id: "urgent-issues",
      dedupeKey: "priority-issues",
      rank: 2,
      title:
        urgentOpen.length === 1
          ? first.title
          : `${urgentOpen.length} urgent issues need attention`,
      detail:
        urgentOpen.length === 1
          ? `${first.unitName ?? "Location"} · urgent`
          : `${urgentOpen
              .slice(0, 2)
              .map((r) => r.title)
              .join("; ")}`,
      href: urgentOpen.length === 1 ? `/issues/${first.id}` : "/issues",
      tone: "blocked",
      locationLabel: first.unitName ?? undefined,
      departmentLabel: first.departmentKey ?? undefined,
    });
  } else if (highOpen.length > 0) {
    const first = highOpen[0]!;
    candidates.push({
      id: "high-issues",
      dedupeKey: "priority-issues",
      rank: 4,
      title:
        highOpen.length === 1
          ? first.title
          : `${highOpen.length} high-priority issues are open`,
      detail:
        highOpen.length === 1
          ? `${first.unitName ?? "Location"} · high priority`
          : "Open high-priority work",
      href: highOpen.length === 1 ? `/issues/${first.id}` : "/issues",
      tone: "warning",
      locationLabel: first.unitName ?? undefined,
    });
  }

  if (staffingGaps > 0) {
    const first = dashboard.unitsMissingStaffing[0];
    candidates.push({
      id: "staffing-gaps",
      dedupeKey: "staffing",
      rank: 3,
      title:
        staffingGaps === 1 && first
          ? `${first.name} coverage needs attention`
          : `${staffingGaps} staffing gaps need attention`,
      detail: "Locations missing expected coverage for today",
      href: "/today/coverage",
      tone: "warning",
      locationLabel: first?.name,
    });
  }

  if (callDownOpen > 0) {
    candidates.push({
      id: "call-downs",
      dedupeKey: "call-downs",
      rank: 3,
      title: `${callDownOpen} open ${plural(callDownOpen, "call-down", "call-downs")}`,
      detail: "Coverage call-downs still unresolved",
      href: "/today/coverage",
      tone: "warning",
    });
  }

  if (overduePriorityWork.length > 0 && urgentOpen.length === 0) {
    const first = overduePriorityWork[0]!;
    candidates.push({
      id: "overdue-work",
      dedupeKey: "overdue-work",
      rank: 4,
      title:
        overduePriorityWork.length === 1
          ? `${first.title} is overdue`
          : `${overduePriorityWork.length} priority work items are overdue`,
      detail: first.unitName ?? "Past due assignment",
      href: `/issues/${first.id}`,
      tone: "warning",
      locationLabel: first.unitName ?? undefined,
    });
  }

  if (priorityInProgress.length > 0) {
    const first = priorityInProgress[0]!;
    candidates.push({
      id: "recovery-in-progress",
      dedupeKey: "recovery",
      rank: 5,
      title:
        priorityInProgress.length === 1
          ? `${first.title} is in progress`
          : `${priorityInProgress.length} priority recoveries are in progress`,
      detail:
        priorityInProgress.length === 1
          ? `${first.unitName ?? "Location"} · recovery underway`
          : "Important assigned work still In Progress",
      href: priorityInProgress.length === 1 ? `/issues/${first.id}` : "/issues",
      tone: "in_progress",
      locationLabel: first.unitName ?? undefined,
    });
  }

  candidates.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  const seen = new Set<string>();
  const primaries: WorkspacePriorityCard[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.dedupeKey)) continue;
    seen.add(candidate.dedupeKey);
    const { dedupeKey: _d, ...card } = candidate;
    void _d;
    primaries.push(card);
    if (primaries.length >= 4) break;
  }

  if (primaries.length > 0) {
    return primaries;
  }

  // Calm / healthy state — watch items only.
  const watch: WorkspacePriorityCard[] = [
    {
      id: "watch-operation",
      rank: 6 as WorkspacePriorityRank,
      isWatch: true,
      title: `${op.serviceLabel} — ${op.phase}`,
      detail: op.scheduledTimeLabel
        ? `Next focus · ${op.scheduledTimeLabel}`
        : "Current operations are on track",
      href: "/dashboard",
      tone: "ready",
    },
  ];

  if (priorityInProgress.length > 0) {
    const first = priorityInProgress[0]!;
    watch.push({
      id: "watch-recovery",
      rank: 6,
      isWatch: true,
      title: `${first.title} is in progress`,
      detail: "Routine recovery — not blocking service",
      href: `/issues/${first.id}`,
      tone: "in_progress",
      locationLabel: first.unitName ?? undefined,
    });
  } else if (dueInspections.length > 0) {
    watch.push({
      id: "watch-inspections",
      rank: 6,
      isWatch: true,
      title: `${dueInspections.length} upcoming ${plural(dueInspections.length, "inspection", "inspections")}`,
      detail: "Not overdue — schedule when capacity allows",
      href: "/today/handoffs",
      tone: "neutral",
    });
  }

  watch.push({
    id: "watch-modules",
    rank: 6,
    isWatch: true,
    title: "Operations Center & Today's Work",
    detail: "Open the detailed exception and walk surfaces when you need them",
    href: "/dashboard",
    tone: "neutral",
  });

  return watch.slice(0, 3);
}

export function workspaceIsHealthy(priorities: WorkspacePriorityCard[]): boolean {
  return priorities.length === 0 || priorities.every((card) => card.isWatch);
}
