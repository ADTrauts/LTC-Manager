import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { AppCard } from "@/components/design-system/AppCard";
import { PageHeader } from "@/components/design-system/page-header";
import { CoverageSummaryCards } from "@/components/todays-work/coverage-list-summary";
import { TodaysWorkCallDownList } from "@/components/todays-work/todays-work-call-down-list";
import { TodaysWorkCoverageList } from "@/components/todays-work/todays-work-coverage-list";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isOperationalAssignmentsEnabled, isProjectionTodaysWorkEnabled } from "@/lib/feature-flags";
import {
  loadDailyAssignmentBoard,
  buildAssignmentFulfillmentSummary,
} from "@/lib/scheduling/operational-assignments";
import { loadTemplatesForDepartment } from "@/lib/scheduling/operational-assignments/load-templates";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import {
  assembleProjectedTodaysWorkCoverage,
  filterCallDownsToProjectedUnits,
  loadCallDownList,
  loadCoverageList,
} from "@/lib/todays-work";
import { TodaysWorkProjectionUnavailable } from "@/components/todays-work/todays-work-experience-contributions";

export default async function TodaysWorkCoveragePage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);

  let coverage = await loadCoverageList(session.facilityId);
  let callDowns = await loadCallDownList(session.facilityId);

  if (isProjectionTodaysWorkEnabled()) {
    const assembled = await assembleProjectedTodaysWorkCoverage(session, {
      memo: createProjectionRuntimeRequestScope(),
      activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
    });
    if (assembled.enabled && "error" in assembled && assembled.error && !("coverage" in assembled)) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-coverage-page">
          <PageHeader icon="todaysWork" eyebrow="Today's Work" title="Coverage" />
          <TodaysWorkProjectionUnavailable message={assembled.error} />
        </section>
      );
    }
    if (assembled.enabled && "coverage" in assembled && assembled.coverage) {
      coverage = assembled.coverage;
      callDowns = filterCallDownsToProjectedUnits(
        callDowns,
        assembled.projection.projectedUnitIds,
      );
    }
  }

  const { summary, operationContext, items, priorityGap, dateIso } = coverage;

  const assignmentsEnabled = isOperationalAssignmentsEnabled();
  let fulfillmentEl: React.ReactNode = null;

  if (assignmentsEnabled && deptNav.activeDepartmentId && deptNav.activeOperationalDepartmentKey) {
    const [board, templates] = await Promise.all([
      loadDailyAssignmentBoard({
        facilityId: session.facilityId,
        serviceDate: dateIso,
        departmentId: deptNav.activeDepartmentId,
        departmentKey: deptNav.activeOperationalDepartmentKey,
      }),
      loadTemplatesForDepartment({
        facilityId: session.facilityId,
        departmentId: deptNav.activeDepartmentId,
        departmentKey: deptNav.activeOperationalDepartmentKey,
      }),
    ]);

    const fulfillment = buildAssignmentFulfillmentSummary({
      templates,
      assignments: board.assignments,
      scheduledEmployeeCount: board.employees.filter((e) => !e.hasCallDown).length,
    });

    if (fulfillment.available) {
      const activeAssignments = board.assignments.filter(
        (a) => a.status === "PLANNED" || a.status === "ACTIVE",
      );
      const coverageCount = activeAssignments.filter(
        (a) => a.source === "COVERAGE" || a.source === "REASSIGNMENT",
      ).length;

      fulfillmentEl = (
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900">Operational Assignment Summary</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <span className="text-zinc-700">
              {board.employees.filter((e) => !e.hasCallDown).length} scheduled
              {" · "}
              {activeAssignments.length} assigned
            </span>
            {fulfillment.unfilledPositions > 0 && (
              <span className="text-amber-700">
                {fulfillment.unfilledPositions} position{fulfillment.unfilledPositions !== 1 ? "s" : ""} unfilled
              </span>
            )}
            {coverageCount > 0 && (
              <span className="text-blue-700">
                {coverageCount} coverage assignment{coverageCount !== 1 ? "s" : ""}
              </span>
            )}
            {fulfillment.conflicts > 0 && (
              <span className="text-red-700">
                {fulfillment.conflicts} overlapping primary assignment{fulfillment.conflicts !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </article>
      );
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-coverage-page">
      <PageHeader
        icon="todaysWork"
        eyebrow="Today's Work"
        title="Coverage"
        subtitle="See where staffing gaps are today and jump into the staffing grid to resolve them."
        actions={
          <Link
            href="/today"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Back to hub
          </Link>
        }
        below={<OperationContextBanner context={operationContext} embedded />}
      />

      <CoverageSummaryCards summary={summary} />

      {fulfillmentEl}

      <AppCard
        as="section"
        title="Staffing grid"
        subtitle={`Assign employees by location for ${dateIso}.`}
        actions={
          <div className="flex gap-2">
            {assignmentsEnabled && hasAtLeastRole(session.role, "MANAGER") && (
              <Link
                href={`/staffing/assignments?date=${dateIso}`}
                className="inline-flex min-h-11 items-center rounded-md border-2 border-indigo-300 bg-indigo-50 px-4 text-sm font-semibold text-indigo-900 touch-manipulation hover:bg-indigo-100"
              >
                Assignment Board
              </Link>
            )}
            <Link
              href={`/staffing?date=${dateIso}`}
              className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
            >
              Open staffing
            </Link>
          </div>
        }
      />

      <TodaysWorkCallDownList items={callDowns.items} compact />

      <AppCard as="section">
        <TodaysWorkCoverageList items={items} priorityGap={priorityGap} />
      </AppCard>
    </section>
  );
}
