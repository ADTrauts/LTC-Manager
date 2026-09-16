"use client";

import { useState } from "react";

import { setDepartmentHeadAction } from "@/app/(protected)/admin/departments/actions";
import type { OverviewEmployeeOption } from "@/app/(protected)/admin/departments/[departmentId]/overview-panel";

type Props = {
  departmentId: string;
  headEmployeeId: string | null;
  employees: OverviewEmployeeOption[];
};

export function DepartmentManagerForm({
  departmentId,
  headEmployeeId,
  employees,
}: Props) {
  const [editing, setEditing] = useState(false);
  const onRoster = employees.filter((e) => e.onRoster);
  const elsewhere = employees.filter((e) => !e.onRoster);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-2 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
        data-testid="change-department-manager"
      >
        Change
      </button>
    );
  }

  return (
    <form action={setDepartmentHeadAction} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="departmentId" value={departmentId} />
      <label className="text-xs font-medium text-zinc-700">
        Assign
        <select
          name="headEmployeeId"
          defaultValue={headEmployeeId ?? ""}
          className="mt-1 block min-w-[11rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          data-testid="department-manager-select"
        >
          <option value="">Not assigned</option>
          {onRoster.length > 0 ? (
            <optgroup label="On roster">
              {onRoster.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName}, {e.firstName}
                </option>
              ))}
            </optgroup>
          ) : null}
          {elsewhere.length > 0 ? (
            <optgroup label="Other employees — add Department membership in Employee Builder first">
              {elsewhere.map((e) => (
                <option key={e.id} value={e.id} disabled>
                  {e.lastName}, {e.firstName}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
        data-testid="save-department-manager"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
      >
        Cancel
      </button>
    </form>
  );
}
