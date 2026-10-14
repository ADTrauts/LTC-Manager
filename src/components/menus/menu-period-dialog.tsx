"use client";

import { useMemo, useRef, useState } from "react";

import { saveMenuSettingsAction } from "@/app/(protected)/menus/actions";
import type { EligibleMenuOperationalCycle } from "@/lib/menu-applicability";
import { periodKeyFromLabel, type MenuPeriodConfig } from "@/lib/menu-cycle";

type Props = {
  menuId: string;
  cycleLengthWeeks: 3 | 4;
  weekStartsOn: "SUNDAY" | "MONDAY";
  cycleAnchorDate: string;
  periods: MenuPeriodConfig[];
  eligibleCycles: EligibleMenuOperationalCycle[];
  editingKey: string | null;
  disabled: boolean;
  onClose: () => void;
};

export function MenuPeriodDialog({
  menuId,
  cycleLengthWeeks,
  weekStartsOn,
  cycleAnchorDate,
  periods,
  eligibleCycles,
  editingKey,
  disabled,
  onClose,
}: Props) {
  const editing = editingKey ? periods.find((period) => period.key === editingKey) ?? null : null;
  const [label, setLabel] = useState(editing?.label ?? "");
  const [attachCycle, setAttachCycle] = useState(Boolean(editing?.cycleStableKey));
  const [cycleStableKey, setCycleStableKey] = useState(editing?.cycleStableKey ?? "");
  const [categories, setCategories] = useState(
    editing?.categories.length ? editing.categories : ["Items"],
  );
  const payloadInputRef = useRef<HTMLInputElement>(null);

  const cycleOptions = eligibleCycles;

  const nextPeriods = useMemo(() => {
    const trimmedLabel = label.trim();
    const nextCategories = categories.map((row) => row.trim()).filter(Boolean);
    if (!trimmedLabel || nextCategories.length === 0) return null;
    const key = editing?.key ?? periodKeyFromLabel(trimmedLabel, periods.map((period) => period.key));
    const next: MenuPeriodConfig = {
      key,
      label: trimmedLabel,
      categories: nextCategories,
      cycleStableKey: attachCycle && cycleStableKey ? cycleStableKey : null,
    };
    if (editing) {
      return periods.map((period) => (period.key === editing.key ? next : period));
    }
    return [...periods, next];
  }, [attachCycle, categories, cycleStableKey, editing, label, periods]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-period-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4">
        <p id="menu-period-dialog-title" className="text-sm font-semibold text-zinc-900">
          {editing ? "Edit meal period" : "Add meal period"}
        </p>
        <form
          action={async (formData) => {
            await saveMenuSettingsAction(formData);
            onClose();
          }}
          className="mt-3 space-y-3"
        >
          <input type="hidden" name="menuId" value={menuId} />
          <input type="hidden" name="cycleLengthWeeks" value={cycleLengthWeeks} />
          <input type="hidden" name="weekStartsOn" value={weekStartsOn} />
          <input type="hidden" name="cycleAnchorDate" value={cycleAnchorDate} />
          <input
            ref={payloadInputRef}
            type="hidden"
            name="periodConfigJson"
            value={JSON.stringify(nextPeriods ?? periods)}
          />

          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={disabled}
              placeholder="Breakfast, Snack cart, Late tray…"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={attachCycle}
              disabled={disabled}
              onChange={(event) => setAttachCycle(event.target.checked)}
            />
            Attach to an Operational Cycle
          </label>
          {attachCycle ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Operational Cycle
              </span>
              {cycleOptions.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  This department has no published Operational Cycles yet.
                </p>
              ) : (
                <select
                  value={cycleStableKey}
                  onChange={(event) => setCycleStableKey(event.target.value)}
                  disabled={disabled}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Choose a cycle</option>
                  {cycleOptions.map((cycle) => (
                    <option key={cycle.stableKey} value={cycle.stableKey}>
                      {cycle.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Categories</p>
            {categories.map((category, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={category}
                  onChange={(event) =>
                    setCategories((rows) => rows.map((row, i) => (i === index ? event.target.value : row)))
                  }
                  disabled={disabled}
                  placeholder="Entrees, Beverages…"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={disabled || categories.length === 1}
                  onClick={() => setCategories((rows) => rows.filter((_, i) => i !== index))}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setCategories((rows) => [...rows, ""])}
              className="text-xs font-medium text-zinc-700 underline underline-offset-2"
            >
              Add category
            </button>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {editing ? (
              <button
                type="submit"
                disabled={disabled}
                onClick={() => {
                  if (!editing || !payloadInputRef.current) return;
                  payloadInputRef.current.value = JSON.stringify(
                    periods.filter((period) => period.key !== editing.key),
                  );
                }}
                className="mr-auto rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Remove period
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disabled || !nextPeriods}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              Save period
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
