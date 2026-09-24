import type { MealType, ServeryMilestone, UnitType } from "@prisma/client";

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
