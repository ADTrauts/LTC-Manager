import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createCanonicalShiftAction,
  deleteCanonicalShiftAction,
  editCanonicalShiftAction,
} from "@/app/(protected)/staffing/schedule/actions";
import { ScheduleReturnFields } from "@/components/scheduling/schedule-return-fields";
import { WeekEmployeeScheduleGrid } from "@/components/scheduling/week-employee-schedule-grid";
import { WeekLocationCoverageGrid } from "@/components/scheduling/week-location-coverage-grid";
import { WorkShiftPrefillFields } from "@/components/scheduling/work-shift-prefill-fields";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isAnyStaffingOperationalFeatureEnabled } from "@/lib/department-operations";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import {
  buildOperationalTimeContext,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import {
  loadDepartmentDaySchedule,
  loadFacilityDaySchedule,
} from "@/lib/scheduling/load-department-day-schedule";
import { loadDepartmentWeekLocationCoverage } from "@/lib/scheduling/load-department-week-location-coverage";
import {
  loadDepartmentWeekSchedule,
  loadFacilityWeekSchedule,
} from "@/lib/scheduling/load-department-week-schedule";
import {
  buildScheduleWeekRange,
  nextScheduleWeek,
  parseScheduleIsoDate,
  previousScheduleWeek,
  scheduleWeekdayLongLabel,
  shiftScheduleIsoDate,
} from "@/lib/scheduling/schedule-week-range";

function firstSearchParam(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

function staffingHref(params: Record<string, string | undefined | null>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `/staffing?${s}` : "/staffing";
}

type StaffingPageProps = {
  searchParams?: Promise<{
    date?: string | string[] | undefined;
    view?: string | string[] | undefined;
    mode?: string | string[] | undefined;
    error?: string | string[] | undefined;
    saved?: string | string[] | undefined;
    q?: string | string[] | undefined;
    team?: string | string[] | undefined;
    jobRole?: string | string[] | undefined;
    scheduled?: string | string[] | undefined;
    floor?: string | string[] | undefined;
    rooms?: string | string[] | undefined;
  }>;
};

export default async function DepartmentSchedulerPage({ searchParams }: StaffingPageProps) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const canManage = hasAtLeastRole(session.role, "SUPERVISOR");

  const timezone = await loadFacilityTimezone(prisma, session.facilityId);
  const todayIso = buildOperationalTimeContext({
    now: new Date(),
    facilityTimezone: timezone,
  }).facilityLocalDate;

  const query = searchParams ? await searchParams : undefined;
  const selectedDateIso = parseScheduleIsoDate(firstSearchParam(query?.date) ?? "") ?? todayIso;
  const viewRaw = firstSearchParam(query?.view);
  const view: "employee" | "location" = viewRaw === "location" ? "location" : "employee";
  const modeRaw = firstSearchParam(query?.mode);
  const mode: "week" | "day" = modeRaw === "day" ? "day" : "week";
  const actionError = firstSearchParam(query?.error);
  const actionSaved = firstSearchParam(query?.saved) === "1";

  const week = buildScheduleWeekRange({ anchorDate: selectedDateIso });
  const prevWeek = previousScheduleWeek(week.weekStart);
  const nextWeek = nextScheduleWeek(week.weekStart);
  const prevDay = shiftScheduleIsoDate(selectedDateIso, -1);
  const nextDay = shiftScheduleIsoDate(selectedDateIso, 1);

  const departmentId = deptNav.activeDepartmentId;
  const filters = {
    team: firstSearchParam(query?.team),
    jobRole: firstSearchParam(query?.jobRole),
    search: firstSearchParam(query?.q),
    scheduled: firstSearchParam(query?.scheduled),
  };
  const floorFilter = firstSearchParam(query?.floor);
  const showRooms = firstSearchParam(query?.rooms) === "1";

  const weekBundle = departmentId
    ? await loadDepartmentWeekSchedule({
        facilityId: session.facilityId,
        departmentId,
        anchorDate: selectedDateIso,
      })
    : null;

  const locationProjection =
    departmentId && view === "location" && mode === "week"
      ? await loadDepartmentWeekLocationCoverage({
          facilityId: session.facilityId,
          departmentId,
          anchorDate: selectedDateIso,
          session,
        })
      : null;

  const daySchedule =
    departmentId && mode === "day"
      ? await loadDepartmentDaySchedule({
          facilityId: session.facilityId,
          departmentId,
          serviceDate: selectedDateIso,
        })
      : null;

  const facilityWeekSchedules =
    !departmentId && deptNav.showAllDepartmentNav && mode === "week"
      ? await loadFacilityWeekSchedule({
          facilityId: session.facilityId,
          anchorDate: selectedDateIso,
        })
      : [];

  const facilityDaySchedules =
    !departmentId && deptNav.showAllDepartmentNav && mode === "day"
      ? await loadFacilityDaySchedule({
          facilityId: session.facilityId,
          serviceDate: selectedDateIso,
        })
      : [];

  const weekLabel = `${scheduleWeekdayLongLabel(week.weekStart)} – ${scheduleWeekdayLongLabel(week.weekEnd)}`;
  const selectedDateLabel = scheduleWeekdayLongLabel(selectedDateIso);

  return (
    <section className="space-y-6" data-testid="department-scheduler">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Schedule</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Plan who is working across the week. Daily coverage responsibility stays under
            Assignments.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Schedule view">
            <Link
              href={staffingHref({
                date: selectedDateIso,
                view: "employee",
                mode,
                q: filters.search,
                team: filters.team,
                jobRole: filters.jobRole,
                scheduled: filters.scheduled,
              })}
              role="tab"
              aria-selected={view === "employee"}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                view === "employee"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
              }`}
              data-testid="view-toggle-employee"
            >
              Employee View
            </Link>
            <Link
              href={staffingHref({
                date: selectedDateIso,
                view: "location",
                mode: "week",
                floor: floorFilter,
                rooms: showRooms ? "1" : undefined,
              })}
              role="tab"
              aria-selected={view === "location"}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                view === "location"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
              }`}
              data-testid="view-toggle-location"
            >
              Location View
            </Link>
            <span className="mx-1 hidden h-5 w-px bg-zinc-300 sm:inline-block" aria-hidden />
            <Link
              href={staffingHref({
                date: selectedDateIso,
                view,
                mode: "week",
                q: filters.search,
                team: filters.team,
                jobRole: filters.jobRole,
                scheduled: filters.scheduled,
                floor: floorFilter,
              })}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                mode === "week"
                  ? "border-zinc-400 bg-zinc-100 font-medium text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
              data-testid="mode-week"
            >
              Week
            </Link>
            <Link
              href={staffingHref({
                date: selectedDateIso,
                view: "employee",
                mode: "day",
              })}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                mode === "day"
                  ? "border-zinc-400 bg-zinc-100 font-medium text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
              data-testid="mode-day"
            >
              Day roster
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900">
              {mode === "week" ? weekLabel : selectedDateLabel}
            </span>
            {mode === "week" ? (
              <>
                <Link
                  href={staffingHref({
                    date: prevWeek.weekStart,
                    view,
                    mode: "week",
                    q: filters.search,
                    team: filters.team,
                    jobRole: filters.jobRole,
                    scheduled: filters.scheduled,
                    floor: floorFilter,
                    rooms: showRooms ? "1" : undefined,
                  })}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                >
                  Previous week
                </Link>
                <Link
                  href={staffingHref({
                    date: todayIso,
                    view,
                    mode: "week",
                    q: filters.search,
                    team: filters.team,
                    jobRole: filters.jobRole,
                    scheduled: filters.scheduled,
                    floor: floorFilter,
                    rooms: showRooms ? "1" : undefined,
                  })}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                >
                  This week
                </Link>
                <Link
                  href={staffingHref({
                    date: nextWeek.weekStart,
                    view,
                    mode: "week",
                    q: filters.search,
                    team: filters.team,
                    jobRole: filters.jobRole,
                    scheduled: filters.scheduled,
                    floor: floorFilter,
                    rooms: showRooms ? "1" : undefined,
                  })}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                >
                  Next week
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={staffingHref({ date: prevDay, view: "employee", mode: "day" })}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                >
                  Previous
                </Link>
                <Link
                  href={staffingHref({ date: nextDay, view: "employee", mode: "day" })}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                >
                  Next
                </Link>
                <Link
                  href={staffingHref({ date: todayIso, view: "employee", mode: "day" })}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                >
                  Today
                </Link>
              </>
            )}
            <form action="/staffing" method="get" className="inline-flex items-center gap-1">
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="mode" value={mode} />
              <input
                type="date"
                name="date"
                defaultValue={selectedDateIso}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                Go
              </button>
            </form>
            {isOperationalAssignmentsEnabled() ? (
              <Link
                href={`/staffing/assignments?date=${selectedDateIso}`}
                className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
              >
                Daily Assignments
              </Link>
            ) : null}
            {isAnyStaffingOperationalFeatureEnabled("cycles") ? (
              <Link
                href="/staffing/cycles"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Cycle overview
              </Link>
            ) : null}
            <Link
              href={`/staffing/legacy?date=${selectedDateIso}`}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
            >
              Legacy unit staffing
            </Link>
          </div>
        </div>
      </header>

      {actionError ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="scheduler-action-error"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {actionSaved ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          data-testid="scheduler-action-saved"
        >
          Schedule updated.
        </p>
      ) : null}

      {!departmentId ? (
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-950">
            Select a Department to manage its schedule
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            Use the Department selector in the shell. Facility-wide read view is shown below when All
            departments is active. Shift creation is disabled until a Department is selected.
          </p>
          {mode === "week" ? (
            facilityWeekSchedules.length === 0 ? (
              <p className="mt-3 text-sm text-amber-800">
                No shifts or assignments for this week across Departments.
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                {facilityWeekSchedules.map((group) => (
                  <WeekEmployeeScheduleGrid
                    key={group.departmentId}
                    bundle={group.bundle}
                    canManage={false}
                    filters={filters}
                    anchorDate={selectedDateIso}
                    readOnly
                  />
                ))}
              </div>
            )
          ) : facilityDaySchedules.length === 0 ? (
            <p className="mt-3 text-sm text-amber-800">No shifts scheduled for this day across Departments.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {facilityDaySchedules.map((group) => (
                <div key={group.departmentId} className="rounded-lg border border-amber-100 bg-white p-3">
                  <p className="text-sm font-semibold text-zinc-900">{group.departmentName}</p>
                  <ul className="mt-2 divide-y divide-zinc-100">
                    {group.schedule.employees.map((row) => (
                      <li key={row.projection.employeeId} className="py-2 text-sm">
                        <span className="font-medium text-zinc-900">
                          {row.projection.employeeFirstName} {row.projection.employeeLastName}
                        </span>
                        <span className="ml-2 text-zinc-600">
                          {row.shiftWindowLabels.join(", ") || "—"}
                        </span>
                        {row.coverageContext ? (
                          <span className="ml-2 text-xs text-zinc-500">{row.coverageContext}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </article>
      ) : mode === "week" && view === "location" && locationProjection ? (
        <WeekLocationCoverageGrid
          projection={locationProjection}
          canManage={canManage}
          anchorDate={selectedDateIso}
          floorFilter={floorFilter}
          showRooms={showRooms}
        />
      ) : mode === "week" && weekBundle ? (
        <WeekEmployeeScheduleGrid
          bundle={weekBundle}
          canManage={canManage}
          filters={filters}
          anchorDate={selectedDateIso}
        />
      ) : mode === "day" && daySchedule ? (
        <DayRoster
          schedule={daySchedule}
          selectedDateIso={selectedDateIso}
          canManage={canManage}
        />
      ) : null}
    </section>
  );
}

function DayRoster({
  schedule,
  selectedDateIso,
  canManage,
}: {
  schedule: Awaited<ReturnType<typeof loadDepartmentDaySchedule>>;
  selectedDateIso: string;
  canManage: boolean;
}) {
  return (
    <>
      <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{schedule.departmentName}</h2>
            <p className="text-sm text-zinc-600">Department day roster</p>
          </div>
          <p className="text-xs text-zinc-500" data-testid="scheduler-department-name">
            {schedule.employees.length} on board · {schedule.unscheduledPool.length} available to
            schedule
          </p>
        </div>

        {schedule.employees.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-zinc-800">No shifts scheduled for this day.</p>
            <p className="mt-1 text-xs text-zinc-500">Add a Shift for a Department employee below.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm" data-testid="scheduler-roster-table">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3 font-medium">Employee</th>
                  <th className="py-2 pr-3 font-medium">Team</th>
                  <th className="py-2 pr-3 font-medium">Job Role</th>
                  <th className="py-2 pr-3 font-medium">Shift</th>
                  <th className="py-2 pr-3 font-medium">Coverage</th>
                  {canManage ? <th className="py-2 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {schedule.employees.map((row) => {
                  const p = row.projection;
                  return (
                    <tr key={p.employeeId} data-testid={`scheduler-row-${p.employeeId}`}>
                      <td className="py-2.5 pr-3 align-top">
                        <p className="font-medium text-zinc-900">
                          {p.employeeFirstName} {p.employeeLastName}
                        </p>
                        {row.jobTitleDisplayName ? (
                          <p className="text-xs text-zinc-500">{row.jobTitleDisplayName}</p>
                        ) : null}
                        {p.relationship === "ASSIGNED_UNSCHEDULED" ? (
                          <p className="mt-0.5 text-xs font-medium text-amber-800">
                            Assigned, not scheduled
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 align-top text-zinc-700">
                        {p.teamDisplayName ?? "—"}
                      </td>
                      <td className="py-2.5 pr-3 align-top text-zinc-700">
                        {p.jobRoleDisplayName ?? (
                          <span className="text-zinc-400">No Job Role</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 align-top">
                        {row.shiftWindowLabels.length > 0 ? (
                          <ul className="space-y-0.5">
                            {row.shiftWindowLabels.map((label, idx) => (
                              <li key={`${p.employeeId}-${idx}`} className="text-zinc-900">
                                {label}
                                {row.isLegacyOnly && idx === 0 ? (
                                  <span className="ml-1 text-xs text-zinc-400">(meal schedule)</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                        {canManage &&
                          p.shifts.map((shift) =>
                            shift.plannedStart && shift.plannedEnd ? (
                              <details key={shift.scheduleEntryId} className="mt-1">
                                <summary className="cursor-pointer text-xs text-zinc-500">
                                  Edit shift
                                </summary>
                                <form
                                  action={editCanonicalShiftAction}
                                  className="mt-2 space-y-2 rounded border border-zinc-200 bg-zinc-50 p-2"
                                >
                                  <ScheduleReturnFields
                                    date={selectedDateIso}
                                    view="employee"
                                    mode="day"
                                  />
                                  <input type="hidden" name="shiftId" value={shift.scheduleEntryId} />
                                  <input type="hidden" name="serviceDate" value={selectedDateIso} />
                                  <WorkShiftPrefillFields
                                    workShifts={schedule.workShifts}
                                    initialStart={shift.plannedStart}
                                    initialEnd={shift.plannedEnd}
                                  />
                                  <button
                                    type="submit"
                                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100"
                                  >
                                    Save times
                                  </button>
                                </form>
                              </details>
                            ) : null,
                          )}
                      </td>
                      <td className="py-2.5 pr-3 align-top text-zinc-700">
                        <p>{row.coverageContext ?? row.relationshipLabel}</p>
                        {isOperationalAssignmentsEnabled() ? (
                          <Link
                            href={`/staffing/assignments?date=${selectedDateIso}`}
                            className="mt-1 inline-block text-xs font-medium text-indigo-700 hover:underline"
                          >
                            {p.relationship === "SCHEDULED_UNASSIGNED"
                              ? "Assign coverage"
                              : "View assignment"}
                          </Link>
                        ) : null}
                      </td>
                      {canManage ? (
                        <td className="py-2.5 align-top">
                          <div className="flex flex-col gap-1">
                            {p.shifts.map((shift) => (
                              <form key={shift.scheduleEntryId} action={deleteCanonicalShiftAction}>
                                <ScheduleReturnFields
                                  date={selectedDateIso}
                                  view="employee"
                                  mode="day"
                                />
                                <input type="hidden" name="shiftId" value={shift.scheduleEntryId} />
                                <input type="hidden" name="serviceDate" value={selectedDateIso} />
                                <button
                                  type="submit"
                                  className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
                                  title={
                                    p.assignments.length > 0
                                      ? "Employee will remain assigned but no longer scheduled"
                                      : "Remove shift"
                                  }
                                >
                                  Unschedule
                                </button>
                              </form>
                            ))}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {canManage ? (
        <article
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
          data-testid="add-shift-panel"
        >
          <h2 className="text-sm font-semibold text-zinc-900">+ Add shift</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Requires Department membership. Unit, meal slot, and platform role are not required.
            Creating a Shift does not create a Daily Assignment.
          </p>
          <form action={createCanonicalShiftAction} className="mt-3 space-y-3">
            <ScheduleReturnFields date={selectedDateIso} view="employee" mode="day" />
            <input type="hidden" name="departmentId" value={schedule.departmentId} />
            <input type="hidden" name="serviceDate" value={selectedDateIso} />
            <select
              name="employeeId"
              required
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              data-testid="add-shift-employee"
            >
              <option value="">Employee…</option>
              {schedule.unscheduledPool.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName}, {e.firstName}
                  {e.jobRoleDisplayName ? ` · ${e.jobRoleDisplayName}` : " · No Job Role"}
                  {e.teamDisplayName ? ` · ${e.teamDisplayName}` : ""}
                </option>
              ))}
              {schedule.employees
                .filter((r) => r.projection.relationship !== "ASSIGNED_UNSCHEDULED")
                .map((r) => (
                  <option key={`seg-${r.projection.employeeId}`} value={r.projection.employeeId}>
                    {r.projection.employeeLastName}, {r.projection.employeeFirstName} (add segment)
                  </option>
                ))}
            </select>
            <WorkShiftPrefillFields workShifts={schedule.workShifts} />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create Shift
            </button>
          </form>
        </article>
      ) : null}
    </>
  );
}
