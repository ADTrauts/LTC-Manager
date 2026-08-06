import type {
  MealType,
  OperationalCycleLocationMode,
  OperationalCycleStatus,
  OperationalCycleType,
  ServeryMilestone,
  UnitType,
} from "@prisma/client";

/** Cycle definition fields shared by builders and the pure resolver. */
export type OperationalCycleDefinition = {
  id: string;
  stableKey: string;
  version: number;
  label: string;
  description: string | null;
  cycleType: OperationalCycleType;
  displaySequence: number;
  startLocal: string;
  endLocal: string;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  mealType: MealType | null;
  locationMode: OperationalCycleLocationMode;
  applicableUnitTypes: UnitType[];
  expectedMilestones: ServeryMilestone[];
  status: OperationalCycleStatus;
  /** Explicit unit ids when locationMode = EXPLICIT_UNITS. */
  unitIds: string[];
};

/** A published cycle with resolved window instants for one operational date. */
export type ResolvedCycleOccurrence = {
  id: string;
  stableKey: string;
  version: number;
  label: string;
  cycleType: OperationalCycleType;
  displaySequence: number;
  startLocal: string;
  endLocal: string;
  overnight: boolean;
  mealType: MealType | null;
  expectedMilestones: ServeryMilestone[];
  startsAt: Date;
  endsAt: Date;
};

/**
 * Deterministic operational-cycle state for one department (optionally scoped to a unit)
 * at one instant. Only cycle-bearing variants carry cycle identifiers.
 */
export type OperationalCycleContext =
  | { state: "NOT_APPLICABLE" }
  | { state: "NOT_CONFIGURED"; reason: "NO_PUBLISHED_CYCLES" | "NONE_APPLICABLE" }
  | {
      state: "ACTIVE";
      primary: ResolvedCycleOccurrence;
      activeCycles: ResolvedCycleOccurrence[];
      next: ResolvedCycleOccurrence | null;
      minutesUntilNext: number | null;
      mealTargetTime: string | null;
    }
  | {
      state: "UPCOMING";
      next: ResolvedCycleOccurrence;
      minutesUntilNext: number;
      mealTargetTime: string | null;
    }
  | {
      state: "BETWEEN";
      previous: ResolvedCycleOccurrence;
      next: ResolvedCycleOccurrence;
      minutesUntilNext: number;
      mealTargetTime: string | null;
    }
  | {
      state: "DAY_COMPLETE";
      last: ResolvedCycleOccurrence;
      mealTargetTime: string | null;
    };

export type CycleValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type CycleValidationResult = {
  valid: boolean;
  errors: CycleValidationIssue[];
  warnings: CycleValidationIssue[];
};

export type CycleDraftInput = {
  label: string;
  description?: string | null;
  cycleType: OperationalCycleType;
  displaySequence?: number;
  startLocal: string;
  endLocal: string;
  overnight?: boolean;
  applicableDaysOfWeek: number[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  mealType?: MealType | null;
  locationMode?: OperationalCycleLocationMode;
  applicableUnitTypes?: UnitType[];
  unitIds?: string[];
  expectedMilestones?: ServeryMilestone[];
  /** When set, creates a new version of an existing stableKey. */
  stableKey?: string;
};

export type UnitMealTarget = {
  mealType: MealType;
  scheduledTime: string;
};

export type CycleUnitScope = {
  id: string;
  unitType: UnitType;
};
