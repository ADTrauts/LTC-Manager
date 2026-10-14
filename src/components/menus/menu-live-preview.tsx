"use client";

import { useMemo, useState, type ReactNode } from "react";

import { menuForCycleSlot, type MenuPeriodConfig } from "@/lib/menu-cycle";
import type { MenuItemCycleRow } from "@/lib/menu-db";

type Props = {
  menuName: string;
  cycleLengthWeeks: 3 | 4;
  dayLabels: readonly string[];
  initialWeek: number;
  initialDayIndex: number;
  periods: MenuPeriodConfig[];
  menuItems: MenuItemCycleRow[];
  unavailable: boolean;
};

function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length;
}

export function MenuLivePreview({
  menuName,
  cycleLengthWeeks,
  dayLabels,
  initialWeek,
  initialDayIndex,
  periods,
  menuItems,
  unavailable,
}: Props) {
  const [open, setOpen] = useState(false);
  const [weekNumber, setWeekNumber] = useState(initialWeek);
  const [dayIndex, setDayIndex] = useState(initialDayIndex);

  function openPreview() {
    setWeekNumber(initialWeek);
    setDayIndex(initialDayIndex);
    setOpen(true);
  }

  function stepWeek(delta: number) {
    setWeekNumber((current) => wrapIndex(current - 1 + delta, cycleLengthWeeks) + 1);
  }

  function stepDay(delta: number) {
    const total = cycleLengthWeeks * 7;
    const next = wrapIndex((weekNumber - 1) * 7 + dayIndex + delta, total);
    setWeekNumber(Math.floor(next / 7) + 1);
    setDayIndex(next % 7);
  }

  const grouped = useMemo(
    () =>
      menuForCycleSlot({
        weekNumber,
        dayIndex,
        periods,
        menuItems,
      }),
    [dayIndex, menuItems, periods, weekNumber],
  );
  const dayLabel = dayLabels[dayIndex] ?? "";

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
      >
        Live Preview
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-live-preview-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-stone-50 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-zinc-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="menu-live-preview-title" className="text-lg font-semibold tracking-tight text-zinc-900">
                    {menuName}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    Week {weekNumber} · {dayLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Picker
                  ariaLabel="Week"
                  valueLabel={`Week ${weekNumber}`}
                  onPrev={() => stepWeek(-1)}
                  onNext={() => stepWeek(1)}
                >
                  {Array.from({ length: cycleLengthWeeks }, (_, idx) => idx + 1).map((week) => (
                    <PickerChip
                      key={week}
                      active={week === weekNumber}
                      onClick={() => setWeekNumber(week)}
                    >
                      {week}
                    </PickerChip>
                  ))}
                </Picker>
                <Picker
                  ariaLabel="Day"
                  valueLabel={dayLabel}
                  onPrev={() => stepDay(-1)}
                  onNext={() => stepDay(1)}
                >
                  {dayLabels.map((label, index) => (
                    <PickerChip
                      key={`${label}-${index}`}
                      active={index === dayIndex}
                      onClick={() => setDayIndex(index)}
                    >
                      {label.slice(0, 3)}
                    </PickerChip>
                  ))}
                </Picker>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {unavailable ? (
                <p className="text-sm text-zinc-600">Preview is unavailable until menu data can load.</p>
              ) : periods.length === 0 ? (
                <p className="text-sm text-zinc-600">No meal periods yet.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {periods.map((period) => (
                    <section key={period.key} className="rounded-lg border border-zinc-200 bg-white p-4">
                      <h3 className="border-b border-zinc-100 pb-2 text-base font-semibold text-zinc-900">
                        {period.label}
                      </h3>
                      <div className="mt-3 space-y-3">
                        {period.categories.map((category) => {
                          const values = grouped[period.key]?.[category] ?? [];
                          return (
                            <div key={category}>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                                {category}
                              </p>
                              {values.length > 0 ? (
                                <ul className="mt-1 space-y-0.5 text-sm text-zinc-800">
                                  {values.map((value, index) => (
                                    <li key={`${value}-${index}`}>{value}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-sm text-zinc-300">—</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Picker({
  ariaLabel,
  valueLabel,
  onPrev,
  onNext,
  children,
}: {
  ariaLabel: string;
  valueLabel: string;
  onPrev: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Previous ${ariaLabel.toLowerCase()}`}
          onClick={onPrev}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-white hover:text-zinc-900"
        >
          ‹
        </button>
        <p className="min-w-0 flex-1 text-center text-sm font-medium text-zinc-800">{valueLabel}</p>
        <button
          type="button"
          aria-label={`Next ${ariaLabel.toLowerCase()}`}
          onClick={onNext}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-white hover:text-zinc-900"
        >
          ›
        </button>
      </div>
      <div className="mt-1 flex gap-1 overflow-x-auto pb-0.5">{children}</div>
    </div>
  );
}

function PickerChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded px-2 py-1 text-xs font-medium bg-zinc-900 text-white"
          : "rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-white"
      }
    >
      {children}
    </button>
  );
}
