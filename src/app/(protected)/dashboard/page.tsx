import Link from "next/link";
import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { BirthdaysCard } from "@/components/operations-center/birthdays-card";
import { MorningBriefCard } from "@/components/operations-center/morning-brief-card";
import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { OperationsCenterCards } from "@/components/operations-center/operations-center-cards";
import { SecondaryTeamLinks } from "@/components/operations-center/secondary-team-links";
import { SitePulseSummaryCard } from "@/components/operations-center/site-pulse-summary";
import { PageHeader } from "@/components/design-system/page-header";
import { hasAtLeastRole } from "@/lib/access";
import { getOrGenerateMorningBrief } from "@/lib/ai";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  isAiBriefEnabled,
  isProjectionOperationsCenterEnabled,
} from "@/lib/feature-flags";
import { loadOperationsCenterDashboard } from "@/lib/operations-center";
import { assembleProjectedOperationsCenter } from "@/lib/operations-center/projection/load";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";

type DashboardPageProps = {
  searchParams?: Promise<{
    tab?: string | string[] | undefined;
    onboarding?: string | string[] | undefined;
  }>;
};

function isSecondaryEmployeesView(tabRaw: string): boolean {
  return tabRaw === "employees";
}

function OperationsCenterProjectionUnavailable({
  message,
}: {
  message: string;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-6">
      <h2 className="text-lg font-semibold text-zinc-900">
        Operations Center unavailable
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        Configuration could not be resolved for this session. Operational data
        was not loaded.
      </p>
      <p className="mt-3 text-xs text-zinc-500">{message}</p>
    </section>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  noStore();

  const query = searchParams ? await searchParams : {};
  const tabRaw =
    typeof query.tab === "string" ? query.tab.trim().toLowerCase() : "";
  const showSecondaryEmployees = isSecondaryEmployeesView(tabRaw);
  const onboardingCompleteFlag =
    typeof query.onboarding === "string" && query.onboarding === "complete";

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const deptNav = await resolveActiveDepartmentForShell(
    session,
    await cookies(),
  );

  const projectionEnabled = isProjectionOperationsCenterEnabled();
  const assembled = projectionEnabled
    ? await assembleProjectedOperationsCenter(session, {
        memo: createProjectionRuntimeRequestScope(),
        activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
      })
    : null;

  if (projectionEnabled && (!assembled || assembled.error || !assembled.data)) {
    return (
      <section className="space-y-6">
        <PageHeader
          icon="operationsCenter"
          title="Operations Center"
          subtitle="Exception-first operational overview."
          compact
        />
        <OperationsCenterProjectionUnavailable
          message={
            assembled?.error ??
            "Operations Center Projection is not available."
          }
        />
      </section>
    );
  }

  const data =
    assembled?.data ??
    (await loadOperationsCenterDashboard(session.facilityId, {
      activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
    }));
  const eligibleCardIds = assembled?.scope?.eligibleCardIds;

  // Morning Brief: unchanged AI contracts this wave. Cache-peek only; no SSR
  // provider calls. Projected OC scopes are not yet wired into brief generation
  // (documented for the AI Projection wave).
  const aiEnabled = isAiBriefEnabled();
  const morningBrief =
    aiEnabled && !showSecondaryEmployees
      ? await getOrGenerateMorningBrief({
          facilityId: session.facilityId,
          departmentKey: deptNav.activeOperationalDepartmentKey,
          allowProvider: false,
        })
      : null;
  const canRefreshBrief = hasAtLeastRole(session.role, "MANAGER");

  return (
    <section className="space-y-6">
      {onboardingCompleteFlag ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-lg font-semibold text-emerald-900">Setup complete</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Your workspace is ready. Use this checklist to finish launch tasks.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-emerald-900">
            <li>
              {data.managerCount > 0 ? "Done" : "Next"}: Add managers in{" "}
              <Link href="/employees" className="font-medium underline">
                Employees
              </Link>
              .
            </li>
            <li>
              {data.unitCount > 0 ? "Done" : "Next"}: Confirm locations and
              serving units in Locations.
            </li>
            <li>Next: Assign route permissions for each role in Administration.</li>
          </ul>
        </section>
      ) : null}

      {showSecondaryEmployees ? (
        <>
          <header className="border-b border-zinc-200 pb-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-zinc-600 underline hover:text-zinc-900"
            >
              ← Back to Operations Center
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
              Team highlights
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Secondary employee content — not part of the operational exception
              sweep.
            </p>
          </header>
          <BirthdaysCard data={data} />
        </>
      ) : (
        <>
          <PageHeader
            icon="operationsCenter"
            title="Operations Center"
            subtitle="Exception-first view for today's meal service."
            compact
          />
          <div className="space-y-6">
            <OperationContextBanner context={data.operationContext} embedded />
            <SitePulseSummaryCard pulse={data.sitePulse} />
            {morningBrief ? (
              <MorningBriefCard
                initialBrief={morningBrief}
                departmentKey={
                  deptNav.activeOperationalDepartmentKey ?? "DIETARY"
                }
                aiEnabled={aiEnabled}
                canRefresh={canRefreshBrief}
              />
            ) : null}
            <OperationsCenterCards
              data={data}
              eligibleCardIds={eligibleCardIds}
            />
            <SecondaryTeamLinks
              birthdayCount={data.birthdaysThisMonth.length}
            />
          </div>
        </>
      )}
    </section>
  );
}
