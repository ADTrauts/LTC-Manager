"use client";

import { useState, useTransition } from "react";

import { setDepartmentShowInEmployeeAppAction } from "./actions";

export function DepartmentVisibilityForm({
  departmentId,
  showInEmployeeApp,
  assignedEmployeeCount,
}: {
  departmentId: string;
  showInEmployeeApp: boolean;
  assignedEmployeeCount: number;
}) {
  const [show, setShow] = useState(showInEmployeeApp ? "on" : "off");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cannotHide = assignedEmployeeCount > 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await setDepartmentShowInEmployeeAppAction(fd);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not update department visibility.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-end gap-2"
      data-testid={`department-visibility-${departmentId}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="departmentId" value={departmentId} />
        <label className="text-xs font-medium text-zinc-700">
          Show in employee application
          <select
            name="showInEmployeeApp"
            value={show}
            onChange={(e) => setShow(e.target.value)}
            className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            aria-describedby={`department-visibility-help-${departmentId}`}
          >
            <option value="on">Yes — show in pickers and mode selector</option>
            <option value="off" disabled={cannotHide && show === "on"}>
              No — hide from employee app
            </option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending || (cannotHide && show === "off" && showInEmployeeApp)}
          className="mt-5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-6"
        >
          {isPending ? "Saving…" : "Save visibility"}
        </button>
      </div>
      <p
        id={`department-visibility-help-${departmentId}`}
        className="max-w-xs text-right text-xs text-zinc-500"
      >
        Controls employee-facing department pickers and the operational mode selector. This is not a
        subscription or license setting.
      </p>
      {cannotHide && showInEmployeeApp ? (
        <p className="max-w-xs text-right text-xs text-amber-800">
          {assignedEmployeeCount} employee
          {assignedEmployeeCount === 1 ? "" : "s"} assigned — reassign primary department
          (and floater memberships) before hiding.
        </p>
      ) : null}
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
