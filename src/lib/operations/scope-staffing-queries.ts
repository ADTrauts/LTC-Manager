import type { MealType, ShiftType } from "@prisma/client";

import { isOperationEngineEnabled } from "@/lib/feature-flags";

import { resolveLogDueMealScope } from "./scope-log-due-queries";
import type { ResolvedActiveOperation } from "./types";

export type StaffingScheduleRow = {
  unitId: string;
  shift: ShiftType;
};

export type StaffingOverrideRow = {
  oldUnitId: string | null;
  newUnitId: string;
  mealType?: MealType | null;
};

/** Reuses operation meal scope resolution from log due queries. */
export const resolveStaffingMealScope = resolveLogDueMealScope;

export function mealScopeToShiftType(mealScope: MealType): ShiftType {
  return mealScope as ShiftType;
}

export function resolveStaffingShiftScope(
  mealScope: MealType | undefined,
): ShiftType[] | undefined {
  if (mealScope === undefined) {
    return undefined;
  }
  return [mealScopeToShiftType(mealScope)];
}

export function isStaffingScheduleInScope(
  entry: Pick<StaffingScheduleRow, "shift">,
  mealScope: MealType | undefined,
): boolean {
  if (mealScope === undefined) {
    return true;
  }
  if (entry.shift === "FULL_DAY") {
    return true;
  }
  return entry.shift === mealScopeToShiftType(mealScope);
}

export function isStaffingOverrideInScope(
  override: Pick<StaffingOverrideRow, "mealType">,
  mealScope: MealType | undefined,
): boolean {
  if (mealScope === undefined) {
    return true;
  }
  if (override.mealType == null) {
    return true;
  }
  return override.mealType === mealScope;
}

export function scopeStaffingQueries<
  TSchedule extends StaffingScheduleRow,
  TOverride extends StaffingOverrideRow,
>(input: {
  schedules: TSchedule[];
  overrides: TOverride[];
  activeOperation: Pick<ResolvedActiveOperation, "source" | "operationContext"> | null;
  engineEnabled?: boolean;
}): { schedules: TSchedule[]; overrides: TOverride[] } {
  const mealScope = resolveStaffingMealScope(
    input.activeOperation,
    input.engineEnabled ?? isOperationEngineEnabled(),
  );

  if (mealScope === undefined) {
    return {
      schedules: input.schedules,
      overrides: input.overrides,
    };
  }

  return {
    schedules: input.schedules.filter((entry) => isStaffingScheduleInScope(entry, mealScope)),
    overrides: input.overrides.filter((override) => isStaffingOverrideInScope(override, mealScope)),
  };
}
