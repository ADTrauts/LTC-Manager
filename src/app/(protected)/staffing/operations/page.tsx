import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SupervisorWorkActionsPanel } from "@/components/department-work/supervisor-work-actions-panel";
import { PlantRequestRoutingPanel } from "@/components/operational-requests/plant-request-routing-panel";
import { PlantTriagePanel } from "@/components/operational-requests/plant-triage-panel";
import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  isAnyStaffingOperationalFeatureEnabled,
  isDepartmentWorkPlansEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import {
  loadSupervisorOperationsBoard,
  type SupervisorExceptionGroup,
  type SupervisorExceptionItem,
  type SupervisorExceptionTemporal,
} from "@/lib/dietary-job-flow";
import { isPlantOperationsEnabled } from "@/lib/feature-flags";
import { listRoutesForFacility } from "@/lib/operational-requests";
import { prisma } from "@/lib/prisma";

const GROUP_ORDER: SupervisorExceptionGroup[] = [
  "Staffing",
  "Coverage",
  "Readiness",
  "ServiceTiming",
  "Evidence",
  "Work",
  "Asset",
  "Equipment",
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

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

type OperationsPageProps = {
  searchParams?: Promise<{
    floor?: string | string[];
    unit?: string | string[];
    zone?: string | string[];
    employee?: string | string[];
  }>;
};

export default async function SupervisorOperationsBoardPage({
  searchParams,
}: OperationsPageProps) {
  noStore();

  if (!isAnyStaffingOperationalFeatureEnabled("jobFlow")) {
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

  const department = await resolveStaffingOperationalDepartment({
    facilityId: session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    feature: "jobFlow",
  });

  if (!department) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Operations Board"
          subtitle="No operational department is available for this facility."
          compact
        />
      </section>
    );
  }

  const query = searchParams ? await searchParams : undefined;
  const filterFloor = firstParam(query?.floor);
  const filterUnit = firstParam(query?.unit);
  const filterZone = firstParam(query?.zone);
  const filterEmployee = firstParam(query?.employee);

  let board;
  try {
    board = await loadSupervisorOperationsBoard({
      session,
      facilityId: session.facilityId,
      departmentId: department.id,
      filters: {
        floor: filterFloor,
        unit: filterUnit,
        zone: filterZone,
        employee: filterEmployee,
      },
    });
  } catch (error) {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Operations Board" subtitle={department.name} compact />
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
          subtitle={`${department.name} Job Flow is not enabled.`}
          compact
        />
      </section>
    );
  }

  const canOpenBuilder = hasAtLeastRole(session.role, "MANAGER");
  const builderHref = `/admin/departments/${department.id}?tab=cycles`;
  const exceptionGroups = groupExceptions(board.exceptions);
  const { header, summary, filters, locationCoverage, plantOperations } = board;

  const workPlansEnabled = isDepartmentWorkPlansEnabled(department.key);
  const oneOffUnits = workPlansEnabled
    ? await prisma.unit.findMany({
        where: {
          facilityId: session.facilityId,
          isActive: true,
          departmentResponsibilities: { some: { departmentId: department.id } },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 40,
      })
    : [];

  const showPlantRouting =
    department.key === "PLANT" &&
    isPlantOperationsEnabled() &&
    hasAtLeastRole(session.role, "MANAGER") &&
    session.authMethod !== "QUICK_PIN";

  let plantRouting: {
    routes: Array<{
      id: string;
      requestingDepartmentId: string;
      requestingDepartmentName: string;
      requestingDepartmentKey: string;
      responsibleDepartmentId: string;
      responsibleDepartmentName: string;
      responsibleDepartmentKey: string;
      isActive: boolean;
      sortOrder: number;
      note: string | null;
    }>;
    departments: Array<{ id: string; name: string; key: string }>;
  } | null = null;

  if (showPlantRouting) {
    try {
      const [routes, departments] = await Promise.all([
        listRoutesForFacility(session, session.facilityId, department.id),
        prisma.department.findMany({
          where: { facilityId: session.facilityId, isActive: true },
          select: { id: true, name: true, key: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
      ]);
      plantRouting = {
        routes: routes.map((r) => ({
          id: r.id,
          requestingDepartmentId: r.requestingDepartmentId,
          requestingDepartmentName: r.requestingDepartment.name,
          requestingDepartmentKey: r.requestingDepartment.key,
          responsibleDepartmentId: r.responsibleDepartmentId,
          responsibleDepartmentName: r.responsibleDepartment.name,
          responsibleDepartmentKey: r.responsibleDepartment.key,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
          note: r.note,
        })),
        departments,
      };
    } catch {
      plantRouting = null;
    }
  }

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

      {plantRouting ? (
        <PlantRequestRoutingPanel
          plantDepartmentId={header.departmentId}
          routes={plantRouting.routes}
          departments={plantRouting.departments}
        />
      ) : null}

      {plantOperations ? (
        <PlantTriagePanel
          plantDepartmentId={header.departmentId}
          requests={plantOperations.requests}
          technicians={plantOperations.technicians}
          summary={{
            newRequests: plantOperations.newRequests,
            untriaged: plantOperations.untriaged,
            urgent: plantOperations.urgent,
            openWorkOrders: plantOperations.openWorkOrders,
            inProgressWorkOrders: plantOperations.inProgressWorkOrders,
            waitingVendor: plantOperations.waitingVendor,
            waitingParts: plantOperations.waitingParts,
            overdueWorkOrders: plantOperations.overdueWorkOrders,
            unassignedWorkOrders: plantOperations.unassignedWorkOrders,
            outOfServiceAssets: plantOperations.outOfServiceAssets,
          }}
        />
      ) : null}

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
        {summary.locationRequired != null ? (
          <>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-900">
              Locations covered: {summary.locationCovered ?? 0}
            </span>
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
              Locations at risk: {summary.locationAtRisk ?? 0}
            </span>
            <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-900">
              Locations unassigned: {summary.locationUncovered ?? 0}
            </span>
            <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-violet-900">
              Locations overlapping: {summary.locationOverlapping ?? 0}
            </span>
          </>
        ) : null}
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

      {filters ? (
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          data-testid="supervisor-ops-location-filters"
        >
          <label className="text-xs text-zinc-600">
            Floor
            <select
              name="floor"
              defaultValue={filters.floor ?? ""}
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">All floors</option>
              {filters.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-600">
            Unit
            <select
              name="unit"
              defaultValue={filters.unit ?? ""}
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">All units</option>
              {filters.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-600">
            Zone
            <select
              name="zone"
              defaultValue={filters.zone ?? ""}
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">All zones</option>
              {filters.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-600">
            Employee
            <select
              name="employee"
              defaultValue={filters.employee ?? ""}
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">All employees</option>
              {filters.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Apply filters
          </button>
          <Link
            href="/staffing/operations"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            Clear
          </Link>
        </form>
      ) : null}

      {locationCoverage ? (
        <section className="space-y-4" data-testid="supervisor-ops-location-exceptions">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">
              Unassigned locations ({locationCoverage.unassigned.length})
            </h2>
            {locationCoverage.unassigned.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 shadow-sm">
                No unassigned Rooms / Spaces for the current filters.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
                {locationCoverage.unassigned.map((row) => (
                  <li
                    key={row.unitSpaceId}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    data-testid="supervisor-ops-unassigned-location"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{row.label}</p>
                      <p className="text-xs text-zinc-600">
                        {[row.floorName, row.unitName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Link
                      href="/staffing/assignments"
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                    >
                      Open Assignment Board
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">
              Overlapping locations ({locationCoverage.overlapping.length})
            </h2>
            {locationCoverage.overlapping.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 shadow-sm">
                No overlapping Room / Space responsibility for the current filters.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
                {locationCoverage.overlapping.map((row) => (
                  <li
                    key={row.unitSpaceId}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    data-testid="supervisor-ops-overlapping-location"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{row.label}</p>
                      <p className="text-xs text-zinc-600">
                        {[row.floorName, row.unitName].filter(Boolean).join(" · ")}
                        {row.employeeLabels.length > 0
                          ? ` · ${row.employeeLabels.join(", ")}`
                          : ""}
                      </p>
                    </div>
                    <Link
                      href="/staffing/assignments"
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                    >
                      Open Assignment Board
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

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
                    key={`${group}-${item.locationLabel ?? item.unitId ?? item.employeeId ?? index}-${item.status}`}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    data-testid="supervisor-operations-exception"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900">
                          {item.locationLabel ?? item.unitName ?? item.employeeName ?? item.status}
                        </p>
                        <StatusBadge variant={temporalVariant(item.temporal)}>
                          {item.temporal.replace(/([a-z])([A-Z])/g, "$1 $2")}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600">
                        {item.status}
                        {item.unitName && item.locationLabel ? ` · ${item.unitName}` : ""}
                        {item.employeeName && item.locationLabel ? ` · ${item.employeeName}` : ""}
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

      {workPlansEnabled ? (
        <SupervisorWorkActionsPanel
          facilityId={session.facilityId}
          departmentId={department.id}
          units={oneOffUnits}
        />
      ) : null}
    </section>
  );
}
