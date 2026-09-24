import Link from "next/link";

import {
  copyCanonicalShiftAction,
  createCanonicalShiftAction,
  deleteCanonicalShiftAction,
  editCanonicalShiftAction,
} from "@/app/(protected)/staffing/schedule/actions";
import { ScheduleReturnFields } from "@/components/scheduling/schedule-return-fields";
import { WorkShiftPrefillFields } from "@/components/scheduling/work-shift-prefill-fields";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import type { DepartmentWeekScheduleBundle } from "@/lib/scheduling/load-department-week-schedule";
import {
  filterDepartmentWeekEmployees,
  type DepartmentWeekEmployeeRow,
} from "@/lib/scheduling/department-week-schedule-projection";
import {
  scheduleWeekdayLongLabel,
  scheduleWeekdayShortLabel,
} from "@/lib/scheduling/schedule-week-range";

type Props = {
  bundle: DepartmentWeekScheduleBundle;
  canManage: boolean;
  filters: {
    team?: string | null;
    jobRole?: string | null;
    search?: string | null;
    scheduled?: string | null;
  };
  /** Anchor date preserved in return links (any day in week). */
  anchorDate: string;
  readOnly?: boolean;
};

function relationshipMarker(day: DepartmentWeekEmployeeRow["days"][number]): {
  symbol: string;
  label: string;
  className: string;
} | null {
  if (day.needsAssignment) {
    return {
      symbol: "!",
      label: "Scheduled, needs assignment",
      className: "text-amber-700",
    };
  }
  if (day.assignedUnscheduled) {
    return {
      symbol: "○",
      label: "Assigned, not scheduled",
      className: "text-amber-800",
    };
  }
  // SCHEDULED_AND_ASSIGNED stays quiet.
  return null;
}

function staffingHref(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `/staffing?${s}` : "/staffing";
}

