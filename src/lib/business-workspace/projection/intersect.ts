/**
 * Wave 15K — intersect live Workspace inputs with Projection eligibility.
 * Never broadens. Documents remaining broad queries via counts.
 */

import { summarizeReadiness } from "@/lib/readiness";
import { summarizeCallDowns } from "@/lib/todays-work/call-down";

import type {
  BusinessWorkspaceInputs,
  WorkspaceActivityRaw,
} from "../load-workspace-inputs";
import type { WorkspaceCompositionConfig } from "../workspace-composition";
import type { WorkspaceSectionId } from "../types";

import type {
  BwContributionKind,
  ProjectedBusinessWorkspaceScope,
} from "./types";

const ALL_SECTIONS: WorkspaceSectionId[] = [
  "manager_focus",
  "management_agenda",
  "quick_actions",
  "priorities",
  "department_health",
  "todays_work",
  "operations",
  "performance",
  "recent_activity",
];

function filterActivity(
  activity: WorkspaceActivityRaw,
  allowedUnits: Set<string> | null,
  allowedDepartments: Set<string>,
  kinds: Set<BwContributionKind>,
): WorkspaceActivityRaw {
  const keepDept = (key: string | null) =>
    key == null || allowedDepartments.has(key);

  const repairsOk = kinds.has("issues_repairs") || kinds.has("assets");
  const inspectionsOk = kinds.has("inspections");

  return {
    repairsOpened: repairsOk
      ? activity.repairsOpened.filter((r) => keepDept(r.departmentKey))
      : [],
    repairsResolved: repairsOk
      ? activity.repairsResolved.filter((r) => keepDept(r.departmentKey))
      : [],
    inspectionsCompleted: inspectionsOk
      ? activity.inspectionsCompleted.filter((r) => keepDept(r.departmentKey))
      : [],
    knowledgePublished: activity.knowledgePublished.filter((r) =>
      keepDept(r.departmentKey),
    ),
  };
}

/**
 * Composition config derived from Projection — replaces department-key COMPOSITIONS
 * as the eligibility source when the Workspace Projection flag is on.
 */
export function resolveProjectedCompositionConfig(
  scope: ProjectedBusinessWorkspaceScope,
): WorkspaceCompositionConfig {
  const label =
    scope.lensMode === "FACILITY"
      ? "Facility Overview"
      : scope.departmentSections[0]?.label ??
        (scope.departmentKey ?? "Workspace");

  const ops = new Set<string>(["oc", "issues", "inspections", "knowledge", "employees"]);
  if (scope.allowedQuickActionIds.includes("assets")) ops.add("assets");
  if (scope.allowedQuickActionIds.includes("logs")) ops.add("logs");
  if (!scope.allowedQuickActionIds.includes("report-issue")) {
    ops.delete("issues");
  }

  return {
    contextLabel: label,
    contextDescription: "Projected operational priorities for this lens.",
    visibleSectionIds: ALL_SECTIONS,
    operationsLinkIds: [...ops],
    todaysWorkLinkIds: ["walk", "coverage", "calldowns", "handoffs"],
    quickActionIds: [...scope.allowedQuickActionIds],
    showLogCompletion: scope.showLogCompletion,
    showMealContext: scope.showMealContext,
  };
}

/**
 * Intersect facility/live Workspace inputs to projected Units + contribution kinds.
 */
