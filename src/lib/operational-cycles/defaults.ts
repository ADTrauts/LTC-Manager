/**
 * Dietary / EVS default Operational Cycle draft plans (pure).
 * Dietary and Environmental Services defaults illustrate a nested operating day.
 * Never auto-applied to facilities. Never infers hierarchy from labels in existing data.
 */

import type {
  MealType,
  OperationalCycleNodeKind,
  OperationalCycleType,
  ServeryMilestone,
  UnitType,
} from "@prisma/client";

export type DietaryDefaultCyclePlan = {
  stableKey: string;
  parentStableKey: string | null;
  nodeKind: OperationalCycleNodeKind;
  label: string;
  description: string;
  cycleType: OperationalCycleType;
  displaySequence: number;
  startLocal: string | null;
  endLocal: string | null;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  mealType: MealType | null;
  expectedMilestones: ServeryMilestone[];
  locationMode:
    | "ALL_DEPARTMENT_UNITS"
    | "UNIT_TYPES"
    | "EXPLICIT_UNITS"
    | "ROOM_TYPE"
    | "OPERATIONAL_TYPES";
  locationInheritFromParent?: boolean;
  applicableUnitTypes: UnitType[];
  applicableOperationalTypeKeys?: string[];
  roomTypeKey: string | null;
  occurrenceTracking?: "NONE" | "OPTIONAL" | "REQUIRED";
  keyPointGrain?: "DEPARTMENT" | "LOCATION";
  dueLocals?: string[];
};

