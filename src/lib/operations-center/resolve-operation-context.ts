import type { MealType } from "@prisma/client";

import { getDefaultMealTypeForTimeOfDay } from "@/lib/servery-meal-service";

import { fmtMealLabel } from "./fmt-meal-label";
import type { OperationContext, OperationsCenterMealBoard, OperationsCenterUnitCard } from "./types";

function parseScheduledTimeOnDate(timeStr: string, reference: Date): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const scheduled = new Date(reference);
  scheduled.setHours(hours, minutes, 0, 0);
  return scheduled;
}

function resolveEarliestScheduledTime(
  unitCards: OperationsCenterUnitCard[],
  mealType: MealType,
  now: Date,
): string | null {
  let earliest: Date | null = null;
  for (const unit of unitCards) {
    if (!unit.hasDietary) continue;
    const slot = unit.mealTimes.find((time) => time.mealType === mealType);
    if (!slot) continue;
    const parsed = parseScheduledTimeOnDate(slot.scheduledTime, now);
    if (!parsed) continue;
    if (!earliest || parsed.getTime() < earliest.getTime()) {
      earliest = parsed;
    }
  }
  if (!earliest) return null;
  return earliest.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function resolveOperationPhase(
  mealType: MealType,
  mealBoards: OperationsCenterMealBoard[],
): OperationContext["phase"] {
  const board = mealBoards.find((item) => item.meal === mealType);
  if (board?.rows.some((row) => row.isReadyLive || row.isStartedLive)) {
    return "Execution";
  }
  return "Preparation";
}

function resolveMinutesUntilService(
  unitCards: OperationsCenterUnitCard[],
  mealType: MealType,
  now: Date,
): number | null {
  let earliest: Date | null = null;
  for (const unit of unitCards) {
    if (!unit.hasDietary) continue;
    const slot = unit.mealTimes.find((time) => time.mealType === mealType);
    if (!slot) continue;
    const parsed = parseScheduledTimeOnDate(slot.scheduledTime, now);
    if (!parsed) continue;
    if (!earliest || parsed.getTime() < earliest.getTime()) {
      earliest = parsed;
    }
  }
  if (!earliest) return null;
  return Math.round((earliest.getTime() - now.getTime()) / 60_000);
}

export function resolveOperationContext(args: {
  now: Date;
  unitCards: OperationsCenterUnitCard[];
  mealBoards: OperationsCenterMealBoard[];
}): OperationContext {
  const mealType = getDefaultMealTypeForTimeOfDay(args.now);
  const mealLabel = fmtMealLabel(mealType);
  const phase = resolveOperationPhase(mealType, args.mealBoards);
  const scheduledTimeLabel = resolveEarliestScheduledTime(args.unitCards, mealType, args.now);
  const minutesUntilService = resolveMinutesUntilService(args.unitCards, mealType, args.now);

  return {
    mealType,
    mealLabel,
    serviceLabel: `${mealLabel} service`,
    phase,
    scheduledTimeLabel,
    minutesUntilService,
  };
}
