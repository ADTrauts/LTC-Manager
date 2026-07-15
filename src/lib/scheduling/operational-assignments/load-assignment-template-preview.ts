import { prisma } from "@/lib/prisma";

import { suggestEmployeeForPosition } from "./build-assignment-suggestions";
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
    where: { id: input.templateId, facilityId: input.facilityId, isActive: true },
    select: {
      id: true,
      name: true,
      operationDefinitionId: true,
      operationDefinition: { select: { label: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          roleKey: true,
          roleLabel: true,
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

  if (!template) {
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
      warnings: ["Template not found or inactive."],
    };
  }

  let operationInstanceId: string | null = null;
  let operationLabel: string | null = template.operationDefinition?.label ?? null;

  if (template.operationDefinitionId) {
    const dateStart = new Date(`${input.serviceDate}T00:00:00`);
    const instance = await prisma.operationInstance.findFirst({
      where: {
        definitionId: template.operationDefinitionId,
        serviceDate: dateStart,
        facilityId: input.facilityId,
        status: { in: ["SCHEDULED", "PREPARATION", "EXECUTION"] },
      },
      select: { id: true, label: true },
    });
    if (instance) {
      operationInstanceId = instance.id;
      operationLabel = instance.label;
    }
  }

  const activeAssignments = boardAssignments.filter(
    (a) => a.status === "PLANNED" || a.status === "ACTIVE",
  );

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
      startsAtLocal: rawItem.startsAtLocal,
      endsAtLocal: rawItem.endsAtLocal,
      requiredCount: rawItem.requiredCount,
      sortOrder: rawItem.sortOrder,
      notes: rawItem.notes,
    };

    for (let i = 0; i < item.requiredCount; i++) {
      const existing = findExistingMatch(activeAssignments, item, i, positions);

      const suggestion = existing
        ? null
        : suggestEmployeeForPosition({
            roleKey: item.roleKey,
            unitId: item.unitId,
            scheduledEmployees: boardEmployees,
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

  if (template.operationDefinitionId && !operationInstanceId) {
    warnings.push("No operation instance found for this date. Assignments will use the service date only.");
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
  positionIndex: number,
  alreadyMatchedPositions: TemplatePreviewPosition[],
): { employeeId: string; employeeName: string; assignmentId: string } | null {
  const alreadyUsedIds = new Set(
    alreadyMatchedPositions
      .filter((p) => p.existingAssignmentId)
      .map((p) => p.existingAssignmentId!),
  );

  const match = assignments.find(
    (a) =>
      a.roleKey === item.roleKey &&
      (item.unitId ? a.unitId === item.unitId : true) &&
      !alreadyUsedIds.has(a.id),
  );

  if (!match) return null;

  return {
    employeeId: match.employeeId,
    employeeName: `Employee ${match.employeeId.slice(-4)}`,
    assignmentId: match.id,
  };
}