/** EVS cycles: no mealType, no expectedMilestones, no Location Function keys. */
export type EvsDefaultCyclePlan = {
  stableKey: string;
  parentStableKey: string | null;
  nodeKind: OperationalCycleNodeKind;
  label: string;
  description: string;
  cycleType: OperationalCycleType;
  displaySequence: number;
  startLocal: string | null;
  endLocal: string | null;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  mealType: null;
  expectedMilestones: [];
  locationMode: "ALL_DEPARTMENT_UNITS" | "UNIT_TYPES" | "EXPLICIT_UNITS" | "ROOM_TYPE";
  locationInheritFromParent?: boolean;
  applicableUnitTypes: UnitType[];
  roomTypeKey: string | null;
  occurrenceTracking?: "NONE" | "OPTIONAL" | "REQUIRED";
  keyPointGrain?: "DEPARTMENT" | "LOCATION";
  dueLocals?: string[];
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Meal Phase children for a Dietary Operational Cycle root.
 * Service window is the contiguous gap between Prep end and Cleanup start so the
 * root Cycle no longer doubles as an implicit Service Phase.
 */
function mealChildren(
  mealKey: string,
  mealLabel: string,
  prepStart: string,
  prepEnd: string,
  cleanupStart: string,
  cleanupEnd: string,
  dueLocal: string,
  readyLocal: string,
  serviceStartedLocal: string,
) {
  return [
    {
      stableKey: `${mealKey}_prep`,
      parentStableKey: mealKey,
      nodeKind: "PERIOD" as const,
      label: "Prep",
      description: `${mealLabel} preparation phase.`,
      cycleType: "PREPARATION" as const,
      displaySequence: 11,
      startLocal: prepStart,
      endLocal: prepEnd,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [] as ServeryMilestone[],
      locationMode: "EXPLICIT_UNITS" as const,
      locationInheritFromParent: true,
      applicableUnitTypes: [] as UnitType[],
      roomTypeKey: null,
    },
    {
      stableKey: `${mealKey}_service`,
      parentStableKey: mealKey,
      nodeKind: "PERIOD" as const,
      label: "Service",
      description: `${mealLabel} service phase.`,
      cycleType: "SERVICE" as const,
      displaySequence: 12,
      startLocal: prepEnd,
      endLocal: cleanupStart,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [] as ServeryMilestone[],
      locationMode: "EXPLICIT_UNITS" as const,
      locationInheritFromParent: true,
      applicableUnitTypes: [] as UnitType[],
      roomTypeKey: null,
    },
    {
      stableKey: `${mealKey}_due`,
      parentStableKey: mealKey,
      nodeKind: "KEY_TIME" as const,
      label: `${mealLabel} Due`,
      description: `${mealLabel} key points — configure rooms and due times after setup.`,
      cycleType: "CUSTOM" as const,
      displaySequence: 13,
      startLocal: null,
      endLocal: null,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [] as ServeryMilestone[],
      locationMode: "ALL_DEPARTMENT_UNITS" as const,
      applicableUnitTypes: [] as UnitType[],
      roomTypeKey: null,
      occurrenceTracking: "NONE" as const,
      keyPointGrain: "DEPARTMENT" as const,
      dueLocals: [dueLocal],
    },
    {
      stableKey: `${mealKey}_ready`,
      parentStableKey: mealKey,
      nodeKind: "KEY_TIME" as const,
      label: `${mealLabel} Ready`,
      description: `${mealLabel} readiness at each room in this Key Point group.`,
      cycleType: "CUSTOM" as const,
      displaySequence: 13,
      startLocal: null,
      endLocal: null,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [] as ServeryMilestone[],
      locationMode: "EXPLICIT_UNITS" as const,
      applicableUnitTypes: [] as UnitType[],
      applicableOperationalTypeKeys: [],
      roomTypeKey: null,
      occurrenceTracking: "REQUIRED" as const,
      keyPointGrain: "LOCATION" as const,
      dueLocals: [readyLocal],
    },
    {
      stableKey: `${mealKey}_service_started`,
      parentStableKey: mealKey,
      nodeKind: "KEY_TIME" as const,
      label: `${mealLabel} Service Started`,
      description: `${mealLabel} service start at each room in this Key Point group.`,
      cycleType: "CUSTOM" as const,
      displaySequence: 13,
      startLocal: null,
      endLocal: null,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [] as ServeryMilestone[],
      locationMode: "EXPLICIT_UNITS" as const,
      applicableUnitTypes: [] as UnitType[],
      applicableOperationalTypeKeys: [],
      roomTypeKey: null,
      occurrenceTracking: "REQUIRED" as const,
      keyPointGrain: "LOCATION" as const,
      dueLocals: [serviceStartedLocal],
    },
    {
      stableKey: `${mealKey}_cleanup`,
      parentStableKey: mealKey,
      nodeKind: "PERIOD" as const,
      label: "Cleanup",
      description: `${mealLabel} cleanup phase.`,
      cycleType: "CLOSEOUT" as const,
      displaySequence: 14,
      startLocal: cleanupStart,
      endLocal: cleanupEnd,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [] as ServeryMilestone[],
      locationMode: "EXPLICIT_UNITS" as const,
      locationInheritFromParent: true,
      applicableUnitTypes: [] as UnitType[],
      roomTypeKey: null,
    },
  ];
}

/**
 * Example Dietary operating day: Breakfast / Lunch / Dinner Operational Cycles
 * with Prep, Service, Cleanup Phases (inherit) and Due Key Points.
 * Top-level locations use EXPLICIT_UNITS with empty spaces — assign rooms in Build.
 * Future starter application only — never rewrites published facility rhythms.
 */
export function buildDietaryDefaultCyclePlans(): DietaryDefaultCyclePlan[] {
  const breakfastStart = "05:30";
  const breakfastEnd = "10:00";
  const lunchStart = "10:00";
  const lunchEnd = "14:00";
  const dinnerStart = "15:30";
  const dinnerEnd = "20:00";

  return [
    {
      stableKey: "breakfast",
      parentStableKey: null,
      nodeKind: "PERIOD",
      label: "Breakfast",
      description: "Breakfast operating period. Assign rooms in Build.",
      cycleType: "CUSTOM",
      displaySequence: 10,
      startLocal: breakfastStart,
      endLocal: breakfastEnd,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "BREAKFAST",
      expectedMilestones: [],
      locationMode: "EXPLICIT_UNITS",
      applicableUnitTypes: [],
      roomTypeKey: null,
    },
    ...mealChildren("breakfast", "Breakfast", "05:30", "07:10", "09:00", "10:00", "08:00", "07:05", "07:10"),
    {
      stableKey: "lunch",
      parentStableKey: null,
      nodeKind: "PERIOD",
      label: "Lunch",
      description: "Lunch operating period. Assign rooms in Build.",
      cycleType: "CUSTOM",
      displaySequence: 20,
      startLocal: lunchStart,
      endLocal: lunchEnd,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "LUNCH",
      expectedMilestones: [],
      locationMode: "EXPLICIT_UNITS",
      applicableUnitTypes: [],
      roomTypeKey: null,
    },
    ...mealChildren("lunch", "Lunch", "10:00", "11:30", "13:30", "14:00", "12:00", "11:25", "11:30"),
    {
      stableKey: "dinner",
      parentStableKey: null,
      nodeKind: "PERIOD",
      label: "Dinner",
      description: "Dinner operating period. Assign rooms in Build.",
      cycleType: "CUSTOM",
      displaySequence: 30,
      startLocal: dinnerStart,
      endLocal: dinnerEnd,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "DINNER",
      expectedMilestones: [],
      locationMode: "EXPLICIT_UNITS",
      applicableUnitTypes: [],
      roomTypeKey: null,
    },
    ...mealChildren("dinner", "Dinner", "15:30", "17:00", "19:00", "20:00", "17:30", "16:55", "17:00"),
  ];
}

/**
 * Example EVS operating day. Roots cover every place the Department is
 * responsible for. Area Ready is REQUIRED at location grain and starts with
 * no rooms, so nothing is overdue until the facility names them.
 */
function evsWindow(input: {
  stableKey: string;
  label: string;
  description: string;
  cycleType: OperationalCycleType;
  displaySequence: number;
  startLocal: string;
  openingEnd: string;
  cleaningEnd: string;
  endLocal: string;
  readyDue: string;
}): EvsDefaultCyclePlan[] {
  const base = {
    overnight: false,
    applicableDaysOfWeek: [...ALL_DAYS],
    mealType: null as null,
    expectedMilestones: [] as [],
    applicableUnitTypes: [] as UnitType[],
    roomTypeKey: null,
  };
  return [
    {
      ...base,
      stableKey: input.stableKey,
      parentStableKey: null,
      nodeKind: "PERIOD",
      label: input.label,
      description: input.description,
      cycleType: input.cycleType,
      displaySequence: input.displaySequence,
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      locationMode: "ALL_DEPARTMENT_UNITS",
    },
    {
      ...base,
      stableKey: `${input.stableKey}_opening`,
      parentStableKey: input.stableKey,
      nodeKind: "PERIOD",
      label: `${input.label} opening`,
      description: `${input.label} opening phase.`,
      cycleType: "PREPARATION",
      displaySequence: input.displaySequence + 1,
      startLocal: input.startLocal,
      endLocal: input.openingEnd,
      locationMode: "ALL_DEPARTMENT_UNITS",
      locationInheritFromParent: true,
    },
    {
      ...base,
      stableKey: `${input.stableKey}_cleaning`,
      parentStableKey: input.stableKey,
      nodeKind: "PERIOD",
      label: `${input.label} cleaning`,
      description: `${input.label} cleaning phase.`,
      cycleType: "CUSTOM",
      displaySequence: input.displaySequence + 2,
      startLocal: input.openingEnd,
      endLocal: input.cleaningEnd,
      locationMode: "ALL_DEPARTMENT_UNITS",
      locationInheritFromParent: true,
    },
    {
      ...base,
      stableKey: `${input.stableKey}_closeout`,
      parentStableKey: input.stableKey,
      nodeKind: "PERIOD",
      label: `${input.label} closeout`,
      description: `${input.label} closeout phase.`,
      cycleType: "CLOSEOUT",
      displaySequence: input.displaySequence + 3,
      startLocal: input.cleaningEnd,
      endLocal: input.endLocal,
      locationMode: "ALL_DEPARTMENT_UNITS",
      locationInheritFromParent: true,
    },
    {
      ...base,
      stableKey: `${input.stableKey}_shift_opened`,
      parentStableKey: input.stableKey,
      nodeKind: "KEY_TIME",
      label: `${input.label} shift opened`,
      description: `${input.label} shift is open. This Key Point does not require an actual.`,
      cycleType: "CUSTOM",
      displaySequence: input.displaySequence + 4,
      startLocal: null,
      endLocal: null,
      locationMode: "ALL_DEPARTMENT_UNITS",
      occurrenceTracking: "NONE",
      keyPointGrain: "DEPARTMENT",
      dueLocals: [input.startLocal],
    },
    {
      ...base,
      stableKey: `${input.stableKey}_area_ready`,
      parentStableKey: input.stableKey,
      nodeKind: "KEY_TIME",
      label: `${input.label} area ready`,
      description: `${input.label} area ready at each room in this Key Point group.`,
      cycleType: "CUSTOM",
      displaySequence: input.displaySequence + 5,
      startLocal: null,
      endLocal: null,
      locationMode: "EXPLICIT_UNITS",
      occurrenceTracking: "REQUIRED",
      keyPointGrain: "LOCATION",
      dueLocals: [input.readyDue],
    },
  ];
}

export function buildEvsDefaultCyclePlans(): EvsDefaultCyclePlan[] {
  return [
    ...evsWindow({
      stableKey: "morning_routine",
      label: "Morning Operations",
      description: "Morning room and area cleaning window. Every responsible place participates.",
      cycleType: "PREPARATION",
      displaySequence: 10,
      startLocal: "06:00",
      openingEnd: "06:30",
      cleaningEnd: "09:30",
      endLocal: "10:00",
      readyDue: "09:30",
    }),
    ...evsWindow({
      stableKey: "day_cleaning",
      label: "Afternoon Operations",
      description: "Afternoon cleaning window. Every responsible place participates.",
      cycleType: "CUSTOM",
      displaySequence: 20,
      startLocal: "10:00",
      openingEnd: "10:30",
      cleaningEnd: "15:30",
      endLocal: "16:00",
      readyDue: "15:30",
    }),
    ...evsWindow({
      stableKey: "evening_closeout",
      label: "Evening Operations",
      description: "Evening cleaning and closeout window. Every responsible place participates.",
      cycleType: "CLOSEOUT",
      displaySequence: 30,
      startLocal: "16:00",
      openingEnd: "16:30",
      cleaningEnd: "19:30",
      endLocal: "20:00",
      readyDue: "19:30",
    }),
  ];
}
