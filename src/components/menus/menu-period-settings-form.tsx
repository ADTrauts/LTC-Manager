"use client";

import { useMemo, useState } from "react";

import { saveMenuSettingsAction } from "@/app/(protected)/menus/actions";
import type { MenuPeriodConfig } from "@/lib/menu-cycle";

type Props = {
  cycleLengthWeeks: 3 | 4;
  weekStartsOn: "SUNDAY" | "MONDAY";
  cycleAnchorDate: string;
  periods: MenuPeriodConfig[];
  disabled: boolean;
};

type PeriodDraft = {
  key: string;
  label: string;
  categories: string[];
};

export function MenuPeriodSettingsForm({
  cycleLengthWeeks,
  weekStartsOn,
  cycleAnchorDate,
  periods,
  disabled,
}: Props) {
  const [drafts, setDrafts] = useState<PeriodDraft[]>(periods);
  const payload = useMemo(() => JSON.stringify(drafts), [drafts]);

  return (
    <form action={saveMenuSettingsAction} className="space-y-4">
      <input type="hidden" name="periodConfigJson" value={payload} />
      <fieldset disabled={disabled} className="grid gap-3 md:grid-cols-3">
        <select name="cycleLengthWeeks" defaultValue={String(cycleLengthWeeks)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="3">3-week cycle</option>
          <option value="4">4-week cycle</option>
        </select>
        <select name="weekStartsOn" defaultValue={weekStartsOn} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="SUNDAY">Sunday to Saturday</option>
          <option value="MONDAY">Monday to Sunday</option>
        </select>
        <input type="date" name="cycleAnchorDate" defaultValue={cycleAnchorDate} className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
      </fieldset>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-zinc-900">Meal periods and categories</p>
        {drafts.map((period, index) => (
          <div key={`${period.key}-${index}`} className="rounded-lg border border-zinc-200 p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={period.label}
                onChange={(e) =>
                  setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))
                }
                placeholder="Meal period label"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setDrafts((rows) => rows.filter((_, i) => i !== index))}
                className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium hover:bg-zinc-100"
              >
                Remove period
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {period.categories.map((category, catIdx) => (
                <div key={`${period.key}-${catIdx}`} className="flex items-center gap-2">
                  <input
                    value={category}
                    onChange={(e) =>
                      setDrafts((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                categories: row.categories.map((c, j) => (j === catIdx ? e.target.value : c)),
                              }
                            : row,
                        ),
                      )
                    }
                    placeholder="Category label"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((rows) =>
                        rows.map((row, i) =>
                          i === index
                            ? { ...row, categories: row.categories.filter((_, j) => j !== catIdx) }
                            : row,
                        ),
                      )
                    }
                    className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium hover:bg-zinc-100"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setDrafts((rows) =>
                    rows.map((row, i) =>
                      i === index ? { ...row, categories: [...row.categories, ""] } : row,
                    ),
                  )
                }
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100"
              >
                + Add category
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setDrafts((rows) => [...rows, { key: `PERIOD_${rows.length + 1}`, label: "New period", categories: [""] }])
          }
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100"
        >
          + Add meal period
        </button>
      </div>
      <div>
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          Save settings
        </button>
      </div>
    </form>
  );
}

