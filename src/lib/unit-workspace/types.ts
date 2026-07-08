import type { MealType, UnitType } from "@prisma/client";
import type { ensureMenuSettingsDefaults, menuForDate } from "@/lib/menu-cycle";

import type { UnitQueryResult } from "./load-unit-queries";

export type UnitWorkspaceUnit = {
  id: string;
  name: string;
  unitType: UnitType;
  isActive: boolean;
  mealTimes: Array<{
    mealType: MealType;
    scheduledTime: string;
  }>;
};

export type UnitWorkspaceSearchParams = {
  unitTab?: string;
  logTab?: string;
  mealServiceEvent?: string;
};

export type UnitWorkspaceLogTab = {
  key: string;
  label: string;
};

export type UnitWorkspaceMealServiceEventToday = {
  mealType: MealType;
  mealServiceReadyAt: Date | null;
  mealServiceStartedAt: Date | null;
};

export type UnitWorkspaceViewModel = {
  unit: UnitWorkspaceUnit;
  queries: UnitQueryResult;
  activeUnitTab: "overview" | "logs";
  activeLogTab: string | null;
  logTabs: UnitWorkspaceLogTab[];
  selectedLogCategory: string | null;
  selectedLogHistory: UnitQueryResult["logHistory"];
  expected: number;
  completed: number;
  failed: number;
  missed: number;
  pending: number;
  movedOut: number;
  movedIn: number;
  effectiveCoverage: number;
  mealServiceEventMessage: string | null;
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>;
  menuSettings: ReturnType<typeof ensureMenuSettingsDefaults>;
  menuUnavailableReason: string | null;
  todaysMenu: ReturnType<typeof menuForDate>;
  now: Date;
};
