/**
 * Today's Work shell. Generic Work Plans no longer fill this view.
 */

export type TodaysExpectedWorkItemView = {
  occurrenceKey: string;
  label: string;
  state: string;
  statusLabel: string;
  canConfirm: boolean;
  completed?: boolean;
  unitId: string | null;
  facilityId?: string;
  departmentId?: string;
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

export type TodaysExpectedWorkView = {
  workCapabilityEnabled: boolean;
  configureHref: string | null;
  configureLabel: string | null;
  currentGroups: {
    operationLabel: string;
    windowLabel: string | null;
    locations: TodaysExpectedWorkLocationView[];
  }[];
  otherWork: TodaysExpectedWorkLocationView[];
  upcoming: {
    operationLabel: string;
    windowLabel: string | null;
    locations: TodaysExpectedWorkLocationView[];
  } | null;
};

export function emptyTodaysExpectedWork(): TodaysExpectedWorkView {
  return {
    workCapabilityEnabled: false,
    configureHref: null,
    configureLabel: null,
    currentGroups: [],
    otherWork: [],
    upcoming: null,
  };
}

export function todaysExpectedWorkHasVisibleWork(view: TodaysExpectedWorkView): boolean {
  return view.currentGroups.some((group) => group.locations.length > 0) || view.otherWork.length > 0;
}
