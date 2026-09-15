/**
 * Dietary / EVS default Operational Cycle draft plans (pure).
 * Dietary defaults illustrate a nested operating day; EVS stays shallow.
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
  locationMode: "ALL_DEPARTMENT_UNITS" | "UNIT_TYPES" | "EXPLICIT_UNITS" | "ROOM_TYPE";
  locationInheritFromParent?: boolean;
  applicableUnitTypes: UnitType[];
  roomTypeKey: string | null;
};

/** EVS cycles: no mealType, no expectedMilestones. */
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
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function mealChildren(
  mealKey: string,
  mealLabel: string,
  prepStart: string,
  prepEnd: string,
  cleanupStart: string,
  cleanupEnd: string,
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
      stableKey: `${mealKey}_due`,
      parentStableKey: mealKey,
      nodeKind: "KEY_TIME" as const,
      label: `${mealLabel} Due`,
      description: `${mealLabel} key due times — configure rooms and due times after setup.`,
      cycleType: "CUSTOM" as const,
      displaySequence: 12,
      startLocal: null,
      endLocal: null,
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [] as ServeryMilestone[],
      locationMode: "EXPLICIT_UNITS" as const,
      applicableUnitTypes: [] as UnitType[],
      roomTypeKey: null,
    },
    {
      stableKey: `${mealKey}_cleanup`,
      parentStableKey: mealKey,
      nodeKind: "PERIOD" as const,
      label: "Cleanup",
      description: `${mealLabel} cleanup phase.`,
      cycleType: "CLOSEOUT" as const,
      displaySequence: 13,
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
 * Example Dietary operating day: Breakfast / Lunch / Dinner PERIOD roots with
 * Prep (inherit), Due KEY_TIME (no groups yet), and Cleanup (inherit) children.
 * Top-level locations use EXPLICIT_UNITS with empty spaces — assign rooms in Build.
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
    ...mealChildren("breakfast", "Breakfast", "05:30", "07:10", "09:00", "10:00"),
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
    ...mealChildren("lunch", "Lunch", "10:00", "11:30", "13:30", "14:00"),
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
    ...mealChildren("dinner", "Dinner", "15:30", "17:00", "19:00", "20:00"),
  ];
}

/**
 * Example EVS operating day — shallow top-level periods.
 */
export function buildEvsDefaultCyclePlans(): EvsDefaultCyclePlan[] {
  return [
    {
      stableKey: "morning_routine",
      parentStableKey: null,
      nodeKind: "PERIOD",
      label: "Morning Operations",
      description: "Morning room and area cleaning window.",
      cycleType: "PREPARATION",
      displaySequence: 10,
      startLocal: "06:00",
      endLocal: "10:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [],
      locationMode: "ALL_DEPARTMENT_UNITS",
      applicableUnitTypes: [],
      roomTypeKey: null,
    },
    {
      stableKey: "day_cleaning",
      parentStableKey: null,
      nodeKind: "PERIOD",
      label: "Afternoon Operations",
      description: "Midday cleaning window.",
      cycleType: "CUSTOM",
      displaySequence: 20,
      startLocal: "10:00",
      endLocal: "16:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [],
      locationMode: "ALL_DEPARTMENT_UNITS",
      applicableUnitTypes: [],
      roomTypeKey: null,
    },
    {
      stableKey: "evening_closeout",
      parentStableKey: null,
      nodeKind: "PERIOD",
      label: "Evening Operations",
      description: "Evening cleaning and closeout window.",
      cycleType: "CLOSEOUT",
      displaySequence: 30,
      startLocal: "16:00",
      endLocal: "20:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [],
      locationMode: "ALL_DEPARTMENT_UNITS",
      applicableUnitTypes: [],
      roomTypeKey: null,
    },
  ];
}
