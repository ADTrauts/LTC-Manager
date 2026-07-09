import { ShiftType, UnitType, type MealType } from "@prisma/client";

import type { OperationContext, OperationsCenterUnitCard } from "@/lib/operations-center";

export type CoverageLevel = "none" | "thin" | "covered";

export type CoverageAssignment = {
  shift: ShiftType;
  employeeName: string;
};

export type CoverageItem = {
  unitId: string;
  unitName: string;
  unitType: UnitType;
  level: CoverageLevel;
  staffingCount: number;
  expectedSlots: number | null;
  missingShifts: ShiftType[];
  assignments: CoverageAssignment[];
  overrideCount: number;
  reason: string;
  staffingHref: string;
  unitHref: string;
};

export type CoverageSummary = {
  total: number;
  gaps: number;
  thin: number;
  covered: number;
};

export type CoverageData = {
  items: CoverageItem[];
  summary: CoverageSummary;
  operationContext: OperationContext;
  priorityGap: CoverageItem | null;
  dateIso: string;
};

export type CoverageScheduleEntry = {
  employeeId: string;
  unitId: string;
  shift: ShiftType;
  employeeFirstName: string;
  employeeLastName: string;
};

export type CoverageOverrideEntry = {
  employeeId: string;
  oldUnitId: string | null;
  newUnitId: string;
  mealType: MealType | null;
};

const SERVERY_SHIFTS: ShiftType[] = [ShiftType.BREAKFAST, ShiftType.LUNCH, ShiftType.DINNER];

const LEVEL_RANK: Record<CoverageLevel, number> = {
  none: 0,
  thin: 1,
  covered: 2,
};

const SHIFT_LABEL: Record<ShiftType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  FULL_DAY: "Full day",
};

export function formatCoverageShift(shift: ShiftType): string {
  return SHIFT_LABEL[shift] ?? shift;
}

export function buildStaffingHref(dateIso: string, unitId: string): string {
  return `/staffing?date=${dateIso}#staffing-unit-${unitId}`;
}

function countOverridesForUnit(
  unitId: string,
  overrides: CoverageOverrideEntry[],
): number {
  return overrides.filter((override) => override.oldUnitId === unitId || override.newUnitId === unitId).length;
}

function buildEffectiveAssignmentsByUnit(
  schedules: CoverageScheduleEntry[],
  overrides: CoverageOverrideEntry[],
): Map<string, CoverageAssignment[]> {
  const effectiveUnitByEmployee = new Map<
    string,
    { unitId: string; shift: ShiftType; employeeName: string }
  >();

  for (const entry of schedules) {
    effectiveUnitByEmployee.set(entry.employeeId, {
      unitId: entry.unitId,
      shift: entry.shift,
      employeeName: `${entry.employeeFirstName} ${entry.employeeLastName}`,
    });
  }

  for (const override of overrides) {
    const current = effectiveUnitByEmployee.get(override.employeeId);
    if (current) {
      effectiveUnitByEmployee.set(override.employeeId, {
        ...current,
        unitId: override.newUnitId,
      });
    }
  }

  const byUnit = new Map<string, CoverageAssignment[]>();
  for (const assignment of effectiveUnitByEmployee.values()) {
    const list = byUnit.get(assignment.unitId) ?? [];
    list.push({ shift: assignment.shift, employeeName: assignment.employeeName });
    byUnit.set(assignment.unitId, list);
  }

  for (const list of byUnit.values()) {
    list.sort((a, b) => formatCoverageShift(a.shift).localeCompare(formatCoverageShift(b.shift)));
  }

  return byUnit;
}

function resolveMissingServeryShifts(assignments: CoverageAssignment[]): ShiftType[] {
  const filled = new Set(assignments.map((item) => item.shift));
  return SERVERY_SHIFTS.filter((shift) => !filled.has(shift));
}

export function resolveCoverageLevel(
  unit: OperationsCenterUnitCard,
  assignments: CoverageAssignment[],
  missingShifts?: ShiftType[],
): CoverageLevel {
  if (unit.staffingCount === 0) {
    return "none";
  }
  if (unit.unitType === UnitType.SERVERY) {
    const unresolvedShifts = missingShifts ?? resolveMissingServeryShifts(assignments);
    if (unresolvedShifts.length > 0) {
      return "thin";
    }
  }
  return "covered";
}

export function resolveCoverageReason(
  unit: OperationsCenterUnitCard,
  level: CoverageLevel,
  missingShifts: ShiftType[],
  overrideCount: number,
): string {
  if (level === "none") {
    if (unit.unitType === UnitType.SERVERY) {
      return "No meal service slots staffed today";
    }
    return "No staff scheduled today";
  }
  if (level === "thin" && missingShifts.length > 0) {
    const labels = missingShifts.map((shift) => formatCoverageShift(shift).toLowerCase());
    return `Missing ${labels.join(", ")} coverage`;
  }
  if (overrideCount > 0) {
    return `${overrideCount} coverage override${overrideCount === 1 ? "" : "s"} today`;
  }
  return `${unit.staffingCount} scheduled today`;
}

export function buildCoverageItems(args: {
  unitCards: OperationsCenterUnitCard[];
  schedules: CoverageScheduleEntry[];
  overrides: CoverageOverrideEntry[];
  dateIso: string;
  mealScope?: MealType;
}): CoverageItem[] {
  const expectedShifts =
    args.mealScope === undefined ? SERVERY_SHIFTS : [args.mealScope as ShiftType];
  const assignmentsByUnit = buildEffectiveAssignmentsByUnit(args.schedules, args.overrides);

  return args.unitCards
    .map((unit) => {
      const assignments = assignmentsByUnit.get(unit.id) ?? [];
      const missingShifts =
        unit.unitType === UnitType.SERVERY
          ? expectedShifts.filter((shift) => !assignments.some((item) => item.shift === shift))
          : [];
      const overrideCount = countOverridesForUnit(unit.id, args.overrides);
      const level = resolveCoverageLevel(unit, assignments, missingShifts);

      return {
        unitId: unit.id,
        unitName: unit.name,
        unitType: unit.unitType,
        level,
        staffingCount: unit.staffingCount,
        expectedSlots: unit.unitType === UnitType.SERVERY ? expectedShifts.length : null,
        missingShifts,
        assignments,
        overrideCount,
        reason: resolveCoverageReason(unit, level, missingShifts, overrideCount),
        staffingHref: buildStaffingHref(args.dateIso, unit.id),
        unitHref: `/unit/${unit.id}`,
      };
    })
    .sort((a, b) => {
      const levelDiff = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
      if (levelDiff !== 0) return levelDiff;
      if (b.missingShifts.length !== a.missingShifts.length) {
        return b.missingShifts.length - a.missingShifts.length;
      }
      if (a.staffingCount !== b.staffingCount) {
        return a.staffingCount - b.staffingCount;
      }
      return a.unitName.localeCompare(b.unitName);
    });
}

export function summarizeCoverage(items: CoverageItem[]): CoverageSummary {
  let gaps = 0;
  let thin = 0;
  let covered = 0;
  for (const item of items) {
    if (item.level === "none") gaps += 1;
    else if (item.level === "thin") thin += 1;
    else covered += 1;
  }
  return { total: items.length, gaps, thin, covered };
}
