import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { MealType, UnitType } from "@prisma/client";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { loadOperationsCenterDashboard } from "@/lib/operations-center";

function fmtMealLabel(meal: MealType) {
  return meal.charAt(0) + meal.slice(1).toLowerCase();
}

type DashboardTab = "units" | "employees";

function dashboardTabHref(tab: DashboardTab) {
  return tab === "employees" ? "/dashboard?tab=employees" : "/dashboard";
}

type DashboardPageProps = {
  searchParams?: Promise<{ tab?: string | string[] | undefined; onboarding?: string | string[] | undefined }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  noStore();

  const query = searchParams ? await searchParams : {};
  const tabRaw = typeof query.tab === "string" ? query.tab.trim().toLowerCase() : "";
  const activeTab: DashboardTab = tabRaw === "employees" ? "employees" : "units";
  const onboardingCompleteFlag = typeof query.onboarding === "string" && query.onboarding === "complete";

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const {
    month,
    managerCount,
    birthdaysThisMonth,
    unitCount,
    mealBoards,
    totals,
    unitsWithExceptions,
    unitsMissingStaffing,
    unitCards,
    openRepairCount,
    urgentRepairCount,
  } = await loadOperationsCenterDashboard(session.facilityId);

  const tabLinkClass = (tab: DashboardTab) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
      activeTab === tab
        ? "bg-zinc-900 text-white shadow-sm"
        : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
    }`;

  return (
    <section className="space-y-6">
      {onboardingCompleteFlag ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-lg font-semibold text-emerald-900">Setup complete</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Your workspace is ready. Use this checklist to finish launch tasks.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-emerald-900">
            <li>{managerCount > 0 ? "Done" : "Next"}: Add managers in Employees.</li>
            <li>{unitCount > 0 ? "Done" : "Next"}: Confirm locations and serving units in Units.</li>
            <li>Next: Assign route permissions for each role in Admin.</li>
          </ul>
        </section>
      ) : null}
      <header className="border-b border-zinc-200 pb-4">
        <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 lg:justify-self-start">
            Global Dashboard
          </h1>
          <nav
            className="flex flex-wrap justify-center gap-2 lg:col-start-2 lg:justify-self-center"
            aria-label="Dashboard sections"
          >
            <Link
              href={dashboardTabHref("units")}
              className={tabLinkClass("units")}
              aria-current={activeTab === "units" ? "page" : undefined}
            >
              Units
            </Link>
            <Link
              href={dashboardTabHref("employees")}
              className={tabLinkClass("employees")}
              aria-current={activeTab === "employees" ? "page" : undefined}
            >
              Employees
            </Link>
          </nav>
          <div className="hidden min-h-px lg:col-start-3 lg:block" aria-hidden />
        </div>
      </header>

      {activeTab === "employees" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Birthdays this month</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Month/day only (no year). Add birthdays on each employee&apos;s profile.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-zinc-700">
            {birthdaysThisMonth.map((emp) => (
              <li key={emp.id}>
                <Link href={`/employees#employee-${emp.id}`} className="text-zinc-900 underline hover:text-zinc-700">
                  {emp.firstName} {emp.lastName}
                </Link>
                {emp.birthDay != null ? (
                  <span className="text-zinc-500"> — {month}/{emp.birthDay}</span>
                ) : null}
              </li>
            ))}
            {birthdaysThisMonth.length === 0 ? (
              <li className="text-zinc-500">No birthdays on file for this month.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {activeTab === "units" ? (
        <>
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Meal Boards</h2>
        <p className="mt-1 max-w-3xl text-xs text-zinc-500">
          Serveries list only while a ready or started tap for that meal is within the last hour; status shows Ready
          and/or Started. Other units show log status (Logged or Not logged).
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {mealBoards.map((board) => (
            <article key={board.meal} className="rounded-lg border border-zinc-200 p-3">
              <h3 className="text-sm font-semibold text-zinc-900">{fmtMealLabel(board.meal)}</h3>
              <div className="mt-2 space-y-1">
                {board.rows.map((row) => (
                  <div key={row.unitId} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700">{row.unitName}</span>
                    <span className="text-zinc-500">
                      {row.mealTime} ·{" "}
                      {row.unitType === UnitType.SERVERY ? (
                        <>
                          {row.isReadyLive ? <span className="font-semibold text-yellow-700">Ready</span> : null}
                          {row.isReadyLive && row.isStartedLive ? <span className="text-zinc-400"> · </span> : null}
                          {row.isStartedLive ? <span className="font-semibold text-emerald-700">Started</span> : null}
                          {!row.isReadyLive && !row.isStartedLive ? "—" : null}
                        </>
                      ) : (
                        row.statusLabel
                      )}
                    </span>
                  </div>
                ))}
                {board.rows.length === 0 ? (
                  <p className="text-xs text-zinc-500">No units on this board for this meal.</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Expected Logs</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{totals.expected}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Completed</p>
          <p className="mt-2 text-2xl font-semibold text-green-700">{totals.completed}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pending</p>
          <p className="mt-2 text-2xl font-semibold text-yellow-700">{totals.pending}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Failed</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">{totals.failed}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Missed</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">{totals.missed}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Units Missing Staffing</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">{unitsMissingStaffing.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Open Repairs</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">
            {openRepairCount}
            <span className="ml-1 text-sm font-medium text-zinc-500">({urgentRepairCount} urgent)</span>
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Unit Exceptions</h2>
          <div className="mt-3 space-y-2">
            {unitsWithExceptions.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between rounded border border-zinc-200 p-2">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{unit.name}</p>
                  <p className="text-xs text-zinc-600">
                    Pending {unit.pending} · Failed {unit.failed} · Missed {unit.missed} · Staff{" "}
                    {unit.staffingCount} · Repairs {unit.openRepairCount}
                  </p>
                </div>
                <Link
                  href={`/unit/${unit.id}`}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                >
                  Open unit
                </Link>
              </div>
            ))}
            {unitsWithExceptions.length === 0 ? (
              <p className="text-sm text-zinc-500">No log exceptions right now.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Unit Log Board</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Expected</th>
                  <th className="py-2 pr-3">Completed</th>
                  <th className="py-2 pr-3">Pending</th>
                </tr>
              </thead>
              <tbody>
                {unitCards.map((unit) => (
                  <tr key={unit.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">
                      <Link href={`/unit/${unit.id}`} className="text-zinc-900 hover:underline">
                        {unit.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">{unit.expected}</td>
                    <td className="py-2 pr-3 text-zinc-700">{unit.completed}</td>
                    <td className="py-2 pr-3 text-zinc-700">{unit.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
        </>
      ) : null}
    </section>
  );
}
