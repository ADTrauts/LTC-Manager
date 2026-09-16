import type { MealType, UnitType } from "@prisma/client";

import type { RunDepartmentOperationPresentation } from "@/lib/operational-cycles";
import type { CallDownItem, CallDownSummary } from "@/lib/todays-work/call-down";

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

export type OperationsCenterBirthdayEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  birthDay: number | null;
};

export type OperationContext = {
  mealType: MealType;
  mealLabel: string;
  serviceLabel: string;
  phase: "Preparation" | "Execution";
  scheduledTimeLabel: string | null;
  minutesUntilService: number | null;
};

export type SitePulseSummary = {
  headline: string;
  tone: "healthy" | "at_risk" | "blocked" | "neutral";
  ready: number;
  inProgress: number;
  blocked: number;
  attentionCount: number;
  locationSummary: string;
};

export type OperationsCenterCallDownData = {
  items: CallDownItem[];
  summary: CallDownSummary;
  dateIso: string;
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
  operationContext: OperationContext;
  sitePulse: SitePulseSummary;
  callDowns?: OperationsCenterCallDownData;
  /** Generic Key Time progress across departments with published KEY_TIME nodes. */
  keyTimeSummaries?: OperationsCenterKeyTimeSummary[];
  /** New-model PERIOD / KEY_TIME presentation when the effective config uses it. */
  runPresentation?: RunDepartmentOperationPresentation | null;
};
