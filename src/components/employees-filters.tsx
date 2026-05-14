import { ChrcStatus, EmployeeStatus, JobClassification, WorkStation } from "@prisma/client";

import type { EmployeeDirectoryQuery } from "@/lib/employee-directory-filters";
import { CHRC_STATUS_LABEL, JOB_CLASSIFICATION_LABEL, WORK_STATION_LABEL } from "@/lib/employee-hr-labels";

const cardFormClass =
  "flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm";
const embeddedFormClass = "flex flex-wrap items-end gap-2";

export function EmployeesFiltersForm({
  current,
  embedded = false,
}: {
  current: EmployeeDirectoryQuery;
  /** Omit outer card; use inside a collapsible or other container. */
  embedded?: boolean;
}) {
  return (
    <form method="get" className={embedded ? embeddedFormClass : cardFormClass}>
      <label className="text-xs text-zinc-600">
        Search name
        <input
          name="q"
          type="search"
          defaultValue={current.q ?? ""}
          placeholder="First or last"
          className="mt-1 block min-w-[10rem] rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>
      <div>
        <span className="block text-xs text-zinc-600">Status</span>
        <select
          name="status"
          defaultValue={current.status ?? "all"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          {(Object.values(EmployeeStatus) as EmployeeStatus[]).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="block text-xs text-zinc-600">Union</span>
        <select
          name="union"
          defaultValue={current.union ?? "all"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          <option value="yes">Union</option>
          <option value="no">Non-union</option>
        </select>
      </div>
      <div>
        <span className="block text-xs text-zinc-600">Classification</span>
        <select
          name="classification"
          defaultValue={current.classification ?? "all"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          {(Object.keys(JOB_CLASSIFICATION_LABEL) as JobClassification[]).map((k) => (
            <option key={k} value={k}>
              {JOB_CLASSIFICATION_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="block text-xs text-zinc-600">Station</span>
        <select
          name="station"
          defaultValue={current.station ?? "all"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          {(Object.keys(WORK_STATION_LABEL) as WorkStation[]).map((k) => (
            <option key={k} value={k}>
              {WORK_STATION_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="block text-xs text-zinc-600">CHRC</span>
        <select
          name="chrc"
          defaultValue={current.chrc ?? "all"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          {(Object.keys(CHRC_STATUS_LABEL) as ChrcStatus[]).map((k) => (
            <option key={k} value={k}>
              {CHRC_STATUS_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="block text-xs text-zinc-600">Leave</span>
        <select
          name="leave"
          defaultValue={current.leave ?? "all"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          <option value="yes">On leave</option>
          <option value="no">Not on leave</option>
        </select>
      </div>
      <div>
        <span className="block text-xs text-zinc-600">Discipline points</span>
        <select
          name="hasPoints"
          defaultValue={current.hasPoints ?? "all"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          <option value="yes">Has points (&gt;0)</option>
          <option value="no">No points</option>
        </select>
      </div>
      <div>
        <span className="block text-xs text-zinc-600">Birth month</span>
        <select
          name="birthMonth"
          defaultValue={current.birthMonth ?? "all"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={String(m)}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="block text-xs text-zinc-600">Sort</span>
        <select
          name="sort"
          defaultValue={current.sort ?? "name"}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="name">Name A–Z</option>
          <option value="nameDesc">Name Z–A</option>
          <option value="hireDate">Hire date (oldest)</option>
          <option value="hireDateDesc">Hire date (newest)</option>
          <option value="status">Status</option>
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Apply
      </button>
      <a
        href="/employees"
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
      >
        Clear
      </a>
    </form>
  );
}
