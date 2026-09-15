import type {
  MealType,
  OperationalCycleLocationMode,
  OperationalCycleNodeKind,
  OperationalCycleStatus,
  OperationalCycleType,
  ServeryMilestone,
  UnitType,
} from "@prisma/client";

/** Key Time due-time group with explicit room membership (Build). */
export type KeyTimeGroupDefinition = {
  /** Present on published DB rows; optional in draft validation fixtures. */
  id?: string;
  dueLocal: string;
  spaceIds: string[];
  displaySequence?: number;
};

/** Cycle definition fields shared by builders and the pure resolver. */
export type OperationalCycleDefinition = {
  id: string;
  stableKey: string;
  /** Logical parent identity. Null = top-level. Versioned with this row. */
  parentStableKey: string | null;
  /** PERIOD = operating window; KEY_TIME = checkpoint with due-time groups. */
  nodeKind: OperationalCycleNodeKind;
  version: number;
  label: string;
  description: string | null;
  cycleType: OperationalCycleType;
  displaySequence: number;
  /** Required for PERIOD; null for KEY_TIME. */
  startLocal: string | null;
  /** Required for PERIOD; null for KEY_TIME. */
  endLocal: string | null;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  mealType: MealType | null;
  locationMode: OperationalCycleLocationMode;
  /** When true (nested PERIOD only), effective rooms come from the immediate parent. */
  locationInheritFromParent: boolean;
  applicableUnitTypes: UnitType[];
  /** Facility Room Type preset key when locationMode = ROOM_TYPE. */
  roomTypeKey: string | null;
  expectedMilestones: ServeryMilestone[];
  status: OperationalCycleStatus;
  /** Explicit unit ids when locationMode = EXPLICIT_UNITS. */
  unitIds: string[];
  /** Explicit room/space ids when locationMode = EXPLICIT_UNITS. */
  spaceIds: string[];
  /** Versioned configured milestone times (Neighborhood/Unit grain). */
  milestoneTimes: Array<{
    unitId: string;
    milestone: ServeryMilestone;
    configuredTime: string;
  }>;
  /** Build Key Time due-time groups (KEY_TIME nodes only). */
  keyTimeGroups: KeyTimeGroupDefinition[];
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
  /** Hierarchy from effective published versions for this service date. */
  parentStableKey: string | null;
  depth: number;
  /** e.g. "Breakfast → Servery Service" */
  displayPath: string;
  ancestorLabels: string[];
  hasChildren: boolean;
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
  nodeKind?: OperationalCycleNodeKind;
  displaySequence?: number;
  startLocal?: string | null;
  endLocal?: string | null;
  overnight?: boolean;
  applicableDaysOfWeek: number[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  mealType?: MealType | null;
  locationMode?: OperationalCycleLocationMode;
  locationInheritFromParent?: boolean;
  applicableUnitTypes?: UnitType[];
  unitIds?: string[];
  spaceIds?: string[];
  keyTimeGroups?: KeyTimeGroupDefinition[];
  roomTypeKey?: string | null;
  expectedMilestones?: ServeryMilestone[];
  milestoneTimes?: Array<{
    unitId: string;
    milestone: ServeryMilestone;
    configuredTime: string;
  }>;
  /** When set, creates a new version of an existing stableKey. */
  stableKey?: string;
  /** Logical parent stableKey. Null/omit = top-level. */
  parentStableKey?: string | null;
};

export type UnitMealTarget = {
  mealType: MealType;
  scheduledTime: string;
};

export type CycleUnitScope = {
  id: string;
  unitType: UnitType;
  /** Child Room Type preset keys — used for ROOM_TYPE applicability. */
  childRoomTypeKeys?: string[];
  /** Space ids under this location — used for EXPLICIT_UNITS space matching. */
  spaceIds?: string[];
};
