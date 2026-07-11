import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { ServeryMealServiceControls } from "@/components/servery-meal-service-controls";
import { UnitContextPanel } from "@/components/unit-workspace/unit-context-panel";
import { UnitOperationContextHeader } from "@/components/unit-workspace/unit-operation-context-header";
import { UnitWorkQueuePanel } from "@/components/unit-workspace/unit-work-queue-panel";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
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

  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
  const view = await loadUnitWorkspace(session.facilityId, unitId, {
    unitTab: query?.unitTab,
    logTab: query?.logTab,
    mealServiceEvent: query?.mealServiceEvent,
  }, {
    activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
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
    readiness,
  } = view;

  const unitTypeLabel =
    unit.unitType.charAt(0) + unit.unitType.slice(1).toLowerCase().replace(/_/g, " ");

  return (
    <section className="mx-auto max-w-5xl space-y-5 sm:space-y-6" data-testid="unit-workspace">
      {mealServiceEventMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          {mealServiceEventMessage}
        </div>
      ) : null}

      {/* Layer 1 — Orientation */}
      <header className="space-y-3 border-b border-zinc-200 pb-4 sm:space-y-4 sm:pb-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] md:items-start md:gap-4">
          <UnitOperationContextHeader
            unitName={unit.name}
            unitType={unit.unitType}
            unitTypeLabel={unitTypeLabel}
            context={operationContext}
            readiness={readiness}
          />
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
        </div>
        <nav className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Unit sections">
          <Link
            href={`/unit/${unit.id}?unitTab=overview`}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold touch-manipulation ${
              activeUnitTab === "overview"
                ? "bg-zinc-900 text-white shadow-sm"
                : "border-2 border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
            }`}
            aria-current={activeUnitTab === "overview" ? "page" : undefined}
          >
            Workspace
          </Link>
          <Link
            href={`/unit/${unit.id}?unitTab=logs${activeLogTab ? `&logTab=${encodeURIComponent(activeLogTab)}` : ""}`}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold touch-manipulation ${
              activeUnitTab === "logs"
                ? "bg-zinc-900 text-white shadow-sm"
                : "border-2 border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
            }`}
            aria-current={activeUnitTab === "logs" ? "page" : undefined}
          >
            Logs &amp; history
          </Link>
        </nav>
      </header>

      {activeUnitTab === "overview" ? (
        <div className="space-y-6 sm:space-y-7">
          {/* Layer 2 — Next work */}
          <UnitWorkQueuePanel queue={workQueue} />

          {/* Layer 3 — Context (secondary, not dominant) */}
          <UnitContextPanel
            unit={unit}
            assignments={assignments}
            submissions={submissions}
            schedulesToday={schedulesToday}
            openRepairs={openRepairs}
            expected={expected}
            completed={completed}
            pending={pending}
            failed={failed}
            missed={missed}
            movedIn={movedIn}
            movedOut={movedOut}
            effectiveCoverage={effectiveCoverage}
            menuSettings={menuSettings}
            menuUnavailableReason={menuUnavailableReason}
            todaysMenu={todaysMenu}
            activeLogTab={activeLogTab}
          />
        </div>
      ) : null}

      {activeUnitTab === "logs" ? (
        <section className="space-y-4">
          <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Unit log categories">
            {logTabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/unit/${unit.id}?unitTab=logs&logTab=${encodeURIComponent(tab.key)}`}
                className={`inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold touch-manipulation ${
                  activeLogTab === tab.key
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "border-2 border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
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