export function WeekEmployeeScheduleGrid({
  bundle,
  canManage,
  filters,
  anchorDate,
  readOnly = false,
}: Props) {
  const { projection, workShifts, employeePool } = bundle;
  const week = projection.week;
  const rows = filterDepartmentWeekEmployees(projection, {
    team: filters.team,
    jobRole: filters.jobRole,
    search: filters.search,
    scheduledOnly: filters.scheduled === "scheduled",
    unscheduledOnly: filters.scheduled === "unscheduled",
  });
  const oaEnabled = isOperationalAssignmentsEnabled();
  const manage = canManage && !readOnly;
  const weekSummary = (
    <p className="text-xs text-zinc-500" data-testid="week-summary">
      {projection.summary.scheduledEmployeeCount} scheduled
      {projection.summary.needAssignmentDayCount > 0
        ? ` · ${projection.summary.needAssignmentDayCount} need assignment`
        : ""}
      {projection.summary.assignedUnscheduledDayCount > 0
        ? ` · ${projection.summary.assignedUnscheduledDayCount} assigned but not scheduled`
        : ""}
      {` · ${projection.summary.employeeCount} employees`}
    </p>
  );

  return (
    <div className="space-y-4" data-testid="week-employee-grid">
      {readOnly ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-sm font-semibold text-zinc-900">{projection.departmentName}</h2>
          {weekSummary}
        </div>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <input type="hidden" name="date" value={anchorDate} />
        <input type="hidden" name="view" value="employee" />
        <input type="hidden" name="mode" value="week" />
        <label className="text-xs text-zinc-600">
          Search
          <input
            type="search"
            name="q"
            defaultValue={filters.search ?? ""}
            placeholder="Employee…"
            className="mt-0.5 block w-40 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          Team
          <select
            name="team"
            defaultValue={filters.team ?? ""}
            className="mt-0.5 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All teams</option>
            {projection.filterOptions.teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          Job Role
          <select
            name="jobRole"
            defaultValue={filters.jobRole ?? ""}
            className="mt-0.5 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All roles</option>
            {projection.filterOptions.jobRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          Scheduled
          <select
            name="scheduled"
            defaultValue={filters.scheduled ?? ""}
            className="mt-0.5 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="scheduled">Scheduled this week</option>
            <option value="unscheduled">No shifts this week</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
        >
          Apply
        </button>
        {!readOnly ? <div className="ml-auto self-center">{weekSummary}</div> : null}
      </form>

      {projection.summary.employeeCount === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-zinc-800">
            No active employees belong to this Department.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Add membership in Employee Builder, then return here to schedule.
          </p>
          <Link
            href="/employees"
            className="mt-3 inline-block text-sm font-medium text-indigo-700 hover:underline"
          >
            Open Employee Builder
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 font-medium">Employee</th>
                {week.days.map((day) => (
                  <th key={day} className="min-w-[7.5rem] px-2 py-2 font-medium">
                    <Link
                      href={staffingHref({
                        date: day,
                        mode: "day",
                        view: "employee",
                      })}
                      className="hover:text-zinc-900 hover:underline"
                      title={`Open day roster for ${scheduleWeekdayLongLabel(day)}`}
                    >
                      <span className="block">{scheduleWeekdayShortLabel(day)}</span>
                      <span className="block font-normal normal-case text-zinc-400">
                        {day.slice(5)}
                      </span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => {
                const name = `${row.employeeFirstName} ${row.employeeLastName}`;
                return (
                  <tr key={row.employeeId} data-testid={`week-emp-row-${row.employeeId}`}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top">
                      <p className="font-medium text-zinc-900">{name}</p>
                      <p className="text-xs text-zinc-500">
                        {[row.teamDisplayName, row.jobRoleDisplayName ?? "No Job Role"]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    {row.days.map((day) => {
                      const marker = relationshipMarker(day);
                      const emptyLabel = `${name}, ${scheduleWeekdayLongLabel(day.serviceDate)}, no shift`;
                      return (
                        <td
                          key={day.serviceDate}
                          className="px-2 py-2 align-top"
                          data-testid={`week-cell-${row.employeeId}-${day.serviceDate}`}
                        >
                          {day.shifts.length === 0 ? (
                            <div>
                              {day.assignedUnscheduled ? (
                                <p className="text-xs font-medium text-amber-800">
                                  Assigned, not scheduled
                                </p>
                              ) : (
                                <span className="text-xs text-zinc-400" aria-label={emptyLabel}>
                                  Off
                                </span>
                              )}
                              {manage ? (
                                <details className="mt-1">
                                  <summary
                                    className="cursor-pointer text-xs font-medium text-indigo-700"
                                    aria-label={`Add shift for ${emptyLabel}`}
                                  >
                                    + Add
                                  </summary>
                                  <form
                                    action={createCanonicalShiftAction}
                                    className="mt-2 w-56 space-y-2 rounded border border-zinc-200 bg-zinc-50 p-2"
                                  >
                                    <ScheduleReturnFields
                                      date={anchorDate}
                                      view="employee"
                                      mode="week"
                                    />
                                    <input
                                      type="hidden"
                                      name="departmentId"
                                      value={projection.departmentId}
                                    />
                                    <input type="hidden" name="employeeId" value={row.employeeId} />
                                    <input
                                      type="hidden"
                                      name="serviceDate"
                                      value={day.serviceDate}
                                    />
                                    <WorkShiftPrefillFields workShifts={workShifts} />
                                    <button
                                      type="submit"
                                      className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100"
                                    >
                                      Create Shift
                                    </button>
                                  </form>
                                </details>
                              ) : null}
                            </div>
                          ) : (
                            <ul className="space-y-1">
                              {day.shifts.map((shift) => (
                                <li key={shift.scheduleEntryId}>
                                  {manage ? (
                                    <details>
                                      <summary
                                        className="cursor-pointer font-medium text-zinc-900"
                                        aria-label={shift.accessibleLabel}
                                      >
                                        {shift.compactLabel ?? "Shift"}
                                      </summary>
                                      <div className="mt-2 w-56 space-y-2 rounded border border-zinc-200 bg-zinc-50 p-2">
                                        <form
                                          action={editCanonicalShiftAction}
                                          className="space-y-2"
                                        >
                                          <ScheduleReturnFields
                                            date={anchorDate}
                                            view="employee"
                                            mode="week"
                                          />
                                          <input
                                            type="hidden"
                                            name="shiftId"
                                            value={shift.scheduleEntryId}
                                          />
                                          <input
                                            type="hidden"
                                            name="serviceDate"
                                            value={day.serviceDate}
                                          />
                                          <WorkShiftPrefillFields
                                            workShifts={workShifts}
                                            initialStart={shift.plannedStart ?? ""}
                                            initialEnd={shift.plannedEnd ?? ""}
                                          />
                                          <button
                                            type="submit"
                                            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100"
                                          >
                                            Save times
                                          </button>
                                        </form>
                                        <form action={copyCanonicalShiftAction} className="space-y-1 border-t border-zinc-200 pt-2">
                                          <ScheduleReturnFields
                                            date={anchorDate}
                                            view="employee"
                                            mode="week"
                                          />
                                          <input
                                            type="hidden"
                                            name="sourceShiftId"
                                            value={shift.scheduleEntryId}
                                          />
                                          <input
                                            type="hidden"
                                            name="serviceDate"
                                            value={day.serviceDate}
                                          />
                                          <p className="text-xs font-medium text-zinc-700">
                                            Copy to…
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {week.days
                                              .filter((d) => d !== day.serviceDate)
                                              .map((d) => (
                                                <label
                                                  key={d}
                                                  className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    name="targetDates"
                                                    value={d}
                                                  />
                                                  {scheduleWeekdayShortLabel(d)}
                                                </label>
                                              ))}
                                          </div>
                                          <button
                                            type="submit"
                                            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100"
                                          >
                                            Copy Shift
                                          </button>
                                        </form>
                                        <form action={deleteCanonicalShiftAction}>
                                          <ScheduleReturnFields
                                            date={anchorDate}
                                            view="employee"
                                            mode="week"
                                          />
                                          <input
                                            type="hidden"
                                            name="shiftId"
                                            value={shift.scheduleEntryId}
                                          />
                                          <input
                                            type="hidden"
                                            name="serviceDate"
                                            value={day.serviceDate}
                                          />
                                          <button
                                            type="submit"
                                            className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
                                          >
                                            Unschedule
                                          </button>
                                        </form>
                                      </div>
                                    </details>
                                  ) : (
                                    <span
                                      className="font-medium text-zinc-900"
                                      aria-label={shift.accessibleLabel}
                                    >
                                      {shift.compactLabel ?? "Shift"}
                                    </span>
                                  )}
                                </li>
                              ))}
                              {marker ? (
                                <li
                                  className={`text-[11px] font-medium ${marker.className}`}
                                  title={marker.label}
                                >
                                  <span aria-hidden="true">{marker.symbol}</span>{" "}
                                  <span className="sr-only">{marker.label}. </span>
                                  {day.needsAssignment
                                    ? "Needs assignment"
                                    : day.assignedUnscheduled
                                      ? "Not scheduled"
                                      : null}
                                </li>
                              ) : null}
                              {oaEnabled && day.needsAssignment ? (
                                <li>
                                  <Link
                                    href={`/staffing/assignments?date=${day.serviceDate}`}
                                    className="text-[11px] font-medium text-indigo-700 hover:underline"
                                  >
                                    Assign
                                  </Link>
                                </li>
                              ) : null}
                            </ul>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {manage && employeePool.length > 0 ? (
        <details className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="week-add-shift-panel">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
            + Add shift (any employee / day)
          </summary>
          <form action={createCanonicalShiftAction} className="mt-3 max-w-md space-y-3">
            <ScheduleReturnFields date={anchorDate} view="employee" mode="week" />
            <input type="hidden" name="departmentId" value={projection.departmentId} />
            <label className="block text-xs text-zinc-600">
              Employee
              <select
                name="employeeId"
                required
                className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">Employee…</option>
                {employeePool.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName}, {e.firstName}
                    {e.jobRoleDisplayName ? ` · ${e.jobRoleDisplayName}` : " · No Job Role"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-600">
              Date
              <select
                name="serviceDate"
                required
                defaultValue={anchorDate}
                className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {week.days.map((d) => (
                  <option key={d} value={d}>
                    {scheduleWeekdayLongLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <WorkShiftPrefillFields workShifts={workShifts} />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create Shift
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
