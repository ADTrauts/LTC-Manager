import Link from "next/link";

import type { JobFlowContext, JobFlowPhaseStatus } from "@/lib/dietary-job-flow";

export type EmployeeJobFlowOfflineProps = {
  lastSyncedAt?: string | null;
  pendingCount?: number;
  connectivity?: string | null;
  stale?: boolean;
};

type Props = {
  jobFlow: JobFlowContext;
  canManage?: boolean;
  departmentId?: string | null;
  /** Explicit revision indicator when assignment changed since prior load/bundle. */
  assignmentUpdated?: boolean;
  offline?: EmployeeJobFlowOfflineProps | null;
};

function phaseStatusLabel(status: JobFlowPhaseStatus): string {
  switch (status) {
    case "Upcoming":
      return "Upcoming";
    case "Current":
      return "Current";
    case "Confirmed":
      return "Confirmed";
    case "SavedOnThisTablet":
      return "Saved on this tablet";
    case "Synchronizing":
      return "Synchronizing";
    case "ReviewRequired":
      return "Review required";
    case "NotConfirmed":
      return "Not confirmed";
  }
}

function formatWindow(start: string | null | undefined, end: string | null | undefined): string | null {
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  if (end) return end;
  return null;
}

function formatTime(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Employee Job Flow (odometer) — derived Runtime projection.
 * Neutral language; Not Confirmed is not failure; no gamification.
 */
export function EmployeeJobFlowPanel({
  jobFlow,
  canManage = false,
  departmentId = null,
  assignmentUpdated = false,
  offline = null,
}: Props) {
  const builderHref = departmentId ? `/admin/departments/${departmentId}?tab=cycles` : null;
  const assignmentChanged =
    assignmentUpdated || jobFlow.attention.some((a) => a.kind === "assignment_updated");

  if (jobFlow.state === "NOT_CONFIGURED") {
    return (
      <article
        className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        data-testid="employee-job-flow"
      >
        <p className="text-xs font-medium text-zinc-500">Job Flow</p>
        <p className="mt-0.5 text-sm text-zinc-700">
          {jobFlow.current.expectation || "Operational cycles are not configured yet."}
        </p>
        {canManage && builderHref ? (
          <p className="mt-2 text-xs text-zinc-600">
            <Link
              href={builderHref}
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Open Department Builder
            </Link>{" "}
            to publish cycles for this department.
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            Check with your Supervisor if you expected cycle guidance here.
          </p>
        )}
      </article>
    );
  }

  if (jobFlow.state === "NO_CONFIRMED_ASSIGNMENT") {
    return (
      <article
        className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        data-testid="employee-job-flow"
      >
        <p className="text-xs font-medium text-zinc-500">Job Flow</p>
        <p className="mt-0.5 text-sm text-zinc-700">
          No confirmed Assignment for today. Check with your Supervisor when you are ready to begin.
        </p>
        {jobFlow.cycle ? (
          <p className="mt-2 text-xs text-zinc-600">
            Current cycle context: {jobFlow.cycle.label}
            {formatWindow(jobFlow.cycle.startLocal, jobFlow.cycle.endLocal)
              ? ` · ${formatWindow(jobFlow.cycle.startLocal, jobFlow.cycle.endLocal)}`
              : ""}
          </p>
        ) : null}
        {jobFlow.current.targetTime ? (
          <p className="mt-1 text-xs text-zinc-600">Meal target: {jobFlow.current.targetTime}</p>
        ) : null}
        <OfflineStrip offline={offline} />
      </article>
    );
  }

  if (jobFlow.state === "NOT_APPLICABLE") {
    return (
      <article
        className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        data-testid="employee-job-flow"
      >
        <p className="text-xs font-medium text-zinc-500">Job Flow</p>
        <p className="mt-0.5 text-sm text-zinc-700">{jobFlow.current.expectation}</p>
      </article>
    );
  }

  if (jobFlow.state === "REAUTHENTICATION_REQUIRED") {
    return (
      <article
        className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        data-testid="employee-job-flow"
      >
        <p className="text-xs font-medium text-zinc-500">Job Flow</p>
        <p className="mt-0.5 text-sm text-zinc-700">
          Sign in again to continue with the current Job Flow.
        </p>
      </article>
    );
  }

  if (jobFlow.state === "OFFLINE_STALE") {
    return (
      <article
        className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        data-testid="employee-job-flow"
      >
        <p className="text-xs font-medium text-zinc-500">Job Flow</p>
        <p className="mt-0.5 text-sm text-zinc-700">
          Offline context is stale. Synchronize when you are online.
        </p>
        <OfflineStrip offline={offline} />
      </article>
    );
  }

  const unitName =
    jobFlow.current.unit?.name ??
    ("assignment" in jobFlow ? jobFlow.assignment?.unitName : null) ??
    jobFlow.current.assignment?.unitName ??
    null;

  const duty =
    ("assignment" in jobFlow ? jobFlow.assignment?.roleLabel : null) ??
    jobFlow.current.assignment?.roleLabel ??
    ("nextAssignment" in jobFlow ? jobFlow.nextAssignment?.roleLabel : null) ??
    null;

  const assignment =
    ("assignment" in jobFlow ? jobFlow.assignment : null) ??
    jobFlow.current.assignment ??
    null;

  const cycle =
    ("cycle" in jobFlow ? jobFlow.cycle : null) ??
    jobFlow.current.cycle ??
    ("lastCycle" in jobFlow ? jobFlow.lastCycle : null) ??
    null;

  const windowText = assignment
    ? [formatTime(assignment.startsAt), formatTime(assignment.endsAt)].filter(Boolean).join("–") ||
      (cycle ? formatWindow(cycle.startLocal, cycle.endLocal) : null)
    : cycle
      ? formatWindow(cycle.startLocal, cycle.endLocal)
      : null;

  const nextEvent =
    jobFlow.next.milestoneExpectation ??
    (jobFlow.next.cycle
      ? `Next cycle: ${jobFlow.next.cycle.label}`
      : jobFlow.next.assignment
        ? `Next assignment: ${jobFlow.next.assignment.roleLabel}`
        : null);

  return (
    <article
      className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
      data-testid="employee-job-flow"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500">Job Flow</p>
        <p className="text-xs text-zinc-500">{jobFlow.state.replaceAll("_", " ")}</p>
      </div>

      {assignmentChanged ? (
        <p
          className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700"
          data-testid="job-flow-assignment-updated"
        >
          Your Assignment was updated. Showing the current Assignment.
        </p>
      ) : null}

      <dl className="mt-2 space-y-1.5 text-sm">
        {unitName ? (
          <div>
            <dt className="text-xs text-zinc-500">Unit</dt>
            <dd className="font-semibold text-zinc-900">{unitName}</dd>
          </div>
        ) : null}
        {duty ? (
          <div>
            <dt className="text-xs text-zinc-500">Duty</dt>
            <dd className="text-zinc-800">{duty}</dd>
          </div>
        ) : null}
        {windowText ? (
          <div>
            <dt className="text-xs text-zinc-500">Window</dt>
            <dd className="text-zinc-800">{windowText}</dd>
          </div>
        ) : null}
        {cycle ? (
          <div>
            <dt className="text-xs text-zinc-500">Cycle</dt>
            <dd className="text-zinc-800">
              {cycle.label}
              {cycle.startLocal && cycle.endLocal ? (
                <span className="text-zinc-600"> · {cycle.startLocal}–{cycle.endLocal}</span>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-zinc-500">Expectation</dt>
          <dd className="text-zinc-800">{jobFlow.current.expectation}</dd>
        </div>
        {jobFlow.current.targetTime ? (
          <div>
            <dt className="text-xs text-zinc-500">Meal target</dt>
            <dd className="text-zinc-800">{jobFlow.current.targetTime}</dd>
          </div>
        ) : null}
        {nextEvent ? (
          <div>
            <dt className="text-xs text-zinc-500">Next</dt>
            <dd className="text-zinc-800">
              {nextEvent}
              {jobFlow.next.minutesUntil != null && jobFlow.next.minutesUntil > 0
                ? ` · in ${jobFlow.next.minutesUntil} min`
                : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      {jobFlow.progress.phases.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-2" aria-label="Progress">
          {jobFlow.progress.phases.map((phase) => (
            <li
              key={phase.id}
              className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-zinc-700"
            >
              <span>{phase.label}</span>
              <span className="text-zinc-500">{phaseStatusLabel(phase.status)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {jobFlow.attention.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-2" aria-label="Attention">
          {jobFlow.attention.map((item, index) => (
            <li key={`${item.kind}-${index}`} className="text-xs text-zinc-600">
              {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      <OfflineStrip offline={offline} />
    </article>
  );
}

function OfflineStrip({ offline }: { offline: EmployeeJobFlowOfflineProps | null }) {
  if (!offline) return null;
  const parts: string[] = [];
  if (offline.connectivity) parts.push(offline.connectivity.replaceAll("_", " "));
  if (offline.pendingCount && offline.pendingCount > 0) {
    parts.push(`${offline.pendingCount} pending sync`);
  }
  if (offline.stale) parts.push("Stale");
  if (offline.lastSyncedAt) {
    try {
      parts.push(`Last synced ${new Date(offline.lastSyncedAt).toLocaleString()}`);
    } catch {
      /* ignore */
    }
  }
  if (parts.length === 0) return null;
  return (
    <p className="mt-3 border-t border-zinc-100 pt-2 text-xs text-zinc-500" data-testid="job-flow-offline">
      {parts.join(" · ")}
    </p>
  );
}
