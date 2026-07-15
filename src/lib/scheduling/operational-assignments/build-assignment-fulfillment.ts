import type { TemplateItemView, TemplateView } from "./template-types";
import type { AssignmentBoardEntry } from "./types";

export type FulfillmentPosition = {
  itemId: string;
  roleKey: string;
  roleLabel: string;
  unitId: string | null;
  unitName: string | null;
  positionIndex: number;
  filledByAssignmentId: string | null;
  filledByEmployeeId: string | null;
};

export type AssignmentFulfillmentSummary = {
  available: true;
  requiredPositions: number;
  filledPositions: number;
  unfilledPositions: number;
  conflicts: number;
  scheduledOnlyEmployees: number;
  activeCoverageAssignments: number;
  positions: FulfillmentPosition[];
} | {
  available: false;
};

/**
 * Build a deterministic fulfillment summary from active templates and current assignments.
 * Pure function — no database calls.
 */
export function buildAssignmentFulfillmentSummary(input: {
  templates: TemplateView[];
  assignments: AssignmentBoardEntry[];
  scheduledEmployeeCount: number;
}): AssignmentFulfillmentSummary {
  const { templates, assignments } = input;

  const activeTemplates = templates.filter((t) => t.isActive);
  if (activeTemplates.length === 0) {
    return { available: false };
  }

  const activeAssignments = assignments.filter(
    (a) => a.status === "PLANNED" || a.status === "ACTIVE",
  );

  const usedAssignmentIds = new Set<string>();
  const positions: FulfillmentPosition[] = [];

  for (const template of activeTemplates) {
    for (const item of template.items) {
      for (let i = 0; i < item.requiredCount; i++) {
        const match = findFulfillingAssignment(activeAssignments, item, usedAssignmentIds);
        if (match) {
          usedAssignmentIds.add(match.id);
        }
        positions.push({
          itemId: item.id,
          roleKey: item.roleKey,
          roleLabel: item.roleLabel,
          unitId: item.unitId,
          unitName: item.unitName,
          positionIndex: i,
          filledByAssignmentId: match?.id ?? null,
          filledByEmployeeId: match?.employeeId ?? null,
        });
      }
    }
  }

  const filledPositions = positions.filter((p) => p.filledByAssignmentId).length;
  const unfilledPositions = positions.length - filledPositions;

  const assignedEmployeeIds = new Set(
    activeAssignments.map((a) => a.employeeId),
  );
  const scheduledOnlyEmployees = input.scheduledEmployeeCount - assignedEmployeeIds.size;

  const activeCoverageAssignments = activeAssignments.filter(
    (a) => a.source === "COVERAGE" || a.source === "REASSIGNMENT",
  ).length;

  const employeeRoleCount = new Map<string, number>();
  for (const a of activeAssignments) {
    employeeRoleCount.set(a.employeeId, (employeeRoleCount.get(a.employeeId) ?? 0) + 1);
  }
  const conflicts = [...employeeRoleCount.values()].filter((c) => c > 1).length;

  return {
    available: true,
    requiredPositions: positions.length,
    filledPositions,
    unfilledPositions,
    conflicts,
    scheduledOnlyEmployees: Math.max(0, scheduledOnlyEmployees),
    activeCoverageAssignments,
    positions,
  };
}

function findFulfillingAssignment(
  assignments: AssignmentBoardEntry[],
  item: TemplateItemView,
  usedIds: Set<string>,
): AssignmentBoardEntry | null {
  return assignments.find(
    (a) =>
      a.roleKey === item.roleKey &&
      (item.unitId ? a.unitId === item.unitId : true) &&
      !usedIds.has(a.id),
  ) ?? null;
}
