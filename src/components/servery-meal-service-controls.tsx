"use client";

import type { MealType } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";

import { recordServeryServiceTimeAction } from "@/app/(protected)/unit/[unitId]/actions";
import { formatServeryLiveStamp } from "@/lib/servery-meal-service";

type ServerySlot = {
  mealType: MealType;
  scheduledTime: string;
};

type EventPayload = {
  mealServiceReadyAt: string | null;
  mealServiceStartedAt: string | null;
};

const MEAL_ORDER: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];

function fmtMealLabel(meal: MealType) {
  return meal.charAt(0) + meal.slice(1).toLowerCase();
}

type ServeryMealServiceControlsProps = {
  unitId: string;
  defaultMealType: MealType;
  returnTab: "overview" | "logs";
  returnLogTab: string;
  slots: ServerySlot[];
  eventByMeal: Partial<Record<MealType, EventPayload>>;
};

export function ServeryMealServiceControls({
  unitId,
  defaultMealType,
  returnTab,
  returnLogTab,
  slots,
  eventByMeal,
}: ServeryMealServiceControlsProps) {
  const [selectedMeal, setSelectedMeal] = useState<MealType>(() => {
    if (slots.some((s) => s.mealType === defaultMealType)) {
      return defaultMealType;
    }
    return slots[0]!.mealType;
  });
  const [now, setNow] = useState(() => new Date());

  const orderedSlots = useMemo(
    () => MEAL_ORDER.flatMap((m) => slots.find((s) => s.mealType === m) ?? []),
    [slots],
  );

  const selectedSlot = useMemo(
    () => orderedSlots.find((s) => s.mealType === selectedMeal) ?? orderedSlots[0],
    [orderedSlots, selectedMeal],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (orderedSlots.length === 0) {
    return (
      <p className="text-right text-xs text-zinc-500">
        Add serving times for this servery on the Units page to enable meal service buttons.
      </p>
    );
  }

  if (!selectedSlot) {
    return null;
  }

  const event = eventByMeal[selectedMeal];
  const readyAt = event?.mealServiceReadyAt ? new Date(event.mealServiceReadyAt) : null;
  const startedAt = event?.mealServiceStartedAt ? new Date(event.mealServiceStartedAt) : null;

  return (
    <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 sm:max-w-none sm:ms-auto sm:w-auto">
      <div className="mb-3 flex flex-col gap-2 sm:items-end">
        <p className="w-full text-xs font-medium text-zinc-600 sm:text-right">Meal period</p>
        <div
          className="inline-flex w-full max-w-sm flex-wrap gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100/90 p-0.5 sm:max-w-md sm:justify-end"
          role="group"
          aria-label="Choose meal period"
        >
          {orderedSlots.map((slot) => {
            const isActive = selectedMeal === slot.mealType;
            return (
              <button
                key={slot.mealType}
                type="button"
                onClick={() => setSelectedMeal(slot.mealType)}
                aria-pressed={isActive}
                className={`min-h-[2.5rem] flex-1 rounded-md px-2.5 py-2 text-sm font-medium transition sm:flex-none sm:shrink-0 ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-800 hover:bg-white/80"
                }`}
              >
                {fmtMealLabel(slot.mealType)}
              </button>
            );
          })}
        </div>
        <p className="w-full text-xs text-zinc-500 sm:text-right">
          Line {selectedSlot.scheduledTime} · current period follows local time
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        <form action={recordServeryServiceTimeAction} className="sm:contents">
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="mealType" value={selectedMeal} />
          <input type="hidden" name="eventType" value="READY" />
          <input type="hidden" name="returnTab" value={returnTab} />
          <input type="hidden" name="returnLogTab" value={returnLogTab} />
          <button
            type="submit"
            className="w-full rounded-md border-2 border-zinc-900 bg-zinc-900 px-4 py-2.5 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 sm:max-w-sm sm:py-2"
          >
            <span>Meal service ready</span>
            <span className="ms-1 block text-zinc-200 sm:inline sm:ms-1">
              {formatServeryLiveStamp(readyAt, now)}
            </span>
          </button>
        </form>
        <form action={recordServeryServiceTimeAction} className="sm:contents">
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="mealType" value={selectedMeal} />
          <input type="hidden" name="eventType" value="STARTED" />
          <input type="hidden" name="returnTab" value={returnTab} />
          <input type="hidden" name="returnLogTab" value={returnLogTab} />
          <button
            type="submit"
            className="w-full rounded-md border-2 border-zinc-900 bg-zinc-900 px-4 py-2.5 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 sm:max-w-sm sm:py-2"
          >
            <span>Meal service started</span>
            <span className="ms-1 block text-zinc-200 sm:inline sm:ms-1">
              {formatServeryLiveStamp(startedAt, now)}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
