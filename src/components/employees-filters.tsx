import { EmployeeStatus } from "@prisma/client";
import { Button } from "@/components/design-system/Button";
import { FilterPanel } from "@/components/design-system/FilterPanel";
import { countNonDefaultEmployeeFilters } from "@/lib/employee-directory-filters";

import type { EmployeeDirectoryQuery } from "@/lib/employee-directory-filters";
import { EMPLOYEE_STATUS_LABEL } from "@/lib/employee-hr-labels";

const cardFormClass =
  "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-lg border border-zinc-200 bg-white p-3";
const embeddedFormClass = "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3";

export function EmployeesFiltersForm({
  current,
  embedded = false,
  teams = [],
}: {
  current: EmployeeDirectoryQuery;
  /** Omit outer card; use inside a collapsible or other container. */
  embedded?: boolean;
  /** @deprecated Not used — legacy jobTitle catalog is not a primary Employee Builder filter. */
  jobTitles?: { id: string; name: string }[];
  teams?: { id: string; displayName: string; departmentId: string; departmentName: string }[];
}) {
  const teamOptions = current.dept?.trim()
    ? teams.filter((team) => team.departmentId === current.dept?.trim())
    : teams;
  const groupTeams = !current.dept?.trim();
  const advancedFilterCount = countNonDefaultEmployeeFilters({ ...current, dept: undefined, q: undefined });
  return (
    <form method="get" className={embedded ? embeddedFormClass : cardFormClass}>
      {current.dept?.trim() ? <input type="hidden" name="dept" value={current.dept.trim()} /> : null}
      <label className="min-w-0 text-xs text-zinc-600">
        Search name
        <input
          name="q"
          type="search"
          defaultValue={current.q ?? ""}
          placeholder="First or last"
          className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>
      <Button type="submit">Apply</Button>
      <FilterPanel className="col-span-2" title="More filters" summary={
        advancedFilterCount ? `${advancedFilterCount} active` : "All employees"
      }>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {teamOptions.length > 0 ? (
        <label className="min-w-0">
          <span className="block text-xs text-zinc-600">Team</span>
          <select
            name="team"
            defaultValue={current.team ?? "all"}
            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            {groupTeams
              ? Object.entries(
                  teamOptions.reduce<Record<string, typeof teamOptions>>((acc, team) => {
                    (acc[team.departmentName] ??= []).push(team);
                    return acc;
                  }, {}),
                ).map(([departmentName, deptTeams]) => (
                  <optgroup key={departmentName} label={departmentName}>
                    {deptTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.displayName}
                      </option>
                    ))}
                  </optgroup>
                ))
              : teamOptions.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.displayName}
                  </option>
                ))}
          </select>
        </label>
      ) : null}
      <label className="min-w-0">
        <span className="block text-xs text-zinc-600">Status</span>
        <select
          name="status"
          defaultValue={current.status ?? "all"}
          className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          {(Object.values(EmployeeStatus) as EmployeeStatus[]).map((value) => (
            <option key={value} value={value}>
              {EMPLOYEE_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0">
        <span className="block text-xs text-zinc-600">Union</span>
        <select
          name="union"
          defaultValue={current.union ?? "all"}
          className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          <option value="yes">Union</option>
          <option value="no">Non-union</option>
        </select>
      </label>
      <label className="min-w-0">
        <span className="block text-xs text-zinc-600">Leave</span>
        <select
          name="leave"
          defaultValue={current.leave ?? "all"}
          className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          <option value="yes">On leave</option>
          <option value="no">Not on leave</option>
        </select>
      </label>
      <label className="min-w-0">
        <span className="block text-xs text-zinc-600">Sort</span>
        <select
          name="sort"
          defaultValue={current.sort ?? "name"}
          className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="name">Name A–Z</option>
          <option value="nameDesc">Name Z–A</option>
          <option value="hireDate">Hire date (oldest)</option>
          <option value="hireDateDesc">Hire date (newest)</option>
          <option value="status">Status</option>
        </select>
      </label>
      <a
        href="/employees"
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
      >
        Clear
      </a>
      </div>
      </FilterPanel>
    </form>
  );
}
