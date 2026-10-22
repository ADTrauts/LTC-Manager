"use client";

import { useActionState } from "react";

import { setDepartmentStaffManagerAction, type StaffManagerActionState } from "./actions";

const initialState: StaffManagerActionState = { ok: false, message: null };

export function StaffManagerToggle({
  departmentId,
  employeeId,
  name,
  allowed,
}: {
  departmentId: string;
  employeeId: string;
  name: string;
  allowed: boolean;
}) {
  const [state, formAction, pending] = useActionState(setDepartmentStaffManagerAction, initialState);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`staff-manager-${employeeId}`}>
      <div>
        <p className="text-sm text-zinc-900">{name}</p>
        <p className="text-xs text-zinc-500">
          {allowed ? "May add staff and set roles" : "Does not add staff or set roles"}
        </p>
        {state.message ? (
          <p className={`text-xs ${state.ok ? "text-emerald-800" : "text-red-700"}`} role="status">
            {state.message}
          </p>
        ) : null}
      </div>
      <form action={formAction}>
        <input type="hidden" name="departmentId" value={departmentId} />
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="allowed" value={allowed ? "off" : "on"} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
        >
          {allowed ? "Remove" : "Allow"}
        </button>
      </form>
    </li>
  );
}
