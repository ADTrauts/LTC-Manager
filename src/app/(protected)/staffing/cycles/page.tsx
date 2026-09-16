import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  isAnyStaffingOperationalFeatureEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import {
  delayKeyTimeExpectationAction,
  delayMealExpectationAction,
  completeKeyTimeExpectationAction,
} from "@/app/(protected)/staffing/cycles/actions";
import {
  formatClock12,
  loadSupervisorCycleOverview,
  type SupervisorUnitCycleRow,
} from "@/lib/operational-cycles";

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

  if (!isAnyStaffingOperationalFeatureEnabled("cycles")) {
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

  const department = await resolveStaffingOperationalDepartment({
    facilityId: session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    feature: "cycles",
  });

  if (!department) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Cycle overview"
          subtitle="No operational department is available for this facility."
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
      departmentId: department.id,
    });
  } catch (error) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Cycle overview" subtitle={department.name} compact />
        <p className="text-sm text-zinc-600">
          {error instanceof Error ? error.message : "Unable to load cycle overview."}
        </p>
      </section>
    );
  }

  const canOpenBuilder = hasAtLeastRole(session.role, "MANAGER");
  const builderHref = `/admin/departments/${department.id}?tab=cycles`;
  const isEvs = department.key === "EVS";

  const groupedRows = (() => {
    const groups = new Map<string, SupervisorUnitCycleRow[]>();
    for (const row of overview.rows) {
      const key = row.parentCycleLabel ?? row.cycleLabel ?? "Other";
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()];
  })();

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="supervisor-cycle-overview">
      <PageHeader
        title="Cycle overview"
        subtitle={
          isEvs
            ? `${department.name} · ${overview.operationalDateKey} — exception-first cycle status.`
            : `${department.name} · ${overview.operationalDateKey} — exception-first servery status.`
        }
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

      {!isEvs ? (
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
          {overview.counts.keyTimesTotal > 0 ? (
            <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
              Key Times: {overview.counts.keyTimesCompleted}/{overview.counts.keyTimesTotal}
              {overview.counts.keyTimesOverdue > 0
                ? ` · ${overview.counts.keyTimesOverdue} overdue`
                : ""}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-xs text-zinc-700">
          <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
            Units: {overview.rows.length}
          </span>
          <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
            Missing config: {overview.counts.missingConfig}
          </span>
          {overview.counts.keyTimesTotal > 0 ? (
            <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
              Key Times: {overview.counts.keyTimesCompleted}/{overview.counts.keyTimesTotal}
            </span>
          ) : null}
        </div>
      )}

      {overview.keyTimeGroups.length > 0 ? (
        <div className="space-y-3" data-testid="supervisor-key-time-groups">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Key Times
          </h2>
          {overview.keyTimeGroups.map((group) => (
            <div
              key={`${group.cycleId}-${group.keyTimeGroupId}-${group.expectedToday}`}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {group.parentCycleLabel
                      ? `${group.parentCycleLabel} → ${group.cycleLabel}`
                      : group.cycleLabel}
                  </p>
                  <p className="text-xs text-zinc-600">
                    Due {formatClock12(group.expectedToday) ?? group.expectedToday} ·{" "}
                    {group.completed}/{group.total} rooms complete
                  </p>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-zinc-100">
                {group.rooms.map((room) => (
                  <li
                    key={room.expectationId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                    data-testid="supervisor-key-time-room"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{room.spaceName}</p>
                      <p className="text-xs text-zinc-600">
                        {room.facilityRoomTypeName ? `${room.facilityRoomTypeName} · ` : ""}
                        {room.statusLabel}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {room.canAdjust ? (
                        <form action={delayKeyTimeExpectationAction}>
                          <input type="hidden" name="expectationId" value={room.expectationId} />
                          <input type="hidden" name="minutes" value="5" />
                          <button
                            type="submit"
                            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                            data-testid="delay-key-time-plus-5"
                          >
                            +5 min
                          </button>
                        </form>
                      ) : null}
                      {room.canComplete ? (
                        <form action={completeKeyTimeExpectationAction}>
                          <input type="hidden" name="expectationId" value={room.expectationId} />
                          <button
                            type="submit"
                            className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700"
                            data-testid="complete-key-time"
                          >
                            Mark complete
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {overview.rows.length === 0 && overview.keyTimeGroups.length === 0 ? (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <li className="px-4 py-6 text-sm text-zinc-500">
            {isEvs ? "No units found for this department." : "No meal-service locations for today."}
          </li>
        </ul>
      ) : overview.rows.length === 0 ? null : (
        <div className="space-y-4">
          {groupedRows.map(([groupLabel, rows]) => (
            <div key={groupLabel} className="space-y-2" data-testid="supervisor-cycle-group">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {groupLabel}
              </h2>
              <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
                {rows.map((row) => (
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
                        {row.parentCycleLabel && row.cycleLabel
                          ? row.cycleLabel
                          : row.displayPath ?? row.cycleLabel ?? "No active cycle"}
                        {row.mealType
                          ? ` · ${row.mealType.charAt(0)}${row.mealType.slice(1).toLowerCase()}`
                          : ""}
                      </p>
                      {row.expectationId || row.configuredTime || row.timingStatusLabel ? (
                        <div className="mt-2 space-y-0.5 text-xs text-zinc-700" data-testid="meal-timing">
                          <p>
                            Configured{" "}
                            {formatClock12(row.configuredTime) ?? "—"}
                          </p>
                          <p>
                            Expected today{" "}
                            {formatClock12(row.expectedToday) ?? "not configured"}
                            {row.adjustedTime && row.adjustedByLabel
                              ? ` · Adjusted by ${row.adjustedByLabel}`
                              : row.adjustedTime
                                ? " · Adjusted"
                                : ""}
                          </p>
                          <p>
                            {row.actualStartedTime
                              ? `Actual ${formatClock12(row.actualStartedTime)}`
                              : row.timingStatusLabel ?? "Not started"}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-600">
                          {row.mealTargetTime ? `target ${row.mealTargetTime}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.canAdjust && row.expectationId ? (
                        <form action={delayMealExpectationAction}>
                          <input type="hidden" name="expectationId" value={row.expectationId} />
                          <input type="hidden" name="minutes" value="5" />
                          <button
                            type="submit"
                            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                            data-testid="delay-meal-plus-5"
                          >
                            +5 min
                          </button>
                        </form>
                      ) : null}
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
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
