import { prisma } from "@/lib/prisma";
import { isCoverageTemplateEffectiveOnDate } from "@/lib/scheduling/coverage-expectations/publication";

import { suggestEmployeeForPosition } from "./build-assignment-suggestions";
import { assignmentMatchesCoverageItem } from "./build-assignment-fulfillment";
import type { AssignmentBoardEmployee, AssignmentBoardEntry } from "./types";
import type { TemplatePreview, TemplatePreviewPosition, TemplateItemView } from "./template-types";

export type LoadTemplatePreviewInput = {
  templateId: string;
  facilityId: string;
  departmentId: string;
  serviceDate: string;
};

export async function loadAssignmentTemplatePreview(
  input: LoadTemplatePreviewInput,
  boardEmployees: AssignmentBoardEmployee[],
  boardAssignments: AssignmentBoardEntry[],
): Promise<TemplatePreview> {
  const template = await prisma.operationalAssignmentTemplate.findFirst({
    where: { id: input.templateId, facilityId: input.facilityId, departmentId: input.departmentId, isActive: true },
    select: {
      id: true,
      name: true,
      status: true,
      isActive: true,
      effectiveFrom: true,
      effectiveTo: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          roleKey: true,
          roleLabel: true,
          spaceId: true,
          space: { select: { name: true, unitId: true } },
          unitId: true,
          unit: { select: { name: true } },
          startsAtLocal: true,
          endsAtLocal: true,
          requiredCount: true,
          sortOrder: true,
          notes: true,
        },
      },
    },
  });

  if (!template || !isCoverageTemplateEffectiveOnDate(template, input.serviceDate)) {
    return {
      templateId: input.templateId,
      templateName: "Template not found",
      serviceDate: input.serviceDate,
      operationInstanceId: null,
      operationLabel: null,
      positions: [],
      totalRequired: 0,
      alreadyFilled: 0,
      unfilled: 0,
      warnings: [
        template
          ? "Only a published Coverage requirement that is effective on this service date can be applied."
          : "Template not found or inactive.",
      ],
    };
  }

  const operationInstanceId: string | null = null;
  const operationLabel: string | null = null;

  const activeAssignments = boardAssignments.filter(
    (a) => a.status === "PLANNED" || a.status === "ACTIVE",
  );

  const qualifications = await prisma.employeeOperationalRoleQualification.findMany({
    where: { facilityId: input.facilityId, departmentId: input.departmentId, status: "ACTIVE",
      employeeId: { in: boardEmployees.map(employee => employee.id) } }, select: { employeeId: true, roleKey: true },
  });
  const qualified = new Set(qualifications.map(row => `${row.employeeId}:${row.roleKey}`));

  const positions: TemplatePreviewPosition[] = [];
  const warnings: string[] = [];
  const alreadySuggestedIds = new Set<string>();
  let alreadyFilled = 0;

  for (const rawItem of template.items) {
    const item: TemplateItemView = {
      id: rawItem.id,
      roleKey: rawItem.roleKey,
      roleLabel: rawItem.roleLabel,
      unitId: rawItem.unitId,
      unitName: rawItem.unit?.name ?? null,
      spaceId: rawItem.spaceId, spaceName: rawItem.space?.name ?? null, spaceUnitId: rawItem.space?.unitId ?? null,
      startsAtLocal: rawItem.startsAtLocal,
      endsAtLocal: rawItem.endsAtLocal,
      requiredCount: rawItem.requiredCount,
      sortOrder: rawItem.sortOrder,
      notes: rawItem.notes,
    };

    for (let i = 0; i < item.requiredCount; i++) {
      const existing = findExistingMatch(activeAssignments, item, positions);

      const suggestion = existing
        ? null
        : suggestEmployeeForPosition({
            roleKey: item.roleKey,
            unitId: item.unitId,
            scheduledEmployees: boardEmployees.filter(employee => qualified.has(`${employee.id}:${item.roleKey}`)),
            existingAssignments: activeAssignments,
            alreadySuggestedIds,
          });

      if (suggestion) {
        alreadySuggestedIds.add(suggestion.employeeId);
      }
      if (existing) alreadyFilled++;

      positions.push({
        itemId: item.id,
        roleKey: item.roleKey,
        roleLabel: item.roleLabel,
        unitId: item.unitId,
        unitName: item.unitName,
        spaceId: item.spaceId, spaceName: item.spaceName, spaceUnitId: item.spaceUnitId,
        startsAtLocal: item.startsAtLocal,
        endsAtLocal: item.endsAtLocal,
        notes: item.notes,
        positionIndex: i,
        assignedEmployeeId: existing?.employeeId ?? null,
        assignedEmployeeName: existing?.employeeName ?? null,
        existingAssignmentId: existing?.assignmentId ?? null,
        suggestedEmployeeId: suggestion?.employeeId ?? null,
        suggestedEmployeeName: suggestion?.employeeName ?? null,
        suggestedReason: suggestion?.reason ?? (existing ? null : "No eligible employee found"),
      });
    }
  }

  const totalRequired = positions.length;
  const unfilled = totalRequired - alreadyFilled - positions.filter((p) => !p.existingAssignmentId && p.suggestedEmployeeId).length;

  return {
    templateId: template.id,
    templateName: template.name,
    serviceDate: input.serviceDate,
    operationInstanceId,
    operationLabel,
    positions,
    totalRequired,
    alreadyFilled,
    unfilled: Math.max(0, unfilled),
    warnings,
  };
}

function findExistingMatch(
  assignments: AssignmentBoardEntry[],
  item: TemplateItemView,
  alreadyMatchedPositions: TemplatePreviewPosition[],
): { employeeId: string; employeeName: string; assignmentId: string } | null {
  const alreadyUsedIds = new Set(
    alreadyMatchedPositions
      .filter((p) => p.existingAssignmentId)
      .map((p) => p.existingAssignmentId!),
  );

  const usedEmployeeIds = new Set(alreadyMatchedPositions.filter(row => row.itemId === item.id).map(row => row.assignedEmployeeId));
  const match = assignments.find(
    (a) =>
      assignmentMatchesCoverageItem(a, item) &&
      !alreadyUsedIds.has(a.id) && !usedEmployeeIds.has(a.employeeId),
  );

  if (!match) return null;

  return {
    employeeId: match.employeeId,
    employeeName: `Employee ${match.employeeId.slice(-4)}`,
    assignmentId: match.id,
  };
}
