"use client";

import { createMenuAction } from "@/app/(protected)/menus/actions";

type DepartmentOption = {
  id: string;
  name: string;
};

export function CreateMenuForm({
  departments,
  defaultDepartmentId,
  disabled,
}: {
  departments: DepartmentOption[];
  defaultDepartmentId: string | null;
  disabled: boolean;
}) {
  if (departments.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        No department whose product offers Menus is available in this context.
      </p>
    );
  }

  const implicitDepartment = departments.length === 1 ? departments[0]! : null;

  return (
    <form action={createMenuAction} className="grid gap-3 rounded-lg border border-zinc-200 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto]">
      <input
        name="name"
        required
        maxLength={120}
        placeholder="Menu name"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        disabled={disabled}
      />
      {implicitDepartment ? (
        <input type="hidden" name="departmentId" value={implicitDepartment.id} />
      ) : (
        <select
          name="departmentId"
          defaultValue={defaultDepartmentId && departments.some((row) => row.id === defaultDepartmentId) ? defaultDepartmentId : departments[0]!.id}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          disabled={disabled}
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      )}
      {implicitDepartment ? (
        <p className="self-center text-sm text-zinc-600 md:hidden">{implicitDepartment.name}</p>
      ) : null}
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        Create menu
      </button>
    </form>
  );
}
