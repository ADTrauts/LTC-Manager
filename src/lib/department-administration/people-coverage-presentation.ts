/**
 * People & Coverage presentation. No database access and no coverage math.
 * Fill counts come from the canonical evaluator. This module only names them.
 */

export type CoverageAuthoringStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export function coverageStatusLabel(status: CoverageAuthoringStatus): string {
  if (status === "PUBLISHED") return "Published";
  if (status === "RETIRED") return "Retired";
  return "Draft";
}

export type CoverageRequirementSource = {
  id: string;
  status: CoverageAuthoringStatus;
  effectiveFrom: string | null;
  items: ReadonlyArray<{
    id: string;
    roleLabel: string;
    requiredCount: number;
    spaceId: string | null;
    spaceName: string | null;
    applicableOperationalCycleStableKeys: readonly string[];
  }>;
};

export type GroupedCoverageRow = {
  expectationId: string;
  itemId: string;
  roleLabel: string;
  requiredCount: number;
  status: CoverageAuthoringStatus;
  statusLabel: string;
  effectiveFrom: string | null;
};

export type GroupedCoveragePeriod = {
  periodLabel: string;
  rows: GroupedCoverageRow[];
};

export type GroupedCoverageLocation = {
  locationName: string;
  periods: GroupedCoveragePeriod[];
};

export function groupCoverageRequirements(
  expectations: readonly CoverageRequirementSource[],
  cycles: readonly { stableKey: string; label: string }[],
): GroupedCoverageLocation[] {
  const cycleLabel = new Map(cycles.map((cycle) => [cycle.stableKey, cycle.label]));
  const locations = new Map<string, Map<string, GroupedCoverageRow[]>>();

  for (const expectation of expectations) {
    for (const item of expectation.items) {
      const locationName = item.spaceName?.trim() || "No location";
      const periodKeys =
        item.applicableOperationalCycleStableKeys.length > 0
          ? item.applicableOperationalCycleStableKeys
          : ["__none__"];
      const periods = locations.get(locationName) ?? new Map<string, GroupedCoverageRow[]>();
      for (const key of periodKeys) {
        const periodLabel = key === "__none__" ? "No period" : (cycleLabel.get(key) ?? key);
        const rows = periods.get(periodLabel) ?? [];
        rows.push({
          expectationId: expectation.id,
          itemId: item.id,
          roleLabel: item.roleLabel,
          requiredCount: item.requiredCount,
          status: expectation.status,
          statusLabel: coverageStatusLabel(expectation.status),
          effectiveFrom: expectation.effectiveFrom,
        });
        periods.set(periodLabel, rows);
      }
      locations.set(locationName, periods);
    }
  }

  return [...locations.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([locationName, periods]) => ({
      locationName,
      periods: [...periods.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([periodLabel, rows]) => ({ periodLabel, rows })),
    }));
}

export type TodayCoverageInputRow = {
  spaceName?: string | null;
  unitName: string;
  cycleLabel?: string | null;
  roleLabel: string;
  requiredCount: number;
  filledCount: number;
  state: string;
};

export type TodayCoverageRowView = {
  locationName: string;
  periodLabel: string;
  roleLabel: string;
  required: number;
  assigned: number;
  shortfall: number;
  label: string;
};

export type TodayCoverageView = {
  configured: boolean;
  serviceDateKey: string;
  headline: string;
  rows: TodayCoverageRowView[];
};

function attentionLabel(row: TodayCoverageInputRow): string {
  if (row.state === "AT_RISK" && row.filledCount >= row.requiredCount) return "At risk";
  if (row.filledCount < row.requiredCount) return "Short";
  if (row.state === "NOT_CONFIRMED") return "Not confirmed";
  if (row.state === "UNCOVERED" || row.state === "NOT_YET_ASSIGNED") return "Not assigned";
  return "Needs attention";
}

export function presentTodayCoverage(input: {
  serviceDateKey: string;
  rows: readonly TodayCoverageInputRow[];
}): TodayCoverageView {
  if (input.rows.length === 0) {
    return {
      configured: false,
      serviceDateKey: input.serviceDateKey,
      headline: "Coverage not configured",
      rows: [],
    };
  }

  const rows = input.rows
    .filter(
      (row) =>
        row.filledCount < row.requiredCount ||
        row.state === "AT_RISK" ||
        row.state === "UNCOVERED" ||
        row.state === "NOT_YET_ASSIGNED" ||
        row.state === "NOT_CONFIRMED",
    )
    .map((row) => ({
      locationName: row.spaceName?.trim() || row.unitName,
      periodLabel: row.cycleLabel?.trim() || "Period",
      roleLabel: row.roleLabel,
      required: row.requiredCount,
      assigned: row.filledCount,
      shortfall: Math.max(0, row.requiredCount - row.filledCount),
      label: attentionLabel(row),
    }));

  return {
    configured: true,
    serviceDateKey: input.serviceDateKey,
    headline: rows.length === 0 ? "Required staffing is assigned" : "Staffing needs attention",
    rows,
  };
}

/**
 * A deep link may name a Department. Use it when that Department is visible.
 * `visibleDepartmentIds === null` means the authority flag is off and the
 * facility's Departments are visible. This does not write the shell cookie.
 */
export function resolveDirectoryDepartmentId(input: {
  requestedDepartmentId: string | null | undefined;
  shellDepartmentId: string | null;
  visibleDepartmentIds: ReadonlySet<string> | null;
}): string | null {
  const requested = input.requestedDepartmentId?.trim() ?? "";
  if (
    requested &&
    (input.visibleDepartmentIds === null || input.visibleDepartmentIds.has(requested))
  ) {
    return requested;
  }
  return input.shellDepartmentId;
}
