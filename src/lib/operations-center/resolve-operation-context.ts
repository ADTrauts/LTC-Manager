import type { MealType } from "@prisma/client";

import { parseFacilityLocalScheduledStart, resolveFacilityTimezone } from "@/lib/operational-time";
import { getDefaultMealTypeForTimeOfDay } from "@/lib/servery-meal-service";

import { fmtMealLabel } from "./fmt-meal-label";
import type { OperationContext, OperationsCenterMealBoard, OperationsCenterUnitCard } from "./types";

function resolveEarliestScheduledTime(
  unitCards: OperationsCenterUnitCard[],
  mealType: MealType,
  now: Date,
  facilityTimezone: string,
): string | null {
  let earliest: Date | null = null;
  for (const unit of unitCards) {
    if (!unit.hasDietary) continue;
    const slot = unit.mealTimes.find((time) => time.mealType === mealType);
    if (!slot) continue;
    const parsed = parseFacilityLocalScheduledStart(slot.scheduledTime, now, facilityTimezone);
    if (!parsed) continue;
    if (!earliest || parsed.getTime() < earliest.getTime()) {
      earliest = parsed;
    }
  }
  if (!earliest) return null;
  return earliest.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: facilityTimezone });
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
  facilityTimezone: string,
): number | null {
  let earliest: Date | null = null;
  for (const unit of unitCards) {
    if (!unit.hasDietary) continue;
    const slot = unit.mealTimes.find((time) => time.mealType === mealType);
    if (!slot) continue;
    const parsed = parseFacilityLocalScheduledStart(slot.scheduledTime, now, facilityTimezone);
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
  facilityTimezone?: string | null;
}): OperationContext {
  const facilityTimezone = resolveFacilityTimezone(args.facilityTimezone);
  const mealType = getDefaultMealTypeForTimeOfDay(args.now, facilityTimezone);
  const mealLabel = fmtMealLabel(mealType);
  const phase = resolveOperationPhase(mealType, args.mealBoards);
  const scheduledTimeLabel = resolveEarliestScheduledTime(
    args.unitCards,
    mealType,
    args.now,
    facilityTimezone,
  );
  const minutesUntilService = resolveMinutesUntilService(
    args.unitCards,
    mealType,
    args.now,
    facilityTimezone,
  );

  return {
    mealType,
    mealLabel,
    serviceLabel: `${mealLabel} service`,
    phase,
    scheduledTimeLabel,
    minutesUntilService,
  };
}
