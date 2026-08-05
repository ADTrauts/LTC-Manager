import type { MealType, ServeryMilestone, UnitType } from "@prisma/client";
import type { ensureMenuSettingsDefaults, menuForDate } from "@/lib/menu-cycle";
import type { OperationContext } from "@/lib/operations-center";
import type { UnitReadiness } from "@/lib/readiness/types";

import type { UnitWorkQueue } from "./build-unit-work-queue";
import type { UnitQueryResult } from "./load-unit-queries";
import type {
  UnitInspectionDefinitionRow,
  UnitInspectionHistoryRow,
} from "@/lib/work/inspections/list-unit-inspections";

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
  inspect?: string;
  occurrence?: string;
  inspectionResult?: string;
  inspectionName?: string;
  followUpTask?: string;
};

export type UnitWorkspaceLogTab = {
  key: string;
  label: string;
};

export type UnitWorkspaceMealServiceEventToday = {
  mealType: MealType;
  /** When each milestone occurred. Null means Not Confirmed, not "did not occur". */
  mealServiceReadyAt: Date | null;
  mealServiceStartedAt: Date | null;
  /** When the server accepted each record. Null for records predating the column. */
  readyRecordedAt?: Date | null;
  startedRecordedAt?: Date | null;
  readyRecordedBy?: { displayName: string | null } | null;
  startedRecordedBy?: { displayName: string | null } | null;
  readyRecordedByEmployee?: { firstName: string; lastName: string } | null;
  startedRecordedByEmployee?: { firstName: string; lastName: string } | null;
  /** Which milestones have ever been corrected. */
  entries?: { milestone: ServeryMilestone }[];
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
  operationContext: OperationContext;
  workQueue: UnitWorkQueue;
  readiness: UnitReadiness;
  availableInspections: UnitInspectionDefinitionRow[];
  inspectionHistory: UnitInspectionHistoryRow[];
  openInspectionFollowUps: Array<{
    id: string;
    title: string;
    status: "OPEN" | "IN_PROGRESS";
    description: string | null;
  }>;
  activeInspectId: string | null;
  activeOccurrenceId: string | null;
  activeFollowUpTaskId: string | null;
  inspectionResultMessage: { title: string; body: string } | null;
  facilityTimezone: string | null;
};
