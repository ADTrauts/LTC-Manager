import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { ServeryMealServiceControls } from "@/components/servery-meal-service-controls";
import { UnitOperationContextHeader } from "@/components/unit-workspace/unit-operation-context-header";
import { UnitWorkQueuePanel } from "@/components/unit-workspace/unit-work-queue-panel";
import { getSession } from "@/lib/auth";
import { fmtMealLabel } from "@/lib/operations-center";
import { pickDefaultMealTypeForUnitSlots } from "@/lib/servery-meal-service";
import { loadUnitWorkspace } from "@/lib/unit-workspace";

type UnitDashboardPageProps = {
  params: Promise<{ unitId: string }>;
  searchParams?: Promise<{ mealServiceEvent?: string; unitTab?: string; logTab?: string }>;
};

function formatRecordedAt(value: Date | null) {
  if (!value) return "Not recorded";
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default async function UnitDashboardPage({ params, searchParams }: UnitDashboardPageProps) {
  noStore();
  const { unitId } = await params;
  const query = searchParams ? await searchParams : undefined;

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const view = await loadUnitWorkspace(session.facilityId, unitId, {
    unitTab: query?.unitTab,
    logTab: query?.logTab,
    mealServiceEvent: query?.mealServiceEvent,
  });

  if (!view) {
    notFound();
  }

  const {
    unit,
    queries: {
      assignments,
      submissions,
      schedulesToday,
      openRepairs,
      mealServiceHistory,
    },
    activeUnitTab,
    activeLogTab,
    logTabs,
    selectedLogCategory,
    selectedLogHistory,
    expected,
    completed,
    failed,
    missed,
    pending,
    movedOut,
    movedIn,
    effectiveCoverage,
    mealServiceEventMessage,
    mealServiceEventByMeal,
    menuSettings,
    menuUnavailableReason,
    todaysMenu,
    now,
    operationContext,
    workQueue,
  } = view;

  return (
    <section className="space-y-6">
      {mealServiceEventMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {mealServiceEventMessage}
        </div>
      ) : null}
      <header className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 space-y-3">
          <UnitOperationContextHeader unitName={unit.name} context={operationContext} />
          <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Unit sections">
            <Link
              href={`/unit/${unit.id}?unitTab=overview`}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                activeUnitTab === "overview"
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
              }`}
              aria-current={activeUnitTab === "overview" ? "page" : undefined}
            >
              Overview
            </Link>
            <Link
              href={`/unit/${unit.id}?unitTab=logs${activeLogTab ? `&logTab=${encodeURIComponent(activeLogTab)}` : ""}`}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                activeUnitTab === "logs"
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
              }`}
              aria-current={activeUnitTab === "logs" ? "page" : undefined}
            >
              Logs
            </Link>
          </nav>
        </div>
        {unit.unitType === "SERVERY" ? (
          <ServeryMealServiceControls
            unitId={unit.id}
            defaultMealType={pickDefaultMealTypeForUnitSlots(
              unit.mealTimes.map((m) => m.mealType),
              now,
            )}
            returnTab={activeUnitTab}
            returnLogTab={activeLogTab ?? ""}
            slots={unit.mealTimes}
            eventByMeal={Object.fromEntries(
              unit.mealTimes.map((slot) => {
                const ev = mealServiceEventByMeal.get(slot.mealType);
                return [
                  slot.mealType,
                  {
                    mealServiceReadyAt: ev?.mealServiceReadyAt?.toISOString() ?? null,
                    mealServiceStartedAt: ev?.mealServiceStartedAt?.toISOString() ?? null,
                  },
                ];
              }),
            )}
          />
        ) : null}
      </header>

      {activeUnitTab === "overview" ? (
        <>
          <UnitWorkQueuePanel queue={workQueue} />
          {unit.unitType === "SERVERY" ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Today&apos;s menu</h2>
              {menuUnavailableReason ? (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {menuUnavailableReason}
                </div>
              ) : (
                <p className="mt-1 text-sm text-zinc-600">
                  Cycle week {todaysMenu.weekNumber} menu for this day. Use Menu Building to edit.
                </p>
              )}
              {menuUnavailableReason ? null : (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {menuSettings.periods.map((period) => (
                    <div key={period.key} className="rounded border border-zinc-200 p-3">
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
            </section>
          ) : null}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Expected Logs</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{expected}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Completed</p>
          <p className="mt-2 text-2xl font-semibold text-green-700">{completed}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pending</p>
          <p className="mt-2 text-2xl font-semibold text-yellow-700">{pending}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Failed</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">{failed}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Missed</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">{missed}</p>
        </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Today&apos;s Meal Schedule</h2>
          <div className="mt-3 space-y-2">
            {unit.mealTimes.map((mealTime) => (
              <div key={mealTime.mealType} className="flex items-center justify-between rounded border border-zinc-200 p-2 text-sm">
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

        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Operational Issues</h2>
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
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Staffing Today</h2>
        <div className="mt-3 space-y-2 text-sm">
          {schedulesToday.map((entry) => (
            <div key={entry.id} className="rounded border border-zinc-200 p-2">
              <p className="font-medium text-zinc-900">
                {entry.employee.firstName} {entry.employee.lastName}
              </p>
              <p className="text-zinc-600">
                {entry.roleType} · {entry.shift}
                {entry.plannedStart && entry.plannedEnd
                  ? ` · ${entry.plannedStart}-${entry.plannedEnd}`
                  : ""}
              </p>
            </div>
          ))}
          {schedulesToday.length === 0 ? (
            <p className="text-sm text-zinc-500">No schedule entries for this unit today.</p>
          ) : null}
        </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Open Repairs</h2>
        <div className="mt-3 space-y-2 text-sm">
          {openRepairs.map((repair) => (
            <div key={repair.id} className="rounded border border-zinc-200 p-2">
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
        </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Due Logs / Quick Entry</h2>
        <div className="mt-3 space-y-2">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 p-2">
              <div>
                <p className="text-sm font-medium text-zinc-900">{assignment.template.name}</p>
                <p className="text-xs text-zinc-600">
                  {assignment.recurrence}
                  {assignment.mealType ? ` · ${assignment.mealType}` : ""} · {assignment.timesPerDay}x/day
                </p>
              </div>
              <Link
                href={`/logs?tab=submit&assignmentId=${assignment.id}`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100"
              >
                Submit now
              </Link>
            </div>
          ))}
          {assignments.length === 0 ? (
            <p className="text-sm text-zinc-500">No active log assignments for this unit.</p>
          ) : null}
        </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Recent Activity</h2>
        <div className="mt-3 overflow-x-auto">
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
                  <td className="py-2 pr-3 text-zinc-700">
                    {submission.submittedBy?.displayName ?? "Unknown"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {submissions.length === 0 ? (
            <p className="pt-3 text-sm text-zinc-500">No submissions recorded yet for today.</p>
          ) : null}
        </div>
          </section>
        </>
      ) : null}

      {activeUnitTab === "logs" ? (
        <section className="space-y-4">
          <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Unit log categories">
            {logTabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/unit/${unit.id}?unitTab=logs&logTab=${encodeURIComponent(tab.key)}`}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  activeLogTab === tab.key
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
                }`}
                aria-current={activeLogTab === tab.key ? "page" : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {logTabs.length === 0 ? (
            <article className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
              No unit log categories are assigned yet. When a log template is assigned to this unit, its category
              appears here automatically.
            </article>
          ) : null}

          {activeLogTab === "service-log" ? (
            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Service Log</h2>
              <p className="mt-1 text-sm text-zinc-600">
                History by meal and day. On the unit header, ready/started times show for one hour after each tap, then
                clear until recorded again.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500">
                      <th className="py-2 pr-3">Service Date</th>
                      <th className="py-2 pr-3">Meal</th>
                      <th className="py-2 pr-3">Ready At</th>
                      <th className="py-2 pr-3">Ready By</th>
                      <th className="py-2 pr-3">Started At</th>
                      <th className="py-2 pr-3">Started By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mealServiceHistory.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-3 text-zinc-700">{row.serviceDate.toLocaleDateString()}</td>
                        <td className="py-2 pr-3 text-zinc-700">{fmtMealLabel(row.mealType)}</td>
                        <td className="py-2 pr-3 text-zinc-700">{formatRecordedAt(row.mealServiceReadyAt)}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.readyRecordedBy?.displayName ?? "-"}</td>
                        <td className="py-2 pr-3 text-zinc-700">{formatRecordedAt(row.mealServiceStartedAt)}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.startedRecordedBy?.displayName ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mealServiceHistory.length === 0 ? (
                  <p className="pt-3 text-sm text-zinc-500">No meal service timestamps recorded for this unit yet.</p>
                ) : null}
              </div>
            </article>
          ) : null}

          {selectedLogCategory ? (
            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">{selectedLogCategory}</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Recent submissions for this unit in the selected log category.
              </p>
              <div className="mt-3 overflow-x-auto">
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
                    {selectedLogHistory.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-3 text-zinc-700">{row.submittedAt.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.template.name}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.status}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.submittedBy?.displayName ?? "Unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedLogHistory.length === 0 ? (
                  <p className="pt-3 text-sm text-zinc-500">No submissions in this category yet.</p>
                ) : null}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
