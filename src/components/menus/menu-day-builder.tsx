"use client";

import { MenuItemEntryType } from "@prisma/client";
import { useEffect, useState } from "react";

import { saveMenuCategoryItemsAction } from "@/app/(protected)/menus/actions";
import type { MenuPeriodConfig } from "@/lib/menu-cycle";
import type { MenuItemCycleRow } from "@/lib/menu-db";

type Props = {
  selectedWeek: number;
  selectedDayIndex: number;
  periods: MenuPeriodConfig[];
  menuItems: MenuItemCycleRow[];
  disabled: boolean;
};

export type MenuRowDraft = {
  itemName: string;
  portionValue: string;
  portionUnit: string;
  entryType: MenuItemEntryType;
};

function keyFor(periodKey: string, category: string) {
  return `${periodKey}__${category}`;
}

function emptyRow(): MenuRowDraft {
  return { itemName: "", portionValue: "", portionUnit: "", entryType: "FIXED" };
}

function rowsFromDb(
  menuItems: MenuItemCycleRow[],
  selectedWeek: number,
  selectedDayIndex: number,
  periodKey: string,
  category: string,
): MenuRowDraft[] {
  const existing = menuItems
    .filter(
      (item) =>
        item.weekNumber === selectedWeek &&
        item.dayIndex === selectedDayIndex &&
        item.mealPeriodKey === periodKey &&
        item.category === category,
    )
    .sort((a, b) => a.displayOrder - b.displayOrder || a.itemName.localeCompare(b.itemName))
    .map((item) => ({
      itemName: item.itemName,
      portionValue: item.portionValue ?? "",
      portionUnit: item.portionUnit ?? "",
      entryType: item.entryType,
    }));
  return existing.length > 0 ? existing : [emptyRow()];
}

export function MenuDayBuilder({
  selectedWeek,
  selectedDayIndex,
  periods,
  menuItems,
  disabled,
}: Props) {
  const [linesByKey, setLinesByKey] = useState<Record<string, MenuRowDraft[]>>(() =>
    Object.fromEntries(
      periods.flatMap((period) =>
        period.categories.map((category) => {
          const rows = rowsFromDb(menuItems, selectedWeek, selectedDayIndex, period.key, category);
          return [keyFor(period.key, category), rows];
        }),
      ),
    ) as Record<string, MenuRowDraft[]>,
  );

  useEffect(() => {
    // Baseline: pre-existing reset-on-prop-change. Replacing it changes whether an
    // in-progress edit survives a parent refresh, which is a product decision.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinesByKey(
      Object.fromEntries(
        periods.flatMap((period) =>
          period.categories.map((category) => {
            const rows = rowsFromDb(menuItems, selectedWeek, selectedDayIndex, period.key, category);
            return [keyFor(period.key, category), rows];
          }),
        ),
      ) as Record<string, MenuRowDraft[]>,
    );
  }, [menuItems, periods, selectedDayIndex, selectedWeek]);

  return (
    <fieldset disabled={disabled} className="space-y-4 border-0 p-0">
      {periods.map((period) => (
        <div key={period.key} className="rounded border border-zinc-200 p-3">
          <p className="text-sm font-semibold text-zinc-800">{period.label}</p>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {period.categories.map((category) => {
              const rowKey = keyFor(period.key, category);
              const rows = linesByKey[rowKey] ?? [emptyRow()];
              const payload = rows.filter((row) => row.itemName.trim().length > 0);

              return (
                <form key={rowKey} action={saveMenuCategoryItemsAction} className="space-y-2 rounded-md border border-zinc-200 p-3">
                  <input type="hidden" name="weekNumber" value={selectedWeek} />
                  <input type="hidden" name="dayIndex" value={selectedDayIndex} />
                  <input type="hidden" name="mealPeriodKey" value={period.key} />
                  <input type="hidden" name="category" value={category} />
                  <input type="hidden" name="itemsJson" value={JSON.stringify(payload)} />

                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{category}</label>
                  <div className="space-y-2">
                    {rows.map((row, idx) => (
                      <div key={`${rowKey}-${idx}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          value={row.itemName}
                          onChange={(e) =>
                            setLinesByKey((prev) => ({
                              ...prev,
                              [rowKey]: rows.map((r, i) => (i === idx ? { ...r, itemName: e.target.value } : r)),
                            }))
                          }
                          className="rounded-md border border-zinc-300 px-2 py-2 text-sm"
                          placeholder="Menu item or choice label"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setLinesByKey((prev) => ({
                              ...prev,
                              [rowKey]: rows.length === 1 ? [emptyRow()] : rows.filter((_, i) => i !== idx),
                            }))
                          }
                          className="rounded-md border border-zinc-300 px-2 py-2 text-xs font-medium hover:bg-zinc-100 md:justify-self-end"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setLinesByKey((prev) => ({
                          ...prev,
                          [rowKey]: [...rows, emptyRow()],
                        }))
                      }
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100"
                    >
                      + Add line
                    </button>
                  </div>

                  <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100">
                    Save {category}
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
