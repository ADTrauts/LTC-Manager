import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isDietaryOperationalCyclesEnabled } from "@/lib/feature-flags";
import {
  loadSupervisorCycleOverview,
  type SupervisorUnitCycleRow,
} from "@/lib/operational-cycles";
import { prisma } from "@/lib/prisma";

function statusVariant(
  row: SupervisorUnitCycleRow,
): "success" | "warning" | "neutral" | "in_progress" {
  if (row.cycleState === "NOT_CONFIGURED") return "warning";
  switch (row.milestoneStatus) {
    case "READY_CONFIRMED":
    case "SERVICE_STARTED":
      return "success";
    case "SERVICE_STARTED_LATE":
    case "STARTED_WITHOUT_READY":
    case "CONFLICT_REVIEW":
      return "warning";
    case "NOT_CONFIRMED":
    case "READY_NOT_CONFIRMED":
      return "in_progress";
    default:
      return "neutral";
  }
}

function statusLabel(row: SupervisorUnitCycleRow): string {
  if (row.cycleState === "NOT_CONFIGURED") return "Missing config";
  if (row.milestoneLabel) return row.milestoneLabel;
  return row.cycleState.replaceAll("_", " ");
}

export default async function SupervisorCycleOverviewPage() {
  noStore();

  if (!isDietaryOperationalCyclesEnabled()) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/workspace");
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
          title="Cycle overview"
          subtitle="Dietary department is not available for this facility."
          compact
        />
      </section>
    );
  }

  let overview;
  try {
    overview = await loadSupervisorCycleOverview({
      session,
      facilityId: session.facilityId,
      departmentId: dietary.id,
    });
  } catch (error) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Cycle overview" subtitle={dietary.name} compact />
        <p className="text-sm text-zinc-600">
          {error instanceof Error ? error.message : "Unable to load cycle overview."}
        </p>
      </section>
    );
  }

  const canOpenBuilder = hasAtLeastRole(session.role, "MANAGER");
  const builderHref = `/admin/departments/${dietary.id}?tab=cycles`;

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="supervisor-cycle-overview">
      <PageHeader
        title="Cycle overview"
        subtitle={`${dietary.name} · ${overview.operationalDateKey} — exception-first servery status.`}
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

      <div className="flex flex-wrap gap-2 text-xs text-zinc-700">
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Ready confirmed: {overview.counts.readyConfirmed}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Started: {overview.counts.serviceStarted}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Not confirmed: {overview.counts.notConfirmed}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Late: {overview.counts.late}
        </span>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
          Missing config: {overview.counts.missingConfig}
        </span>
      </div>

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
        {overview.rows.length === 0 ? (
          <li className="px-4 py-6 text-sm text-zinc-500">No servery or kitchen units found.</li>
        ) : (
          overview.rows.map((row) => (
            <li
              key={row.unitId}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid="supervisor-cycle-row"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-900">{row.unitName}</p>
                  <StatusBadge variant={statusVariant(row)}>{statusLabel(row)}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-zinc-600">
                  {row.cycleLabel ?? "No active cycle"}
                  {row.mealType ? ` · ${row.mealType}` : ""}
                  {row.mealTargetTime ? ` · target ${row.mealTargetTime}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={row.workspaceHref}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Unit Workspace
                </Link>
                <Link
                  href={row.assignmentBoardHref}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Assignment Board
                </Link>
                {canOpenBuilder ? (
                  <Link
                    href={row.builderHref}
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Builder
                  </Link>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