export function intersectInputsToProjectedScope(
  inputs: BusinessWorkspaceInputs,
  scope: ProjectedBusinessWorkspaceScope,
): BusinessWorkspaceInputs {
  const allowedUnits = new Set(scope.projectedUnitIds);
  const allowedDepartments = new Set(
    scope.departmentSections
      .map((s) => s.departmentKey)
      .filter((k): k is NonNullable<typeof k> => k != null),
  );
  const kinds = new Set(
    scope.managerSignalContributors.flatMap((c) => c.contributionKinds),
  );

  const scopedReadinessItems = inputs.readiness.items.filter((item) =>
    allowedUnits.has(item.unitId),
  );
  const scopedSummary = summarizeReadiness(scopedReadinessItems);

  const includeRepairs = kinds.has("issues_repairs") || kinds.has("assets");
  const includeInspections = kinds.has("inspections");
  const includeStaffing = kinds.has("staffing") || kinds.has("assignments");

  const scopedRepairs = includeRepairs
    ? inputs.openRepairs.filter(
        (r) =>
          allowedUnits.has(r.unitId) &&
          (r.departmentKey == null ||
            allowedDepartments.size === 0 ||
            allowedDepartments.has(r.departmentKey)),
      )
    : [];

  const scopedInspections = includeInspections
    ? inputs.inspectionsDue.filter((i) => {
        if (i.unitId != null && !allowedUnits.has(i.unitId)) return false;
        if (
          i.departmentKey != null &&
          allowedDepartments.size > 0 &&
          !allowedDepartments.has(i.departmentKey)
        ) {
          return false;
        }
        // Facility-level inspection with no unit: only if department projects.
        if (i.unitId == null) {
          return (
            i.departmentKey != null && allowedDepartments.has(i.departmentKey)
          );
        }
        return true;
      })
    : [];

  const scopedUnitsMissing = includeStaffing
    ? inputs.dashboard.unitsMissingStaffing.filter((u) =>
        allowedUnits.has(u.id),
      )
    : [];
  const scopedExceptions = inputs.dashboard.unitsWithExceptions.filter((u) =>
    allowedUnits.has(u.id),
  );

  const scopedCallDownItems = includeStaffing
    ? inputs.dashboard.callDowns
      ? inputs.dashboard.callDowns.items.filter(
          (item) =>
            allowedUnits.has(item.newUnitId) ||
            (item.oldUnitId != null && allowedUnits.has(item.oldUnitId)),
        )
      : []
    : [];
  const scopedCallDownSummary = summarizeCallDowns(scopedCallDownItems);

  const unitCards = inputs.dashboard.unitCards.filter((u) =>
    allowedUnits.has(u.id),
  );
  const totals = unitCards.reduce(
    (acc, unit) => {
      acc.expected += unit.expected;
      acc.completed += unit.completed;
      acc.failed += unit.failed;
      acc.missed += unit.missed;
      acc.pending += unit.pending;
      return acc;
    },
    { expected: 0, completed: 0, failed: 0, missed: 0, pending: 0 },
  );

  const mealBoards = scope.showMealContext
    ? inputs.dashboard.mealBoards.map((board) => ({
        ...board,
        rows: board.rows.filter((row) => allowedUnits.has(row.unitId)),
      }))
    : inputs.dashboard.mealBoards.map((board) => ({ ...board, rows: [] }));

  const activeDepartmentKeys =
    allowedDepartments.size > 0
      ? ([...allowedDepartments] as BusinessWorkspaceInputs["activeDepartmentKeys"])
      : inputs.activeDepartmentKeys;

  // Assignment fulfillment only when assignments contribute and flag already loaded it.
  const assignmentSummary =
    kinds.has("assignments") || kinds.has("staffing")
      ? inputs.assignmentSummary
      : undefined;

  return {
    ...inputs,
    readiness: {
      ...inputs.readiness,
      items: scopedReadinessItems,
      summary: scopedSummary,
    },
    openRepairs: scopedRepairs,
    inspectionsDue: scopedInspections,
    callDownSummary: scopedCallDownSummary,
    assignmentSummary,
    activeDepartmentKeys,
    dashboard: {
      ...inputs.dashboard,
      unitCount: unitCards.length,
      unitCards,
      totals: scope.showLogCompletion
        ? totals
        : { expected: 0, completed: 0, failed: 0, missed: 0, pending: 0 },
      unitsMissingStaffing: scopedUnitsMissing,
      unitsWithExceptions: scopedExceptions,
      mealBoards,
      openRepairCount: scopedRepairs.length,
      urgentRepairCount: scopedRepairs.filter((r) => r.priority === "URGENT")
        .length,
      callDowns: inputs.dashboard.callDowns
        ? {
            ...inputs.dashboard.callDowns,
            items: scopedCallDownItems,
            summary: scopedCallDownSummary,
          }
        : undefined,
    },
    activity: filterActivity(
      inputs.activity,
      allowedUnits,
      allowedDepartments,
      kinds,
    ),
  };
}

export function countWorkspaceInputRows(inputs: BusinessWorkspaceInputs): number {
  return (
    inputs.readiness.items.length +
    inputs.openRepairs.length +
    inputs.inspectionsDue.length +
    inputs.dashboard.unitCards.length +
    inputs.activity.repairsOpened.length +
    inputs.activity.repairsResolved.length +
    inputs.activity.inspectionsCompleted.length +
    inputs.activity.knowledgePublished.length
  );
}
