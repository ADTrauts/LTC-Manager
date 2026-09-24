import type { MealType, UnitType } from "@prisma/client";

export type OperationsCenterUnitMealTime = {
  mealType: MealType;
  /** Expected today (adjusted ?? configured). */
  scheduledTime: string;
  configuredTime?: string | null;
  adjustedTime?: string | null;
  actualTime?: string | null;
  timingStatusLabel?: string | null;
};

export type OperationsCenterUnitCard = {
  id: string;
  name: string;
  unitType: UnitType;
  hasDietary: boolean;
  expected: number;
  completed: number;
  failed: number;
  missed: number;
  pending: number;
  mealTimes: OperationsCenterUnitMealTime[];
  staffingCount: number;
  openRepairCount: number;
};

export type OperationsCenterLogTotals = {
  expected: number;
  completed: number;
  failed: number;
  missed: number;
  pending: number;
};

export type OperationsCenterMealBoardRow = {
  unitId: string;
  unitName: string;
  unitType: UnitType;
  mealTime: string;
  statusLabel: string;
  isReadyLive: boolean;
  isStartedLive: boolean;
};

export type OperationsCenterMealBoard = {
  meal: MealType;
  rows: OperationsCenterMealBoardRow[];
};

export type OperationContext = {
  mealType: MealType;
  mealLabel: string;
  serviceLabel: string;
  phase: "Preparation" | "Execution";
  scheduledTimeLabel: string | null;
  minutesUntilService: number | null;
};

export type OperationsCenterKeyTimeSummary = {
  cycleLabel: string;
  parentCycleLabel: string | null;
  displayPath: string;
  expectedToday: string;
  total: number;
  completed: number;
  overdue: number;
};
