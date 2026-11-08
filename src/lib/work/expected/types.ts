/**
 * Derived Today's Work view of canonical WorkRequirements.
 * Not persisted. Not a second Work engine.
 */

import type { WorkRequirementState } from "@/lib/department-work/types";

export type TodaysExpectedWorkItemView = {
  occurrenceKey: string;
  workItemKey: string;
  label: string;
  state: WorkRequirementState;
  completed: boolean;
  /** Calm status when the item is not a simple open checkbox. */
  statusLabel: string | null;
  evidenceRequired: boolean;
  canConfirm: boolean;
  facilityId: string;
  departmentId: string;
  unitId: string | null;
};

export type TodaysExpectedWorkPlanView = {
  workPlanId: string;
  workPlanName: string;
  assignmentLabel: string | null;
  items: TodaysExpectedWorkItemView[];
};

export type TodaysExpectedWorkLocationView = {
  unitId: string;
  locationName: string;
  plans: TodaysExpectedWorkPlanView[];
};

export type TodaysExpectedWorkCurrentGroupView = {
  operationLabel: string;
  windowLabel: string | null;
  cycleStableKeys: string[];
  locations: TodaysExpectedWorkLocationView[];
};

export type TodaysExpectedWorkUpcomingView = {
  operationLabel: string;
  windowLabel: string | null;
  locations: TodaysExpectedWorkLocationView[];
};

export type TodaysExpectedWorkView = {
  workCapabilityEnabled: boolean;
  hasPublishedWorkPlans: boolean;
  currentGroups: TodaysExpectedWorkCurrentGroupView[];
  otherWork: TodaysExpectedWorkLocationView[];
  upcoming: TodaysExpectedWorkUpcomingView | null;
  configureHref: string | null;
  configureLabel: string | null;
};
