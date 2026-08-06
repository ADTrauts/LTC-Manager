import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  loadSupervisorOperationsBoard,
  type SupervisorExceptionGroup,
  type SupervisorExceptionItem,
  type SupervisorExceptionTemporal,
} from "@/lib/dietary-job-flow";
import { isDietaryJobFlowEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

const GROUP_ORDER: SupervisorExceptionGroup[] = [
  "Staffing",
  "Coverage",
  "Readiness",
  "ServiceTiming",
  "OfflineSync",
  "Configuration",
];

function temporalVariant(
  temporal: SupervisorExceptionTemporal,
): "success" | "warning" | "neutral" | "in_progress" {
  switch (temporal) {
    case "Confirmed":
      return "success";
    case "Late":
    case "Current":
      return "warning";
    case "DueSoon":
    case "NotConfirmed":
      return "in_progress";
    default:
      return "neutral";
  }
}

function groupExceptions(items: SupervisorExceptionItem[]) {
  const map = new Map<SupervisorExceptionGroup, SupervisorExceptionItem[]>();
  for (const group of GROUP_ORDER) map.set(group, []);
  for (const item of items) {
    const list = map.get(item.group) ?? [];
    list.push(item);
    map.set(item.group, list);
  }
  return GROUP_ORDER.map((group) => ({ group, items: map.get(group) ?? [] })).filter(
    (g) => g.items.length > 0,
  );
}

export default async function SupervisorOperationsBoardPage() {
  noStore();

  if (!isDietaryJobFlowEnabled()) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/workspace");
  }

  if (session.authMethod === "QUICK_PIN") {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Operations Board"
          subtitle="Password sign-in is required to open the Supervisor Operations Board."
          compact
        />
      </section>
    );
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);

  const dietary =
    (deptNav.activeDepartmentId
      ? await prisma.department.findFirst({
          where: {
            id: deptNav.activeDepartmentId,
            facilityId: session.facilityId,
            key: "DIETARY",
            isActive: true,
          },
          select: { id: true, name: true },
        })
      : null) ??
    (await prisma.department.findFirst({
      where: { facilityId: session.facilityId, key: "DIETARY", isActive: true },
      select: { id: true, name: true },
    }));

  if (!dietary) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Operations Board"
          subtitle="Dietary department is not available for this facility."
          compact
        />
      </section>
    );
  }

  let board;
  try {
    board = await loadSupervisorOperationsBoard({
      session,
      facilityId: session.facilityId,
      departmentId: dietary.id,
    });
  } catch (error) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Operations Board" subtitle={dietary.name} compact />
        <p className="text-sm text-zinc-600">
          {error instanceof Error ? error.message : "Unable to load Operations Board."}
        </p>
      </section>
    );
  }

  if (!board) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Operations Board"
          subtitle="Dietary Job Flow is not enabled."
          compact
        />
      </section>
    );
  }

  const canOpenBuilder = hasAtLeastRole(session.role, "MANAGER");
  const builderHref = `/admin/departments/${dietary.id}?tab=cycles`;
  const exceptionGroups = groupExceptions(board.exceptions);
  const { header, summary } = board;

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="supervisor-operations-board">
      <PageHeader
        title="Operations Board"
        subtitle={`${header.facilityName} · ${header.departmentName} · ${header.operationalDateKey}`}
        compact
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staffing/assignments"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Assignment Board
            </Link>
            <Link
              href="/staffing/cycles"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Cycle overview
            </Link>
            <Link
              href="/staffing"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Staffing
            </Link>
            {canOpenBuilder ? (
              <Link
                href={builderHref}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Department Builder
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-zinc-700">
          {header.currentCycleLabel ? (
            <>
              <span className="font-medium text-zinc-900">Current:</span> {header.currentCycleLabel}
            </>
          ) : (
            <span className="text-zinc-500">No active cycle</span>
          )}
          {header.nextCycleLabel ? (
            <span className="ml-3">
              <span className="font-medium text-zinc-900">Next:</span> {header.nextCycleLabel}
            </span>
          ) : null}
          {header.planStatus ? (
            <span className="ml-3 text-xs text-zinc-500">Plan: {header.planStatus}</span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-zinc-700">
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Scheduled: {summary.scheduled}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Assigned: {summary.assigned}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Unassigned: {summary.unassigned}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Call-offs: {summary.callOffs}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Covered: {summary.covered}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          At risk: {summary.atRisk}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Uncovered: {summary.uncovered}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Ready confirmed: {summary.readyConfirmed}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Ready not confirmed: {summary.readyNotConfirmed}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Started: {summary.started}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Started late: {summary.startedLate}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Conflicts: {summary.conflicts}
        </span>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-900">Exceptions</h2>
        {exceptionGroups.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500 shadow-sm">
            No exceptions for this operational date.
          </p>
        ) : (
          exceptionGroups.map(({ group, items }) => (
            <div key={group} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">{group}</h3>
              <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
                {items.map((item, index) => (
                  <li
                    key={`${group}-${item.unitId ?? item.employeeId ?? index}-${item.status}`}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    data-testid="supervisor-operations-exception"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900">
                          {item.unitName ?? item.employeeName ?? item.status}
                        </p>
                        <StatusBadge variant={temporalVariant(item.temporal)}>
                          {item.temporal.replace(/([a-z])([A-Z])/g, "$1 $2")}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600">
                        {item.status}
                        {item.cycleLabel ? ` · ${item.cycleLabel}` : ""}
                        {item.time ? ` · ${item.time}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={item.sourceHref}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        {item.availableActions[0] ?? "Open"}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-900">
          View all Units ({board.viewAllUnits.length})
        </summary>
        <ul className="divide-y divide-zinc-200 border-t border-zinc-200">
          {board.viewAllUnits.length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">No units found.</li>
          ) : (
            board.viewAllUnits.map((row) => (
              <li
                key={row.unitId}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid="supervisor-operations-unit"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{row.unitName}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {row.cycleLabel ?? "No active cycle"}
                    {row.mealTargetTime ? ` · target ${row.mealTargetTime}` : ""}
                    {row.milestoneLabel ? ` · ${row.milestoneLabel}` : ""}
                    {row.coverageState ? ` · ${row.coverageState.replaceAll("_", " ")}` : ""}
                  </p>
                </div>
                <Link
                  href={row.workspaceHref}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Unit Workspace
                </Link>
              </li>
            ))
          )}
        </ul>
      </details>
    </section>
  );
}
