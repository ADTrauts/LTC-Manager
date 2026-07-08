import Link from "next/link";

import type { UnitQueryResult } from "@/lib/unit-workspace";
import type { UnitWorkspaceUnit, UnitWorkspaceViewModel } from "@/lib/unit-workspace";

type UnitContextPanelProps = {
  unit: UnitWorkspaceUnit;
  assignments: UnitQueryResult["assignments"];
  submissions: UnitQueryResult["submissions"];
  schedulesToday: UnitQueryResult["schedulesToday"];
  openRepairs: UnitQueryResult["openRepairs"];
  expected: number;
  completed: number;
  pending: number;
  failed: number;
  missed: number;
  movedIn: number;
  movedOut: number;
  effectiveCoverage: number;
  menuSettings: UnitWorkspaceViewModel["menuSettings"];
  menuUnavailableReason: string | null;
  todaysMenu: UnitWorkspaceViewModel["todaysMenu"];
  activeLogTab: string | null;
};

export function UnitContextPanel({
  unit,
  assignments,
  submissions,
  schedulesToday,
  openRepairs,
  expected,
  completed,
  pending,
  failed,
  missed,
  movedIn,
  movedOut,
  effectiveCoverage,
  menuSettings,
  menuUnavailableReason,
  todaysMenu,
  activeLogTab,
}: UnitContextPanelProps) {
  const historyHref = `/unit/${unit.id}?unitTab=logs${
    unit.unitType === "SERVERY"
      ? "&logTab=service-log"
      : activeLogTab
        ? `&logTab=${encodeURIComponent(activeLogTab)}`
        : ""
  }`;

  return (
    <section className="space-y-3 border-t border-zinc-200 pt-5" data-testid="unit-context-panel">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">About this location</p>
        <p className="mt-1 text-sm text-zinc-600">
          Secondary context — expand only when something looks off.
        </p>
      </div>

      <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 open:bg-white open:shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 text-sm font-semibold text-zinc-900 touch-manipulation marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex w-full items-center justify-between gap-3">
            <span>Log summary · schedule · coverage</span>
            <span className="text-xs font-medium text-zinc-500 group-open:hidden">Show</span>
            <span className="hidden text-xs font-medium text-zinc-500 group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-zinc-100 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Expected Logs</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{expected}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Completed</p>
              <p className="mt-1 text-xl font-semibold text-green-700">{completed}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pending</p>
              <p className="mt-1 text-xl font-semibold text-yellow-700">{pending}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Failed</p>
              <p className="mt-1 text-xl font-semibold text-red-700">{failed}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Missed</p>
              <p className="mt-1 text-xl font-semibold text-red-700">{missed}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="text-base font-semibold text-zinc-900">Today&apos;s Meal Schedule</h3>
              <div className="mt-3 space-y-2">
                {unit.mealTimes.map((mealTime) => (
                  <div
                    key={mealTime.mealType}
                    className="flex items-center justify-between rounded border border-zinc-200 p-2 text-sm"
                  >
                    <span className="text-zinc-700">
                      {mealTime.mealType.charAt(0)}
                      {mealTime.mealType.slice(1).toLowerCase()}
                    </span>
                    <span className="font-medium text-zinc-900">{mealTime.scheduledTime}</span>
                  </div>
                ))}
                {unit.mealTimes.length === 0 ? (
                  <p className="text-sm text-zinc-500">No meal times configured for this unit.</p>
                ) : null}
              </div>
            </article>

            <article className="rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="text-base font-semibold text-zinc-900">Coverage snapshot</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="rounded border border-zinc-200 p-2">
                  <p className="font-medium text-zinc-900">Open Repairs</p>
                  <p className="text-zinc-600">
                    {openRepairs.length === 0
                      ? "No open repairs in this unit."
                      : `${openRepairs.length} active repair ticket(s).`}
                  </p>
                </div>
                <div className="rounded border border-zinc-200 p-2">
                  <p className="font-medium text-zinc-900">Staffing Coverage</p>
                  <p className="text-zinc-600">
                    Scheduled {schedulesToday.length} · Moved In {movedIn} · Moved Out {movedOut} · Effective{" "}
                    {effectiveCoverage}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </details>

      {unit.unitType === "SERVERY" ? (
        <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 open:bg-white open:shadow-sm">
          <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 text-sm font-semibold text-zinc-900 touch-manipulation marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="flex w-full items-center justify-between gap-3">
              <span>Today&apos;s menu</span>
              <span className="text-xs font-medium text-zinc-500 group-open:hidden">Show</span>
              <span className="hidden text-xs font-medium text-zinc-500 group-open:inline">Hide</span>
            </span>
          </summary>
          <div className="border-t border-zinc-100 px-4 py-4">
            {menuUnavailableReason ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {menuUnavailableReason}
              </div>
            ) : (
              <p className="text-sm text-zinc-600">
                Cycle week {todaysMenu.weekNumber} menu for this day. Use Menu Building to edit.
              </p>
            )}
            {menuUnavailableReason ? null : (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {menuSettings.periods.map((period) => (
                  <div key={period.key} className="rounded border border-zinc-200 bg-white p-3">
                    <p className="text-sm font-semibold text-zinc-900">{period.label}</p>
                    <div className="mt-2 space-y-2 text-sm text-zinc-700">
                      {period.categories.map((category) => {
                        const values = todaysMenu.grouped[period.key]?.[category] ?? [];
                        return (
                          <div key={category}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{category}</p>
                            <p>{values.length > 0 ? values.join(", ") : "Not set"}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      ) : null}

      <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 open:bg-white open:shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 text-sm font-semibold text-zinc-900 touch-manipulation marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex w-full items-center justify-between gap-3">
            <span>Staffing today</span>
            <span className="text-xs font-medium text-zinc-500 group-open:hidden">Show</span>
            <span className="hidden text-xs font-medium text-zinc-500 group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-2 border-t border-zinc-100 px-4 py-4 text-sm">
          {schedulesToday.map((entry) => (
            <div key={entry.id} className="rounded border border-zinc-200 bg-white p-2">
              <p className="font-medium text-zinc-900">
                {entry.employee.firstName} {entry.employee.lastName}
              </p>
              <p className="text-zinc-600">
                {entry.roleType} · {entry.shift}
                {entry.plannedStart && entry.plannedEnd ? ` · ${entry.plannedStart}-${entry.plannedEnd}` : ""}
              </p>
            </div>
          ))}
          {schedulesToday.length === 0 ? (
            <p className="text-sm text-zinc-500">No schedule entries for this unit today.</p>
          ) : null}
        </div>
      </details>

      <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 open:bg-white open:shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 text-sm font-semibold text-zinc-900 touch-manipulation marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex w-full items-center justify-between gap-3">
            <span>Open repairs</span>
            <span className="text-xs font-medium text-zinc-500 group-open:hidden">
              {openRepairs.length > 0 ? `${openRepairs.length}` : "Show"}
            </span>
            <span className="hidden text-xs font-medium text-zinc-500 group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-2 border-t border-zinc-100 px-4 py-4 text-sm">
          {openRepairs.map((repair) => (
            <div key={repair.id} className="rounded border border-zinc-200 bg-white p-2">
              <p className="font-medium text-zinc-900">
                {repair.repairCode} · {repair.title}
              </p>
              <p className="text-zinc-600">
                {repair.priority} · {repair.status}
              </p>
            </div>
          ))}
          {openRepairs.length === 0 ? (
            <p className="text-sm text-zinc-500">No open repairs for this unit.</p>
          ) : null}
          <p className="pt-1">
            <Link href="/repairs" className="text-sm font-medium text-zinc-800 underline hover:text-zinc-600">
              View all repairs
            </Link>
          </p>
        </div>
      </details>

      <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 open:bg-white open:shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 text-sm font-semibold text-zinc-900 touch-manipulation marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex w-full items-center justify-between gap-3">
            <span>Due logs / quick entry</span>
            <span className="text-xs font-medium text-zinc-500 group-open:hidden">Show</span>
            <span className="hidden text-xs font-medium text-zinc-500 group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-2 border-t border-zinc-100 px-4 py-4">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">{assignment.template.name}</p>
                <p className="text-xs text-zinc-600">
                  {assignment.recurrence}
                  {assignment.mealType ? ` · ${assignment.mealType}` : ""} · {assignment.timesPerDay}x/day
                </p>
              </div>
              <Link
                href={`/logs?tab=submit&assignmentId=${assignment.id}`}
                className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
              >
                Submit now
              </Link>
            </div>
          ))}
          {assignments.length === 0 ? (
            <p className="text-sm text-zinc-500">No active log assignments for this unit.</p>
          ) : null}
        </div>
      </details>

      <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 open:bg-white open:shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-3 text-sm font-semibold text-zinc-900 touch-manipulation marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex w-full items-center justify-between gap-3">
            <span>Recent activity &amp; history</span>
            <span className="text-xs font-medium text-zinc-500 group-open:hidden">Show</span>
            <span className="hidden text-xs font-medium text-zinc-500 group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-zinc-100 px-4 py-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 pr-3">Submitted</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">By</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3 text-zinc-700">{submission.submittedAt.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-zinc-700">{submission.template.name}</td>
                    <td className="py-2 pr-3 text-zinc-700">{submission.status}</td>
                    <td className="py-2 pr-3 text-zinc-700">{submission.submittedBy?.displayName ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {submissions.length === 0 ? (
              <p className="pt-3 text-sm text-zinc-500">No submissions recorded yet for today.</p>
            ) : null}
          </div>
          <p>
            <Link href={historyHref} className="text-sm font-medium text-zinc-800 underline hover:text-zinc-600">
              {unit.unitType === "SERVERY" ? "Open service log history" : "Open log history"}
            </Link>
          </p>
        </div>
      </details>
    </section>
  );
}
