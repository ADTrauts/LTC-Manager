import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { BirthdaysCard } from "@/components/operations-center/birthdays-card";
import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { OperationsCenterCards } from "@/components/operations-center/operations-center-cards";
import { SitePulseSummaryCard } from "@/components/operations-center/site-pulse-summary";
import { getSession } from "@/lib/auth";
import { loadOperationsCenterDashboard } from "@/lib/operations-center";

type OperationsCenterTab = "operations" | "employees";

function operationsCenterTabHref(tab: OperationsCenterTab) {
  return tab === "employees" ? "/dashboard?tab=employees" : "/dashboard";
}

type DashboardPageProps = {
  searchParams?: Promise<{ tab?: string | string[] | undefined; onboarding?: string | string[] | undefined }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  noStore();

  const query = searchParams ? await searchParams : {};
  const tabRaw = typeof query.tab === "string" ? query.tab.trim().toLowerCase() : "";
  const activeTab: OperationsCenterTab = tabRaw === "employees" ? "employees" : "operations";
  const onboardingCompleteFlag = typeof query.onboarding === "string" && query.onboarding === "complete";

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const data = await loadOperationsCenterDashboard(session.facilityId);

  const tabLinkClass = (tab: OperationsCenterTab) =>
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
            <li>{data.managerCount > 0 ? "Done" : "Next"}: Add managers in Employees.</li>
            <li>{data.unitCount > 0 ? "Done" : "Next"}: Confirm locations and serving units in Locations.</li>
            <li>Next: Assign route permissions for each role in Administration.</li>
          </ul>
        </section>
      ) : null}
      <header className="border-b border-zinc-200 pb-4">
        <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 lg:justify-self-start">
            Operations Center
          </h1>
          <nav
            className="flex flex-wrap justify-center gap-2 lg:col-start-2 lg:justify-self-center"
            aria-label="Operations Center sections"
          >
            <Link
              href={operationsCenterTabHref("operations")}
              className={tabLinkClass("operations")}
              aria-current={activeTab === "operations" ? "page" : undefined}
            >
              Today
            </Link>
            <Link
              href={operationsCenterTabHref("employees")}
              className={tabLinkClass("employees")}
              aria-current={activeTab === "employees" ? "page" : undefined}
            >
              Employees
            </Link>
          </nav>
          <div className="hidden min-h-px lg:col-start-3 lg:block" aria-hidden />
        </div>
      </header>

      {activeTab === "employees" ? <BirthdaysCard data={data} /> : null}

      {activeTab === "operations" ? (
        <div className="space-y-6">
          <OperationContextBanner context={data.operationContext} />
          <SitePulseSummaryCard pulse={data.sitePulse} />
          <OperationsCenterCards data={data} />
        </div>
      ) : null}
    </section>
  );
}
