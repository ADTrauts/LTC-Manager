import type { MealType, UnitType } from "@prisma/client";

export type OperationsCenterUnitMealTime = {
  mealType: MealType;
  scheduledTime: string;
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

export type OperationsCenterBirthdayEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  birthDay: number | null;
};

export type OperationsCenterDashboardData = {
  month: number;
  managerCount: number;
  birthdaysThisMonth: OperationsCenterBirthdayEmployee[];
  unitCount: number;
  mealBoards: OperationsCenterMealBoard[];
  totals: OperationsCenterLogTotals;
  unitsWithExceptions: OperationsCenterUnitCard[];
  unitsMissingStaffing: OperationsCenterUnitCard[];
  unitCards: OperationsCenterUnitCard[];
  openRepairCount: number;
  urgentRepairCount: number;
};
