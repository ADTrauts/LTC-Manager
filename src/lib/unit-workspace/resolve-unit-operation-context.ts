import type { MealType } from "@prisma/client";

import { fmtMealLabel, type OperationContext } from "@/lib/operations-center";
import {
  getDefaultMealTypeForTimeOfDay,
  isWithinServeryLiveWindow,
  pickDefaultMealTypeForUnitSlots,
} from "@/lib/servery-meal-service";

import type { UnitWorkspaceMealServiceEventToday, UnitWorkspaceUnit } from "./types";

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

function resolveScheduledTimeLabel(
  mealTimes: UnitWorkspaceUnit["mealTimes"],
  mealType: MealType,
  now: Date,
): string | null {
  const slot = mealTimes.find((time) => time.mealType === mealType);
  if (!slot) return null;
  const parsed = parseScheduledTimeOnDate(slot.scheduledTime, now);
  if (!parsed) return null;
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function resolveMinutesUntilService(
  mealTimes: UnitWorkspaceUnit["mealTimes"],
  mealType: MealType,
  now: Date,
): number | null {
  const slot = mealTimes.find((time) => time.mealType === mealType);
  if (!slot) return null;
  const parsed = parseScheduledTimeOnDate(slot.scheduledTime, now);
  if (!parsed) return null;
  return Math.round((parsed.getTime() - now.getTime()) / 60_000);
}

function resolveActiveMealType(unit: UnitWorkspaceUnit, now: Date): MealType {
  const mealTypes = unit.mealTimes.map((slot) => slot.mealType);
  if (unit.unitType === "SERVERY" && mealTypes.length > 0) {
    return pickDefaultMealTypeForUnitSlots(mealTypes, now);
  }
  return getDefaultMealTypeForTimeOfDay(now);
}

function resolveOperationPhase(
  unit: UnitWorkspaceUnit,
  mealType: MealType,
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>,
  now: Date,
): OperationContext["phase"] {
  if (unit.unitType !== "SERVERY") {
    return "Preparation";
  }
  const event = mealServiceEventByMeal.get(mealType);
  if (
    event &&
    (isWithinServeryLiveWindow(event.mealServiceReadyAt, now) ||
      isWithinServeryLiveWindow(event.mealServiceStartedAt, now))
  ) {
    return "Execution";
  }
  return "Preparation";
}

export function resolveUnitOperationContext(args: {
  unit: UnitWorkspaceUnit;
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>;
  now: Date;
}): OperationContext {
  const mealType = resolveActiveMealType(args.unit, args.now);
  const mealLabel = fmtMealLabel(mealType);
  const phase = resolveOperationPhase(args.unit, mealType, args.mealServiceEventByMeal, args.now);

  return {
    mealType,
    mealLabel,
    serviceLabel: `${mealLabel} service`,
    phase,
    scheduledTimeLabel: resolveScheduledTimeLabel(args.unit.mealTimes, mealType, args.now),
    minutesUntilService: resolveMinutesUntilService(args.unit.mealTimes, mealType, args.now),
  };
}
