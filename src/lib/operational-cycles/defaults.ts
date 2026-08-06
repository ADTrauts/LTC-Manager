/**
 * Dietary default Operational Cycle draft plan (pure).
 * Labels and windows are examples for a typical day — generate then review.
 * Never auto-applied to facilities.
 */

import type { MealType, OperationalCycleType, ServeryMilestone, UnitType } from "@prisma/client";

export type DietaryDefaultCyclePlan = {
  stableKey: string;
  label: string;
  description: string;
  cycleType: OperationalCycleType;
  displaySequence: number;
  startLocal: string;
  endLocal: string;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  mealType: MealType | null;
  expectedMilestones: ServeryMilestone[];
  locationMode: "ALL_DEPARTMENT_UNITS" | "UNIT_TYPES" | "EXPLICIT_UNITS";
  applicableUnitTypes: UnitType[];
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Example Dietary operating day for Department Builder "generate defaults" review.
 * Meal service targets remain on UnitMealTime — SERVICE cycles reference MealType only.
 */
export function buildDietaryDefaultCyclePlans(): DietaryDefaultCyclePlan[] {
  return [
    {
      stableKey: "morning_prep",
      label: "Morning Prep",
      description: "Kitchen and servery preparation before breakfast service.",
      cycleType: "PREPARATION",
      displaySequence: 10,
      startLocal: "05:30",
      endLocal: "07:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "BREAKFAST",
      expectedMilestones: [],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["KITCHEN", "SERVERY"],
    },
    {
      stableKey: "breakfast_service",
      label: "Breakfast",
      description: "Breakfast service window. Targets come from UnitMealTime.",
      cycleType: "SERVICE",
      displaySequence: 20,
      startLocal: "07:00",
      endLocal: "09:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "BREAKFAST",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["SERVERY"],
    },
    {
      stableKey: "breakfast_closeout",
      label: "Breakfast Closeout",
      description: "Closeout after breakfast service.",
      cycleType: "CLOSEOUT",
      displaySequence: 30,
      startLocal: "09:00",
      endLocal: "10:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "BREAKFAST",
      expectedMilestones: [],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["SERVERY", "KITCHEN"],
    },
    {
      stableKey: "lunch_prep",
      label: "Lunch Preparation",
      description: "Preparation before lunch service.",
      cycleType: "PREPARATION",
      displaySequence: 40,
      startLocal: "10:00",
      endLocal: "11:30",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "LUNCH",
      expectedMilestones: [],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["KITCHEN", "SERVERY"],
    },
    {
      stableKey: "lunch_service",
      label: "Lunch",
      description: "Lunch service window. Targets come from UnitMealTime.",
      cycleType: "SERVICE",
      displaySequence: 50,
      startLocal: "11:30",
      endLocal: "13:30",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "LUNCH",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["SERVERY"],
    },
    {
      stableKey: "afternoon_transition",
      label: "Afternoon Transition",
      description: "Transition between lunch and dinner preparation.",
      cycleType: "TRANSITION",
      displaySequence: 60,
      startLocal: "13:30",
      endLocal: "15:30",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["KITCHEN", "SERVERY"],
    },
    {
      stableKey: "dinner_prep",
      label: "Dinner Preparation",
      description: "Preparation before dinner service.",
      cycleType: "PREPARATION",
      displaySequence: 70,
      startLocal: "15:30",
      endLocal: "17:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "DINNER",
      expectedMilestones: [],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["KITCHEN", "SERVERY"],
    },
    {
      stableKey: "dinner_service",
      label: "Dinner",
      description: "Dinner service window. Targets come from UnitMealTime.",
      cycleType: "SERVICE",
      displaySequence: 80,
      startLocal: "17:00",
      endLocal: "19:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: "DINNER",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["SERVERY"],
    },
    {
      stableKey: "shift_closeout",
      label: "Shift Closeout",
      description: "End-of-day Dietary closeout.",
      cycleType: "CLOSEOUT",
      displaySequence: 90,
      startLocal: "19:00",
      endLocal: "21:00",
      overnight: false,
      applicableDaysOfWeek: [...ALL_DAYS],
      mealType: null,
      expectedMilestones: [],
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["KITCHEN", "SERVERY"],
    },
  ];
}
