import type { TemplateItemView, TemplateView } from "./template-types";
import type { AssignmentBoardEntry } from "./types";
import { isCoverageTemplateEffectiveOnDate } from "../coverage-expectations/publication";

export type FulfillmentPosition = {
  itemId: string;
  roleKey: string;
  roleLabel: string;
  unitId: string | null;
  unitName: string | null;
  spaceId: string | null;
  spaceName: string | null;
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
  serviceDate: string;
}): AssignmentFulfillmentSummary {
  const { templates, assignments } = input;

  const activeTemplates = templates.filter((template) => template.status != null &&
    isCoverageTemplateEffectiveOnDate({ ...template, status: template.status,
      effectiveFrom: template.effectiveFrom ?? null, effectiveTo: template.effectiveTo ?? null }, input.serviceDate));
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
          spaceId: item.spaceId ?? null,
          spaceName: item.spaceName ?? null,
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
      assignmentMatchesCoverageItem(a, item) &&
      !usedIds.has(a.id),
  ) ?? null;
}

/** Missing targets never become Department-wide staffing. */
export function assignmentMatchesCoverageItem(assignment: AssignmentBoardEntry, item: TemplateItemView): boolean {
  if (assignment.roleKey !== item.roleKey) return false;
  if (Boolean(item.spaceId) === Boolean(item.unitId)) return false;
  if (item.spaceId) {
    return assignment.spaceIds?.includes(item.spaceId) === true ||
      (assignment.scopeKind === "UNIT" && item.spaceUnitId != null && assignment.unitId === item.spaceUnitId);
  }
  return assignment.scopeKind === "UNIT" && assignment.unitId === item.unitId;
}
