"use client";

import { updateMenuAction } from "@/app/(protected)/menus/actions";
import type { MenuStatus } from "@prisma/client";

export function MenuIdentityForm({
  menuId,
  name,
  status,
  departmentName,
  updatedAt,
  disabled,
}: {
  menuId: string;
  name: string;
  status: MenuStatus;
  departmentName: string;
  updatedAt: Date;
  disabled: boolean;
}) {
  return (
    <form action={updateMenuAction} className="space-y-3">
      <input type="hidden" name="menuId" value={menuId} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</span>
          <input
            name="name"
            defaultValue={name}
            required
            maxLength={120}
            disabled={disabled}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</span>
          <select
            name="status"
            defaultValue={status}
            disabled={disabled}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-zinc-600">
        Department: <span className="font-medium text-zinc-800">{departmentName}</span>
        <span className="mx-2 text-zinc-300">·</span>
        Last updated {updatedAt.toLocaleDateString()}
      </p>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        Save menu
      </button>
    </form>
  );
}
