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
      <p className="text-sm text-zinc-500 md:text-right">
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
    <div
      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:max-w-md md:ms-auto lg:max-w-sm"
      data-testid="servery-meal-service-controls"
    >
      <div className="mb-2 flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Meal period</p>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-zinc-100/90 p-1"
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
                className={`min-h-11 rounded-md px-2 py-2 text-sm font-semibold transition touch-manipulation ${
                  isActive ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-800 hover:bg-white/80"
                }`}
              >
                {fmtMealLabel(slot.mealType)}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500">Line {selectedSlot.scheduledTime}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
        <form action={recordServeryServiceTimeAction}>
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="mealType" value={selectedMeal} />
          <input type="hidden" name="eventType" value="READY" />
          <input type="hidden" name="returnTab" value={returnTab} />
          <input type="hidden" name="returnLogTab" value={returnLogTab} />
          <button
            type="submit"
            className="flex min-h-12 w-full flex-col justify-center rounded-lg border-2 border-zinc-900 bg-zinc-900 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 touch-manipulation"
          >
            <span>Meal service ready</span>
            <span className="text-xs font-medium text-zinc-200">{formatServeryLiveStamp(readyAt, now)}</span>
          </button>
        </form>
        <form action={recordServeryServiceTimeAction}>
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="mealType" value={selectedMeal} />
          <input type="hidden" name="eventType" value="STARTED" />
          <input type="hidden" name="returnTab" value={returnTab} />
          <input type="hidden" name="returnLogTab" value={returnLogTab} />
          <button
            type="submit"
            className="flex min-h-12 w-full flex-col justify-center rounded-lg border-2 border-zinc-900 bg-zinc-900 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 touch-manipulation"
          >
            <span>Meal service started</span>
            <span className="text-xs font-medium text-zinc-200">{formatServeryLiveStamp(startedAt, now)}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
