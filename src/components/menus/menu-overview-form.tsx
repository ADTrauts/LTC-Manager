"use client";

import type { MenuStatus } from "@prisma/client";

import { saveMenuOverviewAction } from "@/app/(protected)/menus/actions";
import type { MenuPeriodConfig } from "@/lib/menu-cycle";

type Props = {
  menuId: string;
  name: string;
  status: MenuStatus;
  departmentName: string;
  updatedAt: Date;
  cycleLengthWeeks: 3 | 4;
  weekStartsOn: "SUNDAY" | "MONDAY";
  cycleAnchorDate: string;
  periods: MenuPeriodConfig[];
  locationSummary: string;
  attentionCount: number;
  disabled: boolean;
};

export function MenuOverviewForm({
  menuId,
  name,
  status,
  departmentName,
  updatedAt,
  cycleLengthWeeks,
  weekStartsOn,
  cycleAnchorDate,
  periods,
  locationSummary,
  attentionCount,
  disabled,
}: Props) {
  return (
    <form action={saveMenuOverviewAction} className="space-y-5">
      <input type="hidden" name="menuId" value={menuId} />
      <input type="hidden" name="periodConfigJson" value={JSON.stringify(periods)} />

      <fieldset disabled={disabled} className="space-y-3 border-0 p-0">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</span>
            <input
              name="name"
              defaultValue={name}
              required
              maxLength={120}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</span>
            <select name="status" defaultValue={status} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
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
      </fieldset>

      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Cycle settings</h2>
        <fieldset disabled={disabled} className="mt-3 grid gap-3 border-0 p-0 md:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cycle length</span>
            <select
              name="cycleLengthWeeks"
              defaultValue={String(cycleLengthWeeks)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="3">3-week cycle</option>
              <option value="4">4-week cycle</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Week</span>
            <select
              name="weekStartsOn"
              defaultValue={weekStartsOn}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="SUNDAY">Sunday to Saturday</option>
              <option value="MONDAY">Monday to Sunday</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Implementation date
            </span>
            <input
              type="date"
              name="cycleAnchorDate"
              defaultValue={cycleAnchorDate}
              aria-label="Implementation date"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
        </fieldset>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Locations</h2>
        <p className="mt-2 text-sm text-zinc-600">{locationSummary}</p>
        {attentionCount > 0 ? (
          <p className="mt-2 text-sm text-amber-800">
            Needs Attention · {attentionCount} item{attentionCount === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
